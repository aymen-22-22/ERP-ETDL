from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, model_validator
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
    redis_url: str = Field(
        default="",
        description="Redis connection URL. Empty = Redis features (rate limiting, read cache) are disabled.",
    )
    # Separate from `debug`: echoing every statement is genuinely expensive and
    # very noisy, so it shouldn't be implied by running in debug mode.
    sql_echo: bool = False

    # Connection-pool sizing. Passenger (cPanel) forks several worker processes
    # and each one builds its own pool, so the real connection count against
    # Postgres is roughly (db_pool_size + db_max_overflow) x processes. The
    # defaults are deliberately small — a remote database will have a
    # connection limit, and exhausting it takes the whole app down.
    db_pool_size: int = 5
    db_max_overflow: int = 5
    # Recycle before typical network/proxy idle timeouts drop a connection that
    # the pool still believes is good. Matters much more against a remote host
    # than against localhost.
    db_pool_recycle_seconds: int = 900

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

    @model_validator(mode="after")
    def _guard_production_secrets(self) -> Settings:
        """Refuses to boot a production process with the placeholder signing key.

        The default exists so local development works with no setup, but it is
        published in the repository — anyone could mint valid access tokens for
        any tenant with it.  Failing loudly at startup is far better than
        shipping a deployment that looks healthy and is trivially forgeable.
        """
        if self.environment == "production" and self.jwt_secret_key == "change-me-in-env":
            raise ValueError(
                "JWT_SECRET_KEY is still the development placeholder. "
                "Set a strong random value before running in production."
            )
        return self

    @model_validator(mode="after")
    def _force_ssl_for_remote_db(self) -> Settings:
        """Append ``ssl=require`` to the DATABASE_URL when targeting a remote host.

        Sends credentials and tenant data across the network unencrypted
        otherwise.  The flag is only added when no SSL option is already
        present and the host is not ``localhost`` / ``127.0.0.1`` (local dev
        should keep working without SSL).

        Note the check covers both ``ssl=`` and ``sslmode=``: asyncpg takes
        ``ssl``, libpq-style URLs use ``sslmode``, and testing only for the
        latter would append a duplicate ``ssl=require`` to a URL that already
        had one.
        """
        if self.environment != "production":
            return self
        url = self.database_url
        already_configured = "ssl=" in url or "sslmode=" in url
        is_local = "localhost" in url or "127.0.0.1" in url
        if not already_configured and not is_local:
            sep = "&" if "?" in url else "?"
            self.database_url = f"{url}{sep}ssl=require"
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
