"""Passenger WSGI entry point for cPanel shared hosting.

cPanel's Passenger expects a WSGI callable.  FastAPI is ASGI, so we
wrap it with ``a2wsgi.ASGIMiddleware`` which bridges the two.

Lifespan gap:  a2wsgi forwards lifespan events to FastAPI, but if the
hosting environment kills the process (SIGKILL, OOM, etc.) the shutdown
event never fires.  We register an ``atexit`` handler that disposes the
engine so pooled connections are released even on abnormal exit.
Logging is initialised at import time (not deferred to the lifespan)
so the first request always has structured logs.
"""

import atexit
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

os.environ.setdefault("ENVIRONMENT", "production")
os.environ.setdefault("DEBUG", "false")

from app.shared.core.logging import configure_logging  # noqa: E402
from app.shared.database.session import engine  # noqa: E402

configure_logging()


def _sync_dispose_engine() -> None:  # pragma: no cover
    """Dispose the async engine from a sync atexit context.

    ``engine.dispose()`` is a coroutine — we need a fresh event loop for it.
    """
    import asyncio

    loop = asyncio.new_event_loop()
    try:
        loop.run_until_complete(engine.dispose())
    finally:
        loop.close()


atexit.register(_sync_dispose_engine)


from a2wsgi import ASGIMiddleware  # noqa: E402

from app.main import app  # noqa: E402

application = ASGIMiddleware(app)
