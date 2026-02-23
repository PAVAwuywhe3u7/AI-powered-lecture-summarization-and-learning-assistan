from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Edu Simplify API"
    gemini_api_key: str = ""
    gemini_model: str = "models/gemini-2.5-flash"
    ollama_enabled: bool = True
    ollama_base_url: str = "http://127.0.0.1:11434"
    ollama_model: str = "llama3.2:3b"
    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000"
    session_ttl_minutes: int = 240
    jwt_secret: str = "dev-jwt-secret-change-me"
    jwt_exp_minutes: int = 10080
    mongo_uri: str = ""
    mongo_db_name: str = "edu_simplify"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


settings = Settings()
