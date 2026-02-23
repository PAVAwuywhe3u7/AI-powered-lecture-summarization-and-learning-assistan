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
    values = [_shorten(item, 180) for item in dedupe_strings(items) if len(item.strip()) > 8]
    values = values[:max_items]
    while len(values) < min_items:
        values.append(f"{label} {len(values) + 1}: Connect this point to the lecture's core objective.")
    return values


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
        del history

        question = (message or "").strip()
        if not question:
            return "Please ask a specific question about the current lecture summary."

        contexts = context_chunks or []
        if contexts:
            selected_contexts = select_top_chunks_for_query(question, contexts, top_k=3)
        else:
            selected_contexts = []

        knowledge_pool = (
            summary.core_concepts
            + summary.key_definitions
            + summary.important_examples
            + summary.exam_revision_points
        )

        question_tokens = {token for token in tokenize_words(question) if token not in STOPWORDS}
        ranked_points: list[tuple[int, str]] = []

        for point in knowledge_pool:
            point_tokens = {token for token in tokenize_words(point) if token not in STOPWORDS}
            score = len(question_tokens & point_tokens)
            if score > 0:
                ranked_points.append((score, point))

        ranked_points.sort(key=lambda item: item[0], reverse=True)
        best_points = [item[1] for item in ranked_points[:3]]

        if not best_points and not selected_contexts:
            return (
                "Offline mode is active. I could not find a strong match in current notes. "
                "Ask with terms from key definitions or core concepts."
            )

        lines = ["Answer grounded in current lecture notes:"]
        for point in best_points:
            lines.append(f"- {_shorten(point, 170)}")

        if selected_contexts:
            lines.append("Supporting lecture context:")
            for chunk in selected_contexts[:2]:
                lines.append(f"- {_shorten(chunk, 190)}")

        lines.append("If needed, ask for a short 5-mark exam answer format.")
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
        del history
        del image_bytes
        del image_mime_type

        question = re.sub(r"\s+", " ", (message or "")).strip()
        if not question and image_data_url:
            return (
                "Offline mode cannot read image content directly. "
                "Please type the exact problem statement, and I will solve it step-by-step."
            )

        prefix = (
            "I cannot parse the uploaded image offline, so I will solve from your typed text.\n\n"
            if image_data_url
            else ""
        )

        arithmetic = self._solve_arithmetic(question)
        if arithmetic:
            return prefix + arithmetic

        linear = self._solve_linear_equation(question)
        if linear:
            return prefix + linear

        return prefix + (
            "Offline solver framework:\n"
            "1. Identify known values and unknowns.\n"
            "2. Select formula/algorithm.\n"
            "3. Substitute and simplify carefully.\n"
            "4. Verify result with units and logic.\n\n"
            "Send the exact equation, code snippet, or full problem text for a precise solution."
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

        candidate = question.strip().replace("^", "**")
        if not re.fullmatch(r"[0-9\.\+\-\*\/\(\)\s%*]+", candidate):
            lowered = candidate.lower()
            for prefix in ("calculate", "compute", "evaluate", "solve"):
                if lowered.startswith(prefix):
                    candidate = candidate[len(prefix) :].strip(" :")
                    break

        if not re.fullmatch(r"[0-9\.\+\-\*\/\(\)\s%*]+", candidate):
            return None

        try:
            value = self._safe_eval(candidate)
        except Exception:
            return None

        value_text = str(int(round(value))) if abs(value - round(value)) < 1e-9 else f"{value:.6f}".rstrip("0").rstrip(".")
        return (
            "Step-by-step:\n"
            f"1. Expression recognized: {candidate}\n"
            "2. Evaluate by operator precedence.\n"
            f"3. Final value = {value_text}"
        )

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
            r"^\s*([+-]?\s*\d*\.?\d*)\s*x\s*([+-]\s*\d*\.?\d+)?\s*=\s*([+-]?\s*\d*\.?\d+)\s*$",
            flags=re.IGNORECASE,
        )
        match = pattern.match(question)
        if not match:
            return None

        a_raw, b_raw, c_raw = match.groups()
        try:
            a = self._parse_coeff(a_raw)
            b = float((b_raw or "0").replace(" ", ""))
            c = float(c_raw.replace(" ", ""))
        except Exception:
            return None

        if abs(a) < 1e-12:
            return "This equation has no single linear solution because coefficient of x is zero."

        x = (c - b) / a
        x_text = f"{x:.6f}".rstrip("0").rstrip(".")
        return (
            "Linear equation solution:\n"
            f"1. Standard form: {a}x + ({b}) = {c}\n"
            f"2. Rearranged: {a}x = {c - b}\n"
            f"3. x = {x_text}"
        )
