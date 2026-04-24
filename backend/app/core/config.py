from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Edu Simplify API"
    gemini_api_key: str = ""
    gemini_model: str = "models/gemini-2.5-flash"
    ollama_enabled: bool = True
    ollama_base_url: str = "http://127.0.0.1:11434"
    ollama_model: str = "llama3.2:3b"
    ollama_timeout_seconds: float = 8.0
    ollama_retry_cooldown_seconds: int = 60
    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000"
    cors_origin_regex: str = (
        r"^https?://("
        r"localhost|127\.0\.0\.1|0\.0\.0\.0|"
        r"10(?:\.\d{1,3}){3}|"
        r"172\.(1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2}|"
        r"192\.168(?:\.\d{1,3}){2}"
        r")(:\d+)?$"
    )
    session_ttl_minutes: int = 240
    jwt_secret: str = ""
    jwt_exp_minutes: int = 10080
    mongo_uri: str = ""
    mongo_db_name: str = "edu_simplify"
    allow_in_memory_auth_fallback: bool = False

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    @field_validator("gemini_api_key", "jwt_secret", "mongo_uri", mode="before")
    @classmethod
    def normalize_placeholder_settings(cls, value: str) -> str:
        cleaned = (value or "").strip()
        lowered = cleaned.lower()
        if not cleaned:
            return ""
        if lowered == "your_gemini_api_key_here":
            return ""
        if lowered in {"replace_with_secure_random_secret", "dev-jwt-secret-change-me"}:
            return ""
        if "username:password@cluster.mongodb.net" in lowered:
            return ""
        return cleaned

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


settings = Settings()
