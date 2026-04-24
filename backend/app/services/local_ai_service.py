from __future__ import annotations

import ast
import re
from collections import Counter

from app.models.schemas import ChatMessage, MCQItem, StructuredSummary
from app.services.pipeline_utils import (
    STOPWORDS,
    build_three_paragraph_overview,
    clean_transcript_text,
    dedupe_strings,
    select_top_chunks_for_query,
    split_into_chunks,
    split_sentences,
    tokenize_words,
    validate_structured_summary,
)


def _shorten(text: str, max_chars: int = 180) -> str:
    value = re.sub(r"\s+", " ", (text or "")).strip()
    if len(value) <= max_chars:
        return value
    return value[:max_chars].rsplit(" ", 1)[0] + "..."


def _trim_items(items: list[str], label: str, min_items: int = 4, max_items: int = 8) -> list[str]:
    del label
    del min_items
    values = [_shorten(item, 180) for item in dedupe_strings(items) if len(item.strip()) > 8]
    return values[:max_items]


GENERIC_CHAT_PROMPTS = (
    "explain this simply",
    "explain it simply",
    "explain in simple terms",
    "simple terms",
    "short answer",
    "brief answer",
    "more detail",
    "tell me more",
    "explain more",
    "what about this",
    "why is that",
    "core concept",
    "main concept",
)

GENERIC_SOLVER_PROMPTS = (
    "solve this",
    "solve it",
    "step by step",
    "clear step-by-step reasoning",
    "shortest exam method",
    "final answer",
    "what is the answer",
    "explain the uploaded screenshot",
    "please solve the uploaded image",
)

CONTEXT_REFERENCE_WORDS = {
    "this",
    "that",
    "it",
    "these",
    "those",
    "same",
    "above",
    "previous",
    "earlier",
    "again",
    "more",
}


def _normalize_prompt(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "")).strip()


def _contains_phrase(text: str, phrases: tuple[str, ...]) -> bool:
    lowered = text.lower()
    return any(phrase in lowered for phrase in phrases)


def _is_context_dependent_request(message: str) -> bool:
    lowered = _normalize_prompt(message).lower()
    if not lowered:
        return False

    tokens = set(re.findall(r"[a-z]+", lowered))
    return bool(tokens & CONTEXT_REFERENCE_WORDS) or _contains_phrase(lowered, GENERIC_CHAT_PROMPTS + GENERIC_SOLVER_PROMPTS)


def _is_generic_chat_prompt(message: str) -> bool:
    lowered = _normalize_prompt(message).lower()
    if not lowered:
        return True

    tokens = [token for token in tokenize_words(lowered) if token not in STOPWORDS]
    if _contains_phrase(lowered, GENERIC_CHAT_PROMPTS):
        return True

    return len(tokens) <= 3 and any(word in lowered for word in {"explain", "answer", "summary", "concept", "definition"})


def _is_generic_solver_prompt(message: str) -> bool:
    lowered = _normalize_prompt(message).lower()
    if not lowered:
        return True

    tokens = [token for token in tokenize_words(lowered) if token not in STOPWORDS]
    if _contains_phrase(lowered, GENERIC_SOLVER_PROMPTS):
        return True

    return len(tokens) <= 4 and any(word in lowered for word in {"solve", "answer", "steps", "method", "explain", "help"})


def _find_recent_message(
    history: list[ChatMessage],
    *,
    role: str | None = None,
    exclude_text: str = "",
    skip_generic=None,
) -> str:
    excluded = _normalize_prompt(exclude_text).lower()

    for item in reversed(history):
        if role and item.role != role:
            continue

        content = _normalize_prompt(item.content)
        if not content:
            continue
        if excluded and content.lower() == excluded:
            continue
        if skip_generic and skip_generic(content):
            continue
        return content

    return ""


def _resolve_chat_reference(question: str, history: list[ChatMessage]) -> str:
    normalized = _normalize_prompt(question)
    if not normalized:
        return ""

    if not (_is_context_dependent_request(normalized) or _is_generic_chat_prompt(normalized)):
        return normalized

    previous_user = _find_recent_message(
        history,
        role="user",
        exclude_text=normalized,
        skip_generic=_is_generic_chat_prompt,
    )
    if previous_user:
        return f"{normalized}\nReference topic: {previous_user}"

    previous_assistant = _find_recent_message(history, role="assistant", exclude_text=normalized)
    if previous_assistant:
        return f"{normalized}\nReference answer: {previous_assistant}"

    return normalized


def _resolve_solver_reference(question: str, history: list[ChatMessage]) -> tuple[str, bool]:
    normalized = _normalize_prompt(question)
    if not normalized:
        return "", False

    if not (_is_context_dependent_request(normalized) or _is_generic_solver_prompt(normalized)):
        return normalized, False

    previous_problem = _find_recent_message(
        history,
        role="user",
        exclude_text=normalized,
        skip_generic=_is_generic_solver_prompt,
    )
    if not previous_problem:
        return normalized, False

    if _is_generic_solver_prompt(normalized):
        return previous_problem, True

    return f"{previous_problem}\nFollow-up instruction: {normalized}", True


def _detect_chat_intent(question: str) -> str:
    lowered = question.lower()

    if any(keyword in lowered for keyword in ("define", "definition", "meaning")):
        return "definitions"
    if any(keyword in lowered for keyword in ("example", "application", "use case")):
        return "examples"
    if any(keyword in lowered for keyword in ("revision", "revise", "exam", "memorize", "important")):
        return "revision"
    if any(keyword in lowered for keyword in ("overview", "summary", "overall")):
        return "overview"
    if any(keyword in lowered for keyword in ("simple", "simply", "plain", "easy")):
        return "simple"

    return "general"


class LocalAIService:
    def summarize(self, transcript: str) -> StructuredSummary:
        cleaned = clean_transcript_text(transcript)
        chunks = split_into_chunks(cleaned, max_chars=2000, overlap_chars=160, max_chunks=10)
        if not chunks and cleaned:
            chunks = [cleaned]

        all_definitions: list[str] = []
        all_concepts: list[str] = []
        all_examples: list[str] = []
        all_revision: list[str] = []

        for chunk in chunks:
            chunk_output = self._summarize_chunk(chunk)
            all_definitions.extend(chunk_output["definitions"])
            all_concepts.extend(chunk_output["concepts"])
            all_examples.extend(chunk_output["examples"])
            all_revision.extend(chunk_output["revision"])

        overview_paragraphs = build_three_paragraph_overview(
            source_text=cleaned,
            concepts=all_concepts,
        )

        summary = StructuredSummary(
            overview_paragraphs=overview_paragraphs,
            key_definitions=_trim_items(all_definitions, label="Definition"),
            core_concepts=_trim_items(all_concepts, label="Concept"),
            important_examples=_trim_items(all_examples, label="Example"),
            exam_revision_points=_trim_items(all_revision, label="Revision"),
        )
        return validate_structured_summary(summary, cleaned)

    def _summarize_chunk(self, chunk: str) -> dict[str, list[str]]:
        sentences = split_sentences(chunk)
        if not sentences:
            sentences = [_shorten(chunk, 200)]

        token_counts = Counter(token for token in tokenize_words(chunk) if token not in STOPWORDS)
        top_terms = [word for word, _ in token_counts.most_common(12)]

        definitions = self._extract_definitions(sentences, top_terms)
        concepts = self._extract_core_concepts(sentences, token_counts)
        examples = self._extract_examples(sentences, concepts)
        revision = self._extract_revision_points(concepts, top_terms)

        return {
            "definitions": definitions,
            "concepts": concepts,
            "examples": examples,
            "revision": revision,
        }

    @staticmethod
    def _extract_definitions(sentences: list[str], top_terms: list[str]) -> list[str]:
        output: list[str] = []
        pattern = re.compile(
            r"(?P<term>[A-Za-z][A-Za-z0-9\-\s]{2,40})\s+(?:is|are|means|refers to|defined as)\s+(?P<definition>[^.;:]{10,220})",
            flags=re.IGNORECASE,
        )

        for sentence in sentences[:40]:
            match = pattern.search(sentence)
            if not match:
                continue
            term = " ".join(match.group("term").split()[-5:])
            definition = _shorten(match.group("definition").strip(" -"), 170).rstrip(".")
            output.append(f"{term.title()}: {definition}.")

        for term in top_terms:
            if len(output) >= 8:
                break
            output.append(f"{term.title()}: A recurring technical term in this lecture that should be defined clearly.")

        return output

    @staticmethod
    def _extract_core_concepts(sentences: list[str], token_counts: Counter[str]) -> list[str]:
        ranked: list[tuple[int, str]] = []
        for sentence in sentences:
            tokens = {token for token in tokenize_words(sentence) if token not in STOPWORDS}
            if not tokens:
                continue
            score = sum(token_counts.get(token, 0) for token in tokens)
            if any(marker in sentence.lower() for marker in {"key", "core", "principle", "method", "model", "process"}):
                score += 3
            ranked.append((score, sentence))

        ranked.sort(key=lambda item: item[0], reverse=True)
        return [_shorten(item[1], 190) for item in ranked[:8]]

    @staticmethod
    def _extract_examples(sentences: list[str], concepts: list[str]) -> list[str]:
        markers = {"example", "for instance", "such as", "suppose", "consider", "application", "case"}
        output = [
            _shorten(sentence, 180)
            for sentence in sentences
            if any(marker in sentence.lower() for marker in markers)
        ]

        if len(output) < 4:
            for concept in concepts[:4]:
                output.append(f"Application view: {_shorten(concept, 145)}")

        return output

    @staticmethod
    def _extract_revision_points(concepts: list[str], top_terms: list[str]) -> list[str]:
        output: list[str] = []
        for concept in concepts[:4]:
            output.append(f"Exam focus: {_shorten(concept, 150)}")

        for term in top_terms[:4]:
            output.append(f"Define {term.title()} and explain its role in the lecture framework.")

        return output

    def chat(
        self,
        message: str,
        summary: StructuredSummary,
        history: list[ChatMessage],
        context_chunks: list[str] | None = None,
    ) -> str:
        question = _normalize_prompt(message)
        if not question:
            return "Please ask a specific question about the current lecture summary."

        effective_question = _resolve_chat_reference(question, history)
        contexts = context_chunks or []
        if contexts:
            selected_contexts = select_top_chunks_for_query(effective_question, contexts, top_k=3)
        else:
            selected_contexts = []

        intent = _detect_chat_intent(question)
        preferred_pool = {
            "definitions": summary.key_definitions + summary.core_concepts,
            "examples": summary.important_examples + summary.core_concepts,
            "revision": summary.exam_revision_points + summary.core_concepts,
            "overview": summary.overview_paragraphs + summary.core_concepts,
            "simple": summary.core_concepts + summary.key_definitions,
            "general": (
                summary.core_concepts
                + summary.key_definitions
                + summary.important_examples
                + summary.exam_revision_points
            ),
        }[intent]
        knowledge_pool = dedupe_strings(
            preferred_pool
            + summary.core_concepts
            + summary.key_definitions
            + summary.important_examples
            + summary.exam_revision_points
        )

        question_tokens = {token for token in tokenize_words(effective_question) if token not in STOPWORDS}
        ranked_points: list[tuple[int, str]] = []

        for point in knowledge_pool:
            point_tokens = {token for token in tokenize_words(point) if token not in STOPWORDS}
            score = len(question_tokens & point_tokens)
            if point in preferred_pool[:6]:
                score += 1
            if score > 0:
                ranked_points.append((score, point))

        ranked_points.sort(key=lambda item: item[0], reverse=True)
        best_points = [item[1] for item in ranked_points[:3]]

        if not best_points and not selected_contexts and not _is_generic_chat_prompt(question):
            return (
                "I could not find that topic in the current lecture notes. "
                "Ask using lecture terms, or request definitions, examples, or revision points from the summary."
            )

        if not best_points:
            fallback_pool = {
                "definitions": summary.key_definitions + summary.core_concepts,
                "examples": summary.important_examples + summary.core_concepts,
                "revision": summary.exam_revision_points + summary.core_concepts,
                "overview": summary.overview_paragraphs + summary.core_concepts,
                "simple": summary.core_concepts + summary.key_definitions,
                "general": summary.core_concepts + summary.key_definitions,
            }[intent]
            best_points = dedupe_strings(fallback_pool)[:3]

        lead_line = {
            "definitions": "Key definitions from current lecture notes:",
            "examples": "Examples grounded in current lecture notes:",
            "revision": "Revision points from current lecture notes:",
            "overview": "Lecture overview from current notes:",
            "simple": "Simple explanation from current lecture notes:",
            "general": "Answer grounded in current lecture notes:",
        }[intent]

        lines = [lead_line]
        for point in best_points:
            lines.append(f"- {_shorten(point, 170)}")

        if intent == "simple" and summary.key_definitions:
            simple_anchor = _shorten(summary.key_definitions[0], 170)
            if simple_anchor.lower() not in {item.lower() for item in best_points}:
                lines.append(f"- In simpler exam wording: {simple_anchor}")

        if selected_contexts:
            lines.append("Supporting lecture context:")
            for chunk in selected_contexts[:2]:
                lines.append(f"- {_shorten(chunk, 190)}")

        lines.append("Ask for a 2-mark, 5-mark, or revision-bullet format if you want a tighter answer.")
        return "\n".join(lines)

    def generate_mcqs(self, summary: StructuredSummary, context_chunks: list[str] | None = None) -> list[MCQItem]:
        context_facts: list[str] = []
        for chunk in context_chunks or []:
            context_facts.extend(split_sentences(chunk)[:2])

        pool = dedupe_strings(
            summary.core_concepts
            + summary.key_definitions
            + summary.important_examples
            + summary.exam_revision_points
            + context_facts
        )

        if not pool:
            pool = ["The lecture covers foundational concepts and their practical usage."]

        mcqs: list[MCQItem] = []
        for index in range(5):
            fact = _shorten(pool[index % len(pool)], 120)
            question = f"Which option is most consistent with this lecture statement: \"{fact}\"?"

            distractors: list[str] = []
            for candidate in pool:
                option = _shorten(candidate, 110)
                if option.lower() == fact.lower():
                    continue
                distractors.append(option)
                if len(distractors) >= 3:
                    break

            while len(distractors) < 3:
                distractors.append("This statement is not directly supported by the lecture notes.")

            options = [fact, distractors[0], distractors[1], distractors[2]]
            rotation = index % 4
            options = options[rotation:] + options[:rotation]
            correct_index = options.index(fact)

            mcqs.append(
                MCQItem(
                    question=question,
                    options=options,
                    correct_index=correct_index,
                    explanation=(
                        "Correct option matches the grounded lecture statement, while distractors either shift context "
                        "or weaken technical accuracy."
                    ),
                )
            )

        return mcqs

    def solver_chat(
        self,
        message: str,
        history: list[ChatMessage],
        image_bytes: bytes | None = None,
        image_mime_type: str | None = None,
        image_data_url: str | None = None,
    ) -> str:
        del image_bytes
        del image_mime_type

        question = _normalize_prompt(message)
        if not question and image_data_url:
            return (
                "Offline mode cannot read image content directly. "
                "Please type the exact problem statement, and I will solve it step-by-step."
            )

        working_question, used_history_context = _resolve_solver_reference(question, history)
        prefix = (
            "I cannot parse the uploaded image offline, so I will solve from your typed text.\n\n"
            if image_data_url
            else ""
        )
        history_note = (
            "Using your earlier homework message as the missing problem context.\n\n"
            if used_history_context
            else ""
        )

        arithmetic = self._solve_arithmetic(working_question)
        if arithmetic:
            return prefix + history_note + arithmetic

        linear = self._solve_linear_equation(working_question)
        if linear:
            return prefix + history_note + linear

        code_help = self._solve_code_debug_prompt(working_question)
        if code_help:
            return prefix + history_note + code_help

        if _is_generic_solver_prompt(question) and not used_history_context:
            return prefix + history_note + (
                "Offline solver needs the actual problem statement to finish the solution.\n"
                "- For math: paste the exact equation or numerical values with units.\n"
                "- For coding: paste the code snippet and full error message.\n"
                "- For science/word problems: paste the full question text and what must be found."
            )

        breakdown = self._build_problem_breakdown(working_question)
        if breakdown:
            return prefix + history_note + breakdown

        return prefix + history_note + (
            "Offline solver needs the actual problem statement to finish the solution.\n"
            "- For math: paste the exact equation or numerical values with units.\n"
            "- For coding: paste the code snippet and full error message.\n"
            "- For science/word problems: paste the full question text and what must be found."
        )

    @staticmethod
    def _safe_eval(expr: str) -> float:
        node = ast.parse(expr, mode="eval")
        allowed_nodes = (
            ast.Expression,
            ast.BinOp,
            ast.UnaryOp,
            ast.Constant,
            ast.Add,
            ast.Sub,
            ast.Mult,
            ast.Div,
            ast.Pow,
            ast.Mod,
            ast.FloorDiv,
            ast.UAdd,
            ast.USub,
            ast.Load,
        )

        for subnode in ast.walk(node):
            if not isinstance(subnode, allowed_nodes):
                raise ValueError("Unsupported expression")
            if isinstance(subnode, ast.Constant) and not isinstance(subnode.value, (int, float)):
                raise ValueError("Expression contains non-numeric values")

        return float(eval(compile(node, "<expr>", "eval"), {"__builtins__": {}}, {}))

    def _solve_arithmetic(self, question: str) -> str | None:
        if not question:
            return None

        raw_question = question.strip().replace("^", "**")
        candidates = [raw_question]
        lowered = raw_question.lower()

        for prefix in ("calculate", "compute", "evaluate", "solve"):
            if lowered.startswith(prefix):
                candidates.append(raw_question[len(prefix) :].strip(" :"))

        candidates.extend(
            match.strip()
            for match in re.findall(r"(?<![A-Za-z])[0-9\.\+\-\*\/\(\)\s%]{5,}", raw_question)
            if any(operator in match for operator in "+-*/%")
        )

        for candidate in dedupe_strings(candidates):
            if not re.fullmatch(r"[0-9\.\+\-\*\/\(\)\s%*]+", candidate):
                continue

            try:
                value = self._safe_eval(candidate)
            except Exception:
                continue

            value_text = (
                str(int(round(value)))
                if abs(value - round(value)) < 1e-9
                else f"{value:.6f}".rstrip("0").rstrip(".")
            )
            return (
                "Step-by-step:\n"
                f"1. Expression recognized: {candidate}\n"
                "2. Evaluate by operator precedence.\n"
                f"3. Final value = {value_text}"
            )

        return None

    @staticmethod
    def _parse_coeff(value: str) -> float:
        cleaned = value.replace(" ", "")
        if cleaned in {"", "+"}:
            return 1.0
        if cleaned == "-":
            return -1.0
        return float(cleaned)

    def _solve_linear_equation(self, question: str) -> str | None:
        if not question:
            return None

        pattern = re.compile(
            r"([+-]?\s*\d*\.?\d*)\s*([A-Za-z])\s*([+-]\s*\d*\.?\d+)?\s*=\s*([+-]?\s*\d*\.?\d+)",
            flags=re.IGNORECASE,
        )
        match = pattern.search(question)
        if not match:
            return None

        a_raw, variable, b_raw, c_raw = match.groups()
        try:
            a = self._parse_coeff(a_raw)
            b = float((b_raw or "0").replace(" ", ""))
            c = float(c_raw.replace(" ", ""))
        except Exception:
            return None

        if abs(a) < 1e-12:
            return f"This equation has no single linear solution because coefficient of {variable} is zero."

        solution = (c - b) / a
        solution_text = f"{solution:.6f}".rstrip("0").rstrip(".")
        return (
            "Linear equation solution:\n"
            f"1. Standard form: {a}{variable} + ({b}) = {c}\n"
            f"2. Rearranged: {a}{variable} = {c - b}\n"
            f"3. {variable} = {solution_text}"
        )

    def _solve_code_debug_prompt(self, question: str) -> str | None:
        lowered = question.lower()
        if "```" not in question and not any(
            marker in lowered
            for marker in (
                "error",
                "exception",
                "traceback",
                "syntaxerror",
                "typeerror",
                "nameerror",
                "indexerror",
                "keyerror",
                "attributeerror",
            )
        ):
            return None

        error_match = re.search(r"\b([A-Za-z]+Error|Exception)\b", question)
        error_name = error_match.group(1) if error_match else "runtime error"
        tips = {
            "SyntaxError": "Check punctuation, indentation, and unmatched brackets on the flagged line.",
            "TypeError": "Check data types flowing into the operation or function call that failed.",
            "NameError": "Check whether the variable or function name was defined before use.",
            "IndexError": "Check the list/string length before accessing that index.",
            "KeyError": "Check whether the dictionary key exists before reading it.",
            "AttributeError": "Check the object type and whether that attribute or method exists on it.",
        }
        focused_tip = tips.get(error_name, "Read the first failing line carefully and inspect the values reaching it.")

        return (
            "Offline coding-help mode:\n"
            f"1. Error detected: {error_name}\n"
            f"2. First check: {focused_tip}\n"
            "3. Then inspect the exact line mentioned in the error and the values passed into it.\n"
            "4. Paste 10 to 20 lines around the failing code for a precise fix."
        )

    def _build_problem_breakdown(self, question: str) -> str | None:
        normalized = _normalize_prompt(question)
        if not normalized or len(tokenize_words(normalized)) < 4:
            return None

        numbers = re.findall(r"(?<![A-Za-z])[-+]?\d*\.?\d+(?:/\d+)?", normalized)
        unknown_match = re.search(
            r"\b(?:find|solve|determine|calculate|compute)\s+(?:for\s+)?([A-Za-z][A-Za-z0-9 _-]{0,28})",
            normalized,
            flags=re.IGNORECASE,
        )
        unknown = _shorten(unknown_match.group(1).strip(), 60) if unknown_match else "the required final quantity"

        keyword_groups = [
            "mass",
            "force",
            "acceleration",
            "velocity",
            "speed",
            "distance",
            "time",
            "voltage",
            "current",
            "resistance",
            "probability",
            "array",
            "function",
            "loop",
        ]
        detected_keywords = [keyword for keyword in keyword_groups if keyword in normalized.lower()]

        lines = ["Offline problem breakdown:"]
        if numbers:
            lines.append(f"1. Known values detected: {', '.join(numbers[:6])}")
        else:
            lines.append("1. Known values: read all given quantities, constants, and units carefully.")
        lines.append(f"2. Unknown to solve: {unknown}")
        if detected_keywords:
            lines.append(f"3. Likely topic/formula family: {', '.join(detected_keywords[:4])}")
        else:
            lines.append("3. Likely method: choose the formula or algorithm that connects the knowns to the unknown.")
        lines.append("4. Paste the exact equation, code, or full question target if you want the final solved answer.")
        return "\n".join(lines)
