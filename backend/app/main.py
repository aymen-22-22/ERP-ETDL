from collections.abc import AsyncGenerator, Awaitable, Callable
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text

from app import models as _models  # noqa: F401  — populates Base.metadata with every model
from app.api_v1 import api_v1_router
from app.shared.core.config import get_settings
from app.shared.core.exceptions import register_exception_handlers
from app.shared.core.logging import configure_logging
from app.shared.database.session import engine

settings = get_settings()


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncGenerator[None]:
    configure_logging()
    yield
    await engine.dispose()


def create_app() -> FastAPI:
    app = FastAPI(
        title=settings.app_name,
        debug=settings.debug,
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.middleware("http")
    async def no_store_cache_headers(
        request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        """Every response gets `Cache-Control: no-store`.

        The production host sits behind an nginx layer (cPanel's reverse-proxy
        cache in front of Passenger) that was observed caching GET API
        responses by URL alone, ignoring the `Authorization` header entirely —
        a client could keep getting a pre-transfer stock count minutes after
        the transfer completed, because the *first* request to a given URL got
        cached and every later request to that same URL was served from cache
        regardless of what changed in the database. `no-store` is the one
        directive every HTTP cache (browser, CDN, or a reverse proxy like this)
        is required to honor, so it's the only thing that reliably stops that
        layer from caching authenticated, ever-changing API data.
        """
        response = await call_next(request)
        response.headers["Cache-Control"] = "no-store"
        return response

    register_exception_handlers(app)
    app.include_router(api_v1_router)

    settings.media_root_path.mkdir(parents=True, exist_ok=True)
    app.mount(
        settings.media_url_prefix,
        StaticFiles(directory=settings.media_root_path),
        name="media",
    )

    @app.get("/health", tags=["system"])
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/health/ready", tags=["system"])
    async def readiness() -> dict[str, str]:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        return {"status": "ready"}

    return app


app = create_app()
