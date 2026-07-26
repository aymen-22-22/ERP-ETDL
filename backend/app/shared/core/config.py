from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

# backend/app/shared/core/config.py -> backend/
_BACKEND_ROOT = Path(__file__).resolve().parents[3]


class Settings(BaseSettings):
    # Absolute path, not a bare ".env": a relative path resolves against the
    # process's working directory, so starting the server from anywhere other
    # than backend/ silently loaded no config at all and fell back to defaults.
    model_config = SettingsConfigDict(
        env_file=_BACKEND_ROOT / ".env", env_file_encoding="utf-8", extra="ignore"
    )

    app_name: str = "ERP SaaS"
    environment: Literal["local", "staging", "production"] = "local"
    debug: bool = False

    database_url: str = Field(
        default="postgresql+asyncpg://erp:erp@localhost:5432/erp",
        description="Async SQLAlchemy connection string",
    )
    redis_url: str = "redis://localhost:6379/0"
    # Separate from `debug`: echoing every statement is genuinely expensive and
    # very noisy, so it shouldn't be implied by running in debug mode.
    sql_echo: bool = False

    jwt_secret_key: str = Field(default="change-me-in-env", min_length=1)
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 30

    # 5173 is Vite's default; it increments to 5174/5175 when a previous dev
    # server is still holding the port, so allow the usual fallbacks locally.
    cors_origins: list[str] = [
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:5175",
    ]

    rate_limit_per_minute: int = 60


@lru_cache
def get_settings() -> Settings:
    return Settings()
