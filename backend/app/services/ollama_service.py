from __future__ import annotations

import base64
from typing import Any

import httpx

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


class OllamaService:
    def __init__(self, base_url: str, model_name: str, enabled: bool = True) -> None:
        self._enabled = enabled
        self._base_url = base_url.rstrip("/")
        self._model_name = model_name

    @property
    def enabled(self) -> bool:
        return self._enabled

    def _generate(self, prompt: str, temperature: float = 0.2, images: list[str] | None = None) -> str:
        if not self._enabled:
            raise RuntimeError("Ollama fallback is disabled.")

        url = f"{self._base_url}/api/generate"
        payload: dict[str, Any] = {
            "model": self._model_name,
            "prompt": prompt,
            "stream": False,
            "options": {
                "temperature": temperature,
            },
        }
        if images:
            payload["images"] = images

        try:
            response = httpx.post(url, json=payload, timeout=120)
        except Exception as exc:
            raise RuntimeError(f"Ollama request failed: {exc}") from exc

        if response.status_code >= 400:
            raise RuntimeError(f"Ollama request failed ({response.status_code}): {response.text.strip()}")

        try:
            data = response.json()
        except Exception as exc:
            raise RuntimeError(f"Ollama returned non-JSON response: {exc}") from exc

        text = str(data.get("response", "")).strip()
        if not text:
            raise RuntimeError("Ollama returned an empty response.")

        return text

    def _generate_json(self, prompt: str, temperature: float = 0.2) -> Any:
        response_text = self._generate(prompt=prompt, temperature=temperature)

        try:
            return extract_json_payload(response_text)
        except Exception:
            retry_prompt = prompt + "\n\nReturn JSON only. No markdown."
            retry_text = self._generate(prompt=retry_prompt, temperature=max(0.1, temperature - 0.1))
            return extract_json_payload(retry_text)

    def summarize(self, transcript: str) -> StructuredSummary:
        cleaned = clean_transcript_text(transcript)
        chunks = split_into_chunks(cleaned, max_chars=2400, overlap_chars=200, max_chunks=8)

        if not chunks:
            data = self._generate_json(build_summary_prompt(cleaned), temperature=0.2)
            if not isinstance(data, dict):
                raise RuntimeError("Could not parse structured summary from Ollama response.")
            return validate_structured_summary(normalize_summary(data), cleaned)

        chunk_notes: list[dict[str, Any]] = []
        for index, chunk in enumerate(chunks, start=1):
            chunk_data = self._generate_json(
                build_summary_chunk_prompt(chunk_text=chunk, chunk_index=index, total_chunks=len(chunks)),
                temperature=0.2,
            )
            if isinstance(chunk_data, dict):
                chunk_notes.append(chunk_data)

        reduced_data = self._generate_json(build_summary_reduce_prompt(chunk_notes), temperature=0.2)
        reduced = reduced_data if isinstance(reduced_data, dict) else {}

        candidate_data = self._generate_json(
            build_summary_synthesis_prompt(reduced_notes=reduced, transcript_excerpt=cleaned),
            temperature=0.2,
        )
        candidate = candidate_data if isinstance(candidate_data, dict) else reduced

        validated_data = self._generate_json(
            build_summary_validation_prompt(candidate_summary=candidate, reduced_notes=reduced),
            temperature=0.1,
        )
        final_data = validated_data if isinstance(validated_data, dict) else candidate

        if not isinstance(final_data, dict):
            raise RuntimeError("Could not parse structured summary from Ollama response.")

        summary = normalize_summary(final_data)
        return validate_structured_summary(summary, cleaned)

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
            raise RuntimeError("Could not parse MCQ JSON response from Ollama.")

        if not isinstance(mcq_items, list) or not mcq_items:
            raise RuntimeError("Ollama MCQ response is empty.")

        normalized = [normalize_mcq_item(item) for item in mcq_items if isinstance(item, dict)]
        if len(normalized) < 5:
            raise RuntimeError("Ollama did not produce enough MCQs.")

        return normalized[:5]

    def solver_chat(
        self,
        message: str,
        history: list[ChatMessage],
        image_bytes: bytes | None = None,
        image_mime_type: str | None = None,
        image_data_url: str | None = None,
    ) -> str:
        del image_mime_type
        del image_data_url

        history_payload = [item.model_dump() for item in history]
        prompt = build_solver_chat_prompt(message=message, history=history_payload)

        images: list[str] | None = None
        if image_bytes:
            images = [base64.b64encode(image_bytes).decode("utf-8")]

        return self._generate(prompt=prompt, temperature=0.3, images=images)
