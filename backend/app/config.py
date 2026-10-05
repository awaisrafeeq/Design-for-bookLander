from functools import lru_cache
from typing import Literal

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore", case_sensitive=False)

    app_env: Literal["development", "test", "staging", "production"] = "development"
    app_name: str = "BookLender Studio API"
    api_prefix: str = "/api/v1"
    database_url: str = "postgresql+psycopg://booklender:change-me@localhost:5432/booklender"
    redis_url: str = "redis://localhost:6379/0"
    session_cookie_name: str = "bl_session"
    session_ttl_hours: int = 12
    auth_login_max_attempts: int = 10
    auth_login_window_seconds: int = 900
    cookie_secure: bool = False
    allowed_origins: list[str] = ["http://localhost:3000"]
    bootstrap_admin_email: str | None = None
    bootstrap_admin_password: str | None = None
    booklender_timezone: str = "America/New_York"
    ai_daily_spend_cap_usd: float = 5.0
    openrouter_api_key: str = ""
    openrouter_model: str = ""
    zernio_api_key: str = ""
    zernio_profile_id: str = ""
    zernio_webhook_secret: str = ""
    predis_api_key: str = ""
    predis_brand_id: str = ""
    creatify_api_id: str = ""
    creatify_api_key: str = ""
    creatify_tts_accent: str = ""
    public_app_url: str = ""
    media_root: str = "/data/media"
    media_signing_key: str = ""
    media_max_upload_mb: int = 100
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_username: str = ""
    smtp_password: str = ""
    smtp_from: str = ""
    smtp_security: Literal["starttls", "ssl"] = "starttls"

    @field_validator("session_ttl_hours")
    @classmethod
    def validate_session_ttl(cls, value: int) -> int:
        if not 1 <= value <= 168:
            raise ValueError("SESSION_TTL_HOURS must be between 1 and 168")
        return value

    @field_validator("auth_login_max_attempts")
    @classmethod
    def validate_login_attempts(cls, value: int) -> int:
        if not 3 <= value <= 100:
            raise ValueError("AUTH_LOGIN_MAX_ATTEMPTS must be between 3 and 100")
        return value

    @field_validator("auth_login_window_seconds")
    @classmethod
    def validate_login_window(cls, value: int) -> int:
        if not 60 <= value <= 86400:
            raise ValueError("AUTH_LOGIN_WINDOW_SECONDS must be between 60 and 86400")
        return value

    @field_validator("ai_daily_spend_cap_usd")
    @classmethod
    def validate_spend_cap(cls, value: float) -> float:
        if value <= 0:
            raise ValueError("AI_DAILY_SPEND_CAP_USD must be positive")
        return value

    @model_validator(mode="after")
    def require_secure_production_cookie(self) -> "Settings":
        if self.app_env == "production" and not self.cookie_secure:
            raise ValueError("COOKIE_SECURE must be true in production")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
