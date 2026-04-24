from __future__ import annotations

import base64
import hashlib
import hmac
import logging
import os
import re
from uuid import uuid4
from datetime import datetime, timedelta, timezone

import jwt
from bson import ObjectId
from bson.errors import InvalidId
from fastapi import HTTPException
from jwt import InvalidTokenError
from pymongo.errors import DuplicateKeyError, PyMongoError

from app.core.config import settings
from app.core.database import mongo_store
from app.models.schemas import AuthUser

EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
PBKDF2_ITERATIONS = 210_000
logger = logging.getLogger(__name__)


class AuthService:
    def __init__(self) -> None:
        self._jwt_secret = settings.jwt_secret
        self._jwt_exp_minutes = settings.jwt_exp_minutes
        self._allow_in_memory_fallback = settings.allow_in_memory_auth_fallback
        self._indexes_ready = False
        self._mongo_unavailable = False
        self._local_users_by_email: dict[str, dict] = {}
        self._local_users_by_id: dict[str, dict] = {}

    def _should_use_mongo(self) -> bool:
        return mongo_store.enabled and not self._mongo_unavailable

    def _mark_mongo_unavailable(self, exc: Exception) -> None:
        if not self._mongo_unavailable:
            if self._allow_in_memory_fallback:
                logger.warning("MongoDB auth store unavailable. Switching to in-memory fallback: %s", exc)
            else:
                logger.warning("MongoDB auth store unavailable: %s", exc)
        self._mongo_unavailable = True
        self._indexes_ready = False

    def _ensure_in_memory_fallback_allowed(self) -> None:
        if self._allow_in_memory_fallback:
            return
        raise HTTPException(
            status_code=503,
            detail=(
                "Persistent auth store is unavailable. Configure MONGO_URI, or set "
                "ALLOW_IN_MEMORY_AUTH_FALLBACK=true only for local development."
            ),
        )

    def _require_jwt_secret(self) -> str:
        if not self._jwt_secret:
            raise HTTPException(status_code=500, detail="JWT_SECRET is not configured on the server.")
        return self._jwt_secret

    def _ensure_user_indexes(self) -> None:
        if self._indexes_ready or not self._should_use_mongo():
            return

        users = mongo_store.get_collection("users")
        users.create_index("email", unique=True)
        self._indexes_ready = True

    def _normalize_email(self, email: str) -> str:
        normalized = email.strip().lower()
        if not EMAIL_PATTERN.match(normalized):
            raise HTTPException(status_code=400, detail="Invalid email format.")
        return normalized

    def _hash_password(self, password: str, salt: bytes | None = None) -> tuple[str, str]:
        salt_bytes = salt or os.urandom(16)
        digest = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode("utf-8"),
            salt_bytes,
            PBKDF2_ITERATIONS,
        )
        return (
            base64.b64encode(salt_bytes).decode("utf-8"),
            base64.b64encode(digest).decode("utf-8"),
        )

    def _verify_password(self, password: str, salt_b64: str, hash_b64: str) -> bool:
        try:
            salt = base64.b64decode(salt_b64.encode("utf-8"))
            expected_hash = base64.b64decode(hash_b64.encode("utf-8"))
        except Exception:
            return False

        candidate_digest = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode("utf-8"),
            salt,
            PBKDF2_ITERATIONS,
        )
        return hmac.compare_digest(candidate_digest, expected_hash)

    def _to_auth_user(self, user_doc: dict) -> AuthUser:
        return AuthUser(
            id=str(user_doc.get("_id", "")),
            email=str(user_doc.get("email", "")),
            name=str(user_doc.get("name", "")),
            picture=str(user_doc.get("picture", "")),
            role=str(user_doc.get("role", "")),
            department=str(user_doc.get("department", "")),
            created_at=user_doc.get("created_at"),
            last_login_at=user_doc.get("last_login_at"),
        )

    def _create_local_user(
        self,
        normalized_name: str,
        normalized_email: str,
        password: str,
        safe_role: str,
        safe_department: str,
    ) -> dict:
        if normalized_email in self._local_users_by_email:
            raise HTTPException(status_code=409, detail="Email already exists. Please log in.")

        now_iso = datetime.now(timezone.utc).isoformat()
        password_salt, password_hash = self._hash_password(password)
        user_doc = {
            "_id": f"local-{uuid4().hex}",
            "email": normalized_email,
            "name": normalized_name,
            "picture": "",
            "role": safe_role,
            "department": safe_department,
            "password_salt": password_salt,
            "password_hash": password_hash,
            "created_at": now_iso,
            "last_login_at": now_iso,
            "updated_at": now_iso,
        }
        self._local_users_by_email[normalized_email] = user_doc
        self._local_users_by_id[str(user_doc["_id"])] = user_doc
        return user_doc

    def register_user(
        self,
        name: str,
        email: str,
        password: str,
        role: str | None = None,
        department: str | None = None,
    ) -> AuthUser:
        normalized_email = self._normalize_email(email)
        normalized_name = name.strip()
        if len(normalized_name) < 2:
            raise HTTPException(status_code=400, detail="Name must be at least 2 characters.")

        safe_role = (role or "").strip()[:80]
        safe_department = (department or "").strip()[:120]

        if self._should_use_mongo():
            try:
                self._ensure_user_indexes()
                users = mongo_store.get_collection("users")
                now_iso = datetime.now(timezone.utc).isoformat()
                password_salt, password_hash = self._hash_password(password)

                user_doc = {
                    "email": normalized_email,
                    "name": normalized_name,
                    "picture": "",
                    "role": safe_role,
                    "department": safe_department,
                    "password_salt": password_salt,
                    "password_hash": password_hash,
                    "created_at": now_iso,
                    "last_login_at": now_iso,
                    "updated_at": now_iso,
                }

                inserted = users.insert_one(user_doc)
                created_user = users.find_one({"_id": inserted.inserted_id}) or user_doc
                if "_id" not in created_user:
                    created_user["_id"] = inserted.inserted_id
                return self._to_auth_user(created_user)
            except DuplicateKeyError as exc:
                raise HTTPException(status_code=409, detail="Email already exists. Please log in.") from exc
            except PyMongoError as exc:
                self._mark_mongo_unavailable(exc)
            except Exception as exc:
                self._mark_mongo_unavailable(exc)

        self._ensure_in_memory_fallback_allowed()
        local_user = self._create_local_user(
            normalized_name=normalized_name,
            normalized_email=normalized_email,
            password=password,
            safe_role=safe_role,
            safe_department=safe_department,
        )
        return self._to_auth_user(local_user)

    def authenticate_user(self, email: str, password: str) -> AuthUser:
        normalized_email = self._normalize_email(email)

        if self._should_use_mongo():
            try:
                users = mongo_store.get_collection("users")
                user_doc = users.find_one({"email": normalized_email})

                if not user_doc:
                    raise HTTPException(status_code=401, detail="Invalid email or password.")

                password_salt = str(user_doc.get("password_salt", ""))
                password_hash = str(user_doc.get("password_hash", ""))
                if not self._verify_password(password, password_salt, password_hash):
                    raise HTTPException(status_code=401, detail="Invalid email or password.")

                now_iso = datetime.now(timezone.utc).isoformat()
                users.update_one(
                    {"_id": user_doc["_id"]},
                    {"$set": {"last_login_at": now_iso, "updated_at": now_iso}},
                )
                user_doc["last_login_at"] = now_iso
                return self._to_auth_user(user_doc)
            except HTTPException:
                raise
            except PyMongoError as exc:
                self._mark_mongo_unavailable(exc)
            except Exception as exc:
                self._mark_mongo_unavailable(exc)

        self._ensure_in_memory_fallback_allowed()
        user_doc = self._local_users_by_email.get(normalized_email)
        if not user_doc:
            raise HTTPException(status_code=401, detail="Invalid email or password.")

        password_salt = str(user_doc.get("password_salt", ""))
        password_hash = str(user_doc.get("password_hash", ""))
        if not self._verify_password(password, password_salt, password_hash):
            raise HTTPException(status_code=401, detail="Invalid email or password.")

        now_iso = datetime.now(timezone.utc).isoformat()
        user_doc["last_login_at"] = now_iso
        user_doc["updated_at"] = now_iso
        return self._to_auth_user(user_doc)

    def create_access_token(self, user: AuthUser) -> tuple[str, int]:
        jwt_secret = self._require_jwt_secret()
        now = datetime.now(timezone.utc)
        expires = now + timedelta(minutes=self._jwt_exp_minutes)
        payload = {
            "sub": user.id,
            "email": user.email,
            "name": user.name,
            "picture": user.picture,
            "role": user.role,
            "department": user.department,
            "iat": int(now.timestamp()),
            "exp": int(expires.timestamp()),
        }
        token = jwt.encode(payload, jwt_secret, algorithm="HS256")
        return token, self._jwt_exp_minutes * 60

    def verify_access_token(self, token: str) -> AuthUser:
        jwt_secret = self._require_jwt_secret()
        try:
            payload = jwt.decode(token, jwt_secret, algorithms=["HS256"])
        except InvalidTokenError as exc:
            raise HTTPException(status_code=401, detail="Invalid or expired auth token.") from exc

        user_id = str(payload.get("sub", "")).strip()
        if not user_id:
            raise HTTPException(status_code=401, detail="Auth token payload is invalid.")

        if self._should_use_mongo():
            try:
                users = mongo_store.get_collection("users")
                user_doc = None
                try:
                    user_doc = users.find_one({"_id": ObjectId(user_id)})
                except InvalidId:
                    user_doc = users.find_one({"_id": user_id})

                if not user_doc:
                    raise HTTPException(status_code=401, detail="User not found.")
                return self._to_auth_user(user_doc)
            except HTTPException:
                raise
            except PyMongoError as exc:
                self._mark_mongo_unavailable(exc)
            except Exception as exc:
                self._mark_mongo_unavailable(exc)

        self._ensure_in_memory_fallback_allowed()
        local_user = self._local_users_by_id.get(user_id)
        if local_user:
            return self._to_auth_user(local_user)

        raise HTTPException(status_code=401, detail="User not found.")
