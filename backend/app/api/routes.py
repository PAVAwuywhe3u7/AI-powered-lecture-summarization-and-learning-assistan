from __future__ import annotations

import base64
import logging
import re
from io import BytesIO

from fastapi import APIRouter, Header, HTTPException, Query
from fastapi.responses import StreamingResponse

from app.core.config import settings
from app.core.session import SessionStore
from app.models.schemas import (
    AuthResponse,
    AuthUser,
    ChatRequest,
    ChatResponse,
    ExtractCaptionsRequest,
    ExtractCaptionsResponse,
    LoginRequest,
    MCQItem,
    MCQRequest,
    MCQResponse,
    RegisterRequest,
    SolverChatRequest,
    SolverChatResponse,
    StructuredSummary,
    SummarizeRequest,
    SummarizeResponse,
    VideoMetaResponse,
)
from app.services.gemini_service import GeminiService
from app.services.local_ai_service import LocalAIService
from app.services.ollama_service import OllamaService
from app.services.pipeline_utils import (
    build_query_from_summary,
    clean_transcript_text,
    select_top_chunks_for_query,
    split_into_chunks,
)
from app.services.pdf_service import PDFService
from app.services.transcript_service import TranscriptService
from app.services.auth_service import AuthService

logger = logging.getLogger(__name__)
router = APIRouter()

transcript_service = TranscriptService()
pdf_service = PDFService()
local_ai_service = LocalAIService()
ollama_service = OllamaService(
    base_url=settings.ollama_base_url,
    model_name=settings.ollama_model,
    enabled=settings.ollama_enabled,
)
session_store = SessionStore(ttl_minutes=settings.session_ttl_minutes)
auth_service = AuthService()
_gemini_service: GeminiService | None = None


def get_gemini_service() -> GeminiService:
    global _gemini_service
    if _gemini_service is None:
        if not settings.gemini_api_key:
            raise HTTPException(status_code=500, detail="GEMINI_API_KEY is not configured on the server.")
        _gemini_service = GeminiService(
            api_key=settings.gemini_api_key,
            model_name=settings.gemini_model,
        )
    return _gemini_service


def _is_recoverable_http_error(exc: HTTPException) -> bool:
    return exc.status_code in {401, 403, 429, 500, 502, 503, 504}


def _run_with_fallback_chain(operation: str, gemini_call, ollama_call, local_call):
    try:
        return gemini_call()
    except HTTPException as exc:
        if _is_recoverable_http_error(exc):
            logger.warning("%s unavailable (%s). Trying local model fallback.", operation, exc.detail)
        else:
            raise
    except Exception as exc:
        logger.warning("%s failed with Gemini (%s). Trying local model fallback.", operation, exc)

    try:
        return ollama_call()
    except Exception as exc:
        logger.warning("%s failed with Ollama (%s). Using built-in offline fallback.", operation, exc)
        return local_call()


def _map_service_error(exc: Exception) -> HTTPException:
    message = str(exc)
    lowered = message.lower()

    if "quota" in lowered or "429" in message:
        return HTTPException(status_code=429, detail=message)
    if "invalid image" in lowered or "unable to process input image" in lowered:
        return HTTPException(status_code=400, detail=message)
    if "unauthorized" in lowered or "forbidden" in lowered or "401" in message or "403" in message:
        return HTTPException(status_code=401, detail=message)

    return HTTPException(status_code=502, detail=message)


def _extract_bearer_token(authorization: str | None) -> str:
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing authorization header.")

    parts = authorization.split(" ", 1)
    if len(parts) != 2 or parts[0].lower() != "bearer" or not parts[1].strip():
        raise HTTPException(status_code=401, detail="Invalid authorization header format.")

    return parts[1].strip()


@router.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@router.post("/auth/register", response_model=AuthResponse)
async def auth_register(payload: RegisterRequest) -> AuthResponse:
    user = auth_service.register_user(
        name=payload.name,
        email=payload.email,
        password=payload.password,
        role=payload.role,
        department=payload.department,
    )
    access_token, expires_in = auth_service.create_access_token(user)
    return AuthResponse(access_token=access_token, expires_in=expires_in, user=user)


@router.post("/auth/login", response_model=AuthResponse)
async def auth_login(payload: LoginRequest) -> AuthResponse:
    user = auth_service.authenticate_user(
        email=payload.email,
        password=payload.password,
    )
    access_token, expires_in = auth_service.create_access_token(user)
    return AuthResponse(access_token=access_token, expires_in=expires_in, user=user)


@router.get("/auth/me", response_model=AuthUser)
async def auth_me(authorization: str | None = Header(default=None)) -> AuthUser:
    token = _extract_bearer_token(authorization)
    return auth_service.verify_access_token(token)


@router.post("/extract_captions", response_model=ExtractCaptionsResponse)
async def extract_captions(payload: ExtractCaptionsRequest) -> ExtractCaptionsResponse:
    try:
        result = await transcript_service.extract(payload.youtube_url, payload.language)
        return ExtractCaptionsResponse(
            video_id=result.video_id,
            transcript=result.transcript,
            title=result.title,
            thumbnail_url=result.thumbnail_url,
            channel_title=result.channel_title,
            used_title_fallback=result.used_title_fallback,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Caption extraction failed: %s", exc)
        raise _map_service_error(exc) from exc


@router.post("/video_meta", response_model=VideoMetaResponse)
async def video_meta(payload: ExtractCaptionsRequest) -> VideoMetaResponse:
    try:
        data = await transcript_service.get_video_meta(payload.youtube_url)
        return VideoMetaResponse(
            video_id=data["video_id"],
            title=data.get("title", ""),
            thumbnail_url=data.get("thumbnail_url", ""),
            channel_title=data.get("channel_title", ""),
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Video metadata extraction failed: %s", exc)
        raise _map_service_error(exc) from exc


@router.post("/summarize", response_model=SummarizeResponse)
async def summarize(payload: SummarizeRequest) -> SummarizeResponse:
    cleaned_transcript = clean_transcript_text(payload.transcript)

    try:
        summary = _run_with_fallback_chain(
            operation="summarize",
            gemini_call=lambda: get_gemini_service().summarize(cleaned_transcript),
            ollama_call=lambda: ollama_service.summarize(cleaned_transcript),
            local_call=lambda: local_ai_service.summarize(cleaned_transcript),
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Summarization failed: %s", exc)
        raise _map_service_error(exc) from exc

    session_id = session_store.ensure(payload.session_id)
    session_store.set_transcript(session_id, cleaned_transcript)
    session_store.set_summary(session_id, summary.model_dump())
    session_store.set_retrieval_chunks(
        session_id,
        split_into_chunks(cleaned_transcript, max_chars=1400, overlap_chars=120, max_chunks=24),
    )

    return SummarizeResponse(session_id=session_id, summary=summary)


@router.post("/chat", response_model=ChatResponse)
async def chat(payload: ChatRequest) -> ChatResponse:
    session_id = session_store.ensure(payload.session_id)

    summary = payload.summary
    if not summary:
        cached_summary = session_store.get_summary(session_id)
        if cached_summary:
            summary = StructuredSummary(**cached_summary)

    if not summary:
        raise HTTPException(
            status_code=400,
            detail="No active summary found. Generate summary first or include summary in request.",
        )

    retrieval_chunks = session_store.get_retrieval_chunks(session_id)
    if not retrieval_chunks:
        session = session_store.get(session_id) or {}
        retrieval_chunks = split_into_chunks(session.get("transcript", ""), max_chars=1400, overlap_chars=120, max_chunks=24)
        if retrieval_chunks:
            session_store.set_retrieval_chunks(session_id, retrieval_chunks)

    context_chunks = select_top_chunks_for_query(payload.message, retrieval_chunks, top_k=4)

    try:
        answer = _run_with_fallback_chain(
            operation="chat",
            gemini_call=lambda: get_gemini_service().chat(
                message=payload.message,
                summary=summary,
                history=payload.history,
                context_chunks=context_chunks,
            ),
            ollama_call=lambda: ollama_service.chat(
                message=payload.message,
                summary=summary,
                history=payload.history,
                context_chunks=context_chunks,
            ),
            local_call=lambda: local_ai_service.chat(
                message=payload.message,
                summary=summary,
                history=payload.history,
                context_chunks=context_chunks,
            ),
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Chat generation failed: %s", exc)
        raise _map_service_error(exc) from exc

    session_store.set_summary(session_id, summary.model_dump())
    session_store.append_chat(session_id, "user", payload.message)
    session_store.append_chat(session_id, "assistant", answer)

    return ChatResponse(session_id=session_id, answer=answer)


def _decode_image_data_url(data_url: str) -> tuple[bytes, str]:
    pattern = r"^data:(image/[a-zA-Z0-9.+-]+);base64,(.+)$"
    match = re.match(pattern, data_url.strip(), flags=re.DOTALL)
    if not match:
        raise HTTPException(status_code=400, detail="Invalid image format. Expected base64 data URL.")

    mime_type = match.group(1).lower().strip()
    payload = match.group(2).strip()

    try:
        image_bytes = base64.b64decode(payload, validate=True)
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Could not decode image payload.") from exc

    if len(image_bytes) > 8 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Image is too large. Maximum allowed size is 8 MB.")

    return image_bytes, mime_type


@router.post("/solver_chat", response_model=SolverChatResponse)
async def solver_chat(payload: SolverChatRequest) -> SolverChatResponse:
    image_bytes: bytes | None = None
    image_mime_type: str | None = None

    if payload.image_data_url:
        image_bytes, image_mime_type = _decode_image_data_url(payload.image_data_url)

    try:
        answer = _run_with_fallback_chain(
            operation="solver_chat",
            gemini_call=lambda: get_gemini_service().solver_chat(
                message=payload.message,
                history=payload.history,
                image_bytes=image_bytes,
                image_mime_type=image_mime_type,
                image_data_url=payload.image_data_url,
            ),
            ollama_call=lambda: ollama_service.solver_chat(
                message=payload.message,
                history=payload.history,
                image_bytes=image_bytes,
                image_mime_type=image_mime_type,
                image_data_url=payload.image_data_url,
            ),
            local_call=lambda: local_ai_service.solver_chat(
                message=payload.message,
                history=payload.history,
                image_bytes=image_bytes,
                image_mime_type=image_mime_type,
                image_data_url=payload.image_data_url,
            ),
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Solver chat failed: %s", exc)
        raise _map_service_error(exc) from exc

    return SolverChatResponse(answer=answer)


@router.post("/mcq", response_model=MCQResponse)
async def generate_mcq(payload: MCQRequest) -> MCQResponse:
    session_id = session_store.ensure(payload.session_id)

    summary = payload.summary
    if not summary:
        cached_summary = session_store.get_summary(session_id)
        if cached_summary:
            summary = StructuredSummary(**cached_summary)

    if not summary:
        raise HTTPException(
            status_code=400,
            detail="No active summary found. Generate summary first or include summary in request.",
        )

    retrieval_chunks = session_store.get_retrieval_chunks(session_id)
    if not retrieval_chunks:
        session = session_store.get(session_id) or {}
        retrieval_chunks = split_into_chunks(session.get("transcript", ""), max_chars=1400, overlap_chars=120, max_chunks=24)
        if retrieval_chunks:
            session_store.set_retrieval_chunks(session_id, retrieval_chunks)

    summary_query = build_query_from_summary(summary)
    context_chunks = select_top_chunks_for_query(summary_query, retrieval_chunks, top_k=8)

    try:
        mcqs = _run_with_fallback_chain(
            operation="mcq",
            gemini_call=lambda: get_gemini_service().generate_mcqs(summary, context_chunks=context_chunks),
            ollama_call=lambda: ollama_service.generate_mcqs(summary, context_chunks=context_chunks),
            local_call=lambda: local_ai_service.generate_mcqs(summary, context_chunks=context_chunks),
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("MCQ generation failed: %s", exc)
        raise _map_service_error(exc) from exc

    session_store.set_summary(session_id, summary.model_dump())
    session_store.set_mcqs(session_id, [item.model_dump() for item in mcqs])

    return MCQResponse(session_id=session_id, mcqs=mcqs)


@router.get("/pdf")
async def download_pdf(session_id: str = Query(...)) -> StreamingResponse:
    session = session_store.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found or expired.")

    raw_summary = session.get("summary")
    if not raw_summary:
        raise HTTPException(status_code=400, detail="No summary available for this session.")

    summary = StructuredSummary(**raw_summary)
    mcqs = [MCQItem(**item) for item in session.get("mcqs", [])]

    pdf_bytes = pdf_service.build(summary=summary, mcqs=mcqs)

    return StreamingResponse(
        BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=edu-simplify-{session_id[:8]}.pdf"},
    )
