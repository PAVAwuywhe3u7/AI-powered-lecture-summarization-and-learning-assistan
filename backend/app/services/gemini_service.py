from __future__ import annotations

from typing import Any

import google.generativeai as genai

from app.core.prompts import (
    build_chat_prompt,
    build_mcq_prompt,
    build_solver_chat_prompt,
    build_summary_chunk_prompt,
    build_summary_prompt,
    build_summary_reduce_prompt,
    build_summary_synthesis_prompt,
    build_summary_validation_prompt,
)
from app.models.schemas import ChatMessage, MCQItem, StructuredSummary
from app.services.llm_utils import extract_json_payload, normalize_mcq_item, normalize_summary
from app.services.pipeline_utils import clean_transcript_text, split_into_chunks, validate_structured_summary


class GeminiService:
    def __init__(self, api_key: str, model_name: str) -> None:
        if not api_key:
            raise ValueError("GEMINI_API_KEY is missing.")

        genai.configure(api_key=api_key)
        self._model = genai.GenerativeModel(model_name=model_name)

    def _generate(self, prompt: str, temperature: float = 0.2) -> str:
        try:
            response = self._model.generate_content(
                prompt,
                generation_config={
                    "temperature": temperature,
                    "top_p": 0.9,
                },
            )
        except Exception as exc:
            raise RuntimeError(f"Gemini request failed: {exc}") from exc

        text = getattr(response, "text", "")
        if text:
            return text.strip()

        raise RuntimeError("Gemini returned an empty response.")

    def _generate_multimodal(self, parts: list[Any], temperature: float = 0.3) -> str:
        try:
            response = self._model.generate_content(
                parts,
                generation_config={
                    "temperature": temperature,
                    "top_p": 0.9,
                },
            )
        except Exception as exc:
            raise RuntimeError(f"Gemini request failed: {exc}") from exc

        text = getattr(response, "text", "")
        if text:
            return text.strip()

        raise RuntimeError("Gemini returned an empty response.")

    def _generate_json(self, prompt: str, temperature: float = 0.2) -> Any:
        response_text = self._generate(prompt=prompt, temperature=temperature)

        try:
            return extract_json_payload(response_text)
        except Exception:
            retry_prompt = prompt + "\n\nReturn JSON only. No markdown."
            retry_text = self._generate(prompt=retry_prompt, temperature=max(0.1, temperature - 0.1))
            return extract_json_payload(retry_text)

    def _multi_pass_summary(self, transcript: str) -> dict[str, Any]:
        cleaned = clean_transcript_text(transcript)
        chunks = split_into_chunks(cleaned, max_chars=2500, overlap_chars=240, max_chunks=10)

        if not chunks:
            data = self._generate_json(build_summary_prompt(cleaned), temperature=0.2)
            return data if isinstance(data, dict) else {}

        chunk_notes: list[dict[str, Any]] = []
        for index, chunk in enumerate(chunks, start=1):
            chunk_prompt = build_summary_chunk_prompt(
                chunk_text=chunk,
                chunk_index=index,
                total_chunks=len(chunks),
            )
            chunk_data = self._generate_json(chunk_prompt, temperature=0.2)
            if isinstance(chunk_data, dict):
                chunk_notes.append(chunk_data)

        if not chunk_notes:
            fallback = self._generate_json(build_summary_prompt(cleaned), temperature=0.2)
            return fallback if isinstance(fallback, dict) else {}

        reduced_data = self._generate_json(build_summary_reduce_prompt(chunk_notes), temperature=0.2)
        reduced = reduced_data if isinstance(reduced_data, dict) else {
            "key_definitions": [],
            "core_concepts": [],
            "important_examples": [],
            "exam_revision_points": [],
            "fact_bank": [],
        }

        synthesis = self._generate_json(
            build_summary_synthesis_prompt(
                reduced_notes=reduced,
                transcript_excerpt=cleaned,
            ),
            temperature=0.2,
        )
        candidate = synthesis if isinstance(synthesis, dict) else reduced

        validation = self._generate_json(
            build_summary_validation_prompt(candidate_summary=candidate, reduced_notes=reduced),
            temperature=0.1,
        )
        validated = validation if isinstance(validation, dict) else candidate
        return validated

    def summarize(self, transcript: str) -> StructuredSummary:
        cleaned = clean_transcript_text(transcript)

        try:
            data = self._multi_pass_summary(cleaned)
        except Exception:
            fallback_data = self._generate_json(build_summary_prompt(cleaned), temperature=0.2)
            data = fallback_data if isinstance(fallback_data, dict) else {}

        if not isinstance(data, dict):
            raise RuntimeError("Could not parse structured summary from model response.")

        summary = normalize_summary(data)
        summary = validate_structured_summary(summary, cleaned)

        if not any(
            [
                summary.overview_paragraphs,
                summary.key_definitions,
                summary.core_concepts,
                summary.important_examples,
                summary.exam_revision_points,
            ]
        ):
            raise RuntimeError("Generated summary is empty.")

        return summary

    def chat(
        self,
        message: str,
        summary: StructuredSummary,
        history: list[ChatMessage],
        context_chunks: list[str] | None = None,
    ) -> str:
        history_payload = [item.model_dump() for item in history]
        prompt = build_chat_prompt(
            summary=summary.model_dump(),
            message=message,
            history=history_payload,
            context_chunks=context_chunks or [],
        )
        return self._generate(prompt=prompt, temperature=0.35)

    def solver_chat(
        self,
        message: str,
        history: list[ChatMessage],
        image_bytes: bytes | None = None,
        image_mime_type: str | None = None,
        image_data_url: str | None = None,
    ) -> str:
        del image_data_url

        history_payload = [item.model_dump() for item in history]
        prompt = build_solver_chat_prompt(message=message, history=history_payload)

        if image_bytes and image_mime_type:
            parts = [
                prompt,
                {"mime_type": image_mime_type, "data": image_bytes},
            ]
            try:
                return self._generate_multimodal(parts=parts, temperature=0.3)
            except RuntimeError:
                fallback_prompt = (
                    prompt
                    + "\n\nThe uploaded image could not be processed. "
                    + "Explain what is possible from text and request a clearer re-upload if needed."
                )
                return self._generate(prompt=fallback_prompt, temperature=0.3)

        return self._generate(prompt=prompt, temperature=0.3)

    def generate_mcqs(self, summary: StructuredSummary, context_chunks: list[str] | None = None) -> list[MCQItem]:
        prompt = build_mcq_prompt(summary.model_dump(), context_chunks=context_chunks or [])
        response_text = self._generate(prompt=prompt, temperature=0.3)

        try:
            data = extract_json_payload(response_text)
        except Exception:
            retry_prompt = prompt + "\n\nReturn JSON only."
            data = extract_json_payload(self._generate(retry_prompt, temperature=0.1))

        if isinstance(data, dict):
            mcq_items = data.get("mcqs", [])
        elif isinstance(data, list):
            mcq_items = data
        else:
            raise RuntimeError("Could not parse MCQ JSON response.")

        if not isinstance(mcq_items, list) or not mcq_items:
            raise RuntimeError("MCQ response is empty.")

        normalized = [normalize_mcq_item(item) for item in mcq_items if isinstance(item, dict)]
        if len(normalized) < 5:
            raise RuntimeError("Model did not produce enough MCQs.")

        return normalized[:5]
