from __future__ import annotations

from threading import RLock

from pymongo import MongoClient
from pymongo.collection import Collection
from pymongo.database import Database

from app.core.config import settings


class MongoStore:
    def __init__(self, uri: str, db_name: str) -> None:
        self._uri = uri.strip()
        self._db_name = db_name.strip() or "edu_simplify"
        self._lock = RLock()
        self._client: MongoClient | None = None

    @property
    def enabled(self) -> bool:
        return bool(self._uri)

    def _get_client(self) -> MongoClient:
        if not self.enabled:
            raise RuntimeError("MongoDB is not configured. Set MONGO_URI in backend .env.")

        with self._lock:
            if self._client is None:
                self._client = MongoClient(self._uri)
            return self._client

    def get_database(self) -> Database:
        client = self._get_client()
        return client[self._db_name]

    def get_collection(self, name: str) -> Collection:
        database = self.get_database()
        return database[name]


mongo_store = MongoStore(uri=settings.mongo_uri, db_name=settings.mongo_db_name)
