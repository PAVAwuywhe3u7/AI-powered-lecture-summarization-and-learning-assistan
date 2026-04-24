from __future__ import annotations

from datetime import datetime, timedelta, timezone
from threading import RLock
from typing import Any
from uuid import uuid4


class SessionStore:
    def __init__(self, ttl_minutes: int = 240) -> None:
        self._ttl = timedelta(minutes=ttl_minutes)
        self._sessions: dict[str, dict[str, Any]] = {}
        self._lock = RLock()

    @staticmethod
    def _normalize_owner_id(owner_id: str | None) -> str:
        return (owner_id or "").strip()

    @staticmethod
    def _assert_owner(session: dict[str, Any], owner_id: str | None) -> None:
        expected_owner = SessionStore._normalize_owner_id(owner_id)
        if not expected_owner:
            return

        current_owner = str(session.get("owner_id", "")).strip()
        if current_owner and current_owner != expected_owner:
            raise PermissionError("Session does not belong to the authenticated user.")

        if not current_owner:
            session["owner_id"] = expected_owner

    def ensure(self, session_id: str | None = None, owner_id: str | None = None) -> str:
        with self._lock:
            self._cleanup_expired_locked()
            sid = session_id or str(uuid4())
            if sid not in self._sessions:
                self._sessions[sid] = {
                    "owner_id": self._normalize_owner_id(owner_id),
                    "created_at": datetime.now(timezone.utc),
                    "updated_at": datetime.now(timezone.utc),
                    "transcript": "",
                    "summary": None,
                    "retrieval_chunks": [],
                    "mcqs": [],
                    "chat_history": [],
                }
            else:
                self._assert_owner(self._sessions[sid], owner_id)
                self._sessions[sid]["updated_at"] = datetime.now(timezone.utc)
            return sid

    def get(self, session_id: str, owner_id: str | None = None) -> dict[str, Any] | None:
        with self._lock:
            self._cleanup_expired_locked()
            session = self._sessions.get(session_id)
            if not session:
                return None
            self._assert_owner(session, owner_id)
            session["updated_at"] = datetime.now(timezone.utc)
            return session

    def set_transcript(self, session_id: str, transcript: str, owner_id: str | None = None) -> None:
        with self._lock:
            sid = self.ensure(session_id, owner_id=owner_id)
            self._sessions[sid]["transcript"] = transcript
            self._sessions[sid]["updated_at"] = datetime.now(timezone.utc)

    def set_summary(self, session_id: str, summary: dict[str, Any], owner_id: str | None = None) -> None:
        with self._lock:
            sid = self.ensure(session_id, owner_id=owner_id)
            self._sessions[sid]["summary"] = summary
            self._sessions[sid]["updated_at"] = datetime.now(timezone.utc)

    def get_summary(self, session_id: str, owner_id: str | None = None) -> dict[str, Any] | None:
        session = self.get(session_id, owner_id=owner_id)
        if not session:
            return None
        return session.get("summary")

    def set_retrieval_chunks(self, session_id: str, chunks: list[str], owner_id: str | None = None) -> None:
        with self._lock:
            sid = self.ensure(session_id, owner_id=owner_id)
            self._sessions[sid]["retrieval_chunks"] = chunks
            self._sessions[sid]["updated_at"] = datetime.now(timezone.utc)

    def get_retrieval_chunks(self, session_id: str, owner_id: str | None = None) -> list[str]:
        session = self.get(session_id, owner_id=owner_id)
        if not session:
            return []
        return session.get("retrieval_chunks", [])

    def set_mcqs(self, session_id: str, mcqs: list[dict[str, Any]], owner_id: str | None = None) -> None:
        with self._lock:
            sid = self.ensure(session_id, owner_id=owner_id)
            self._sessions[sid]["mcqs"] = mcqs
            self._sessions[sid]["updated_at"] = datetime.now(timezone.utc)

    def get_mcqs(self, session_id: str, owner_id: str | None = None) -> list[dict[str, Any]]:
        session = self.get(session_id, owner_id=owner_id)
        if not session:
            return []
        return session.get("mcqs", [])

    def append_chat(self, session_id: str, role: str, content: str, owner_id: str | None = None) -> None:
        with self._lock:
            sid = self.ensure(session_id, owner_id=owner_id)
            self._sessions[sid]["chat_history"].append({"role": role, "content": content})
            self._sessions[sid]["updated_at"] = datetime.now(timezone.utc)

    def _cleanup_expired_locked(self) -> None:
        now = datetime.now(timezone.utc)
        expired_keys = [
            sid
            for sid, data in self._sessions.items()
            if now - data.get("updated_at", now) > self._ttl
        ]
        for sid in expired_keys:
            self._sessions.pop(sid, None)
