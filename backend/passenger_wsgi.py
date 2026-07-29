"""Passenger WSGI entry point for cPanel shared hosting.

cPanel's Passenger expects a WSGI callable. FastAPI is ASGI, so we wrap it with
``a2wsgi.ASGIMiddleware`` which bridges the two.

IMPORTANT — replacing cPanel's stub
-----------------------------------
cPanel generates a placeholder ``passenger_wsgi.py`` containing a ``load_source``
helper. If that stub survives (or is only partly edited) it ends up loading
*itself*, and Passenger dies with ``RecursionError: maximum recursion depth
exceeded``. This file must **replace** it completely: there is no ``load_source``
here, and there must not be one on the server either.

Lifespan gap
------------
Passenger does not run ASGI lifespan events, so the two things FastAPI's
``lifespan`` normally handles are done explicitly: logging is configured at
import time, and the database engine is disposed via ``atexit`` so pooled
connections are released when a worker is recycled.
"""

import atexit
import os
import sys

# Support both deployment layouts without the operator having to edit anything:
#   erpapp/passenger_wsgi.py + erpapp/app/...            (backend contents at root)
#   erpapp/passenger_wsgi.py + erpapp/backend/app/...    (repo backend/ nested)
_HERE = os.path.dirname(os.path.abspath(__file__))
_CANDIDATES = [_HERE, os.path.join(_HERE, "backend")]
_APP_ROOT = next(
    (path for path in _CANDIDATES if os.path.isdir(os.path.join(path, "app"))),
    _HERE,
)
if _APP_ROOT not in sys.path:
    sys.path.insert(0, _APP_ROOT)

# Must be set before anything imports app.shared.core.config: get_settings() is
# lru_cached, so the first read wins and later changes are ignored.
os.environ.setdefault("ENVIRONMENT", "production")
os.environ.setdefault("DEBUG", "false")

from app.shared.core.logging import configure_logging  # noqa: E402
from app.shared.database.session import engine  # noqa: E402

configure_logging()


def _sync_dispose_engine() -> None:  # pragma: no cover
    """Dispose the async engine from a sync atexit context.

    ``engine.dispose()`` is a coroutine, so it needs its own event loop here.
    Without this, every Passenger worker recycle abandons its pool — and against
    a remote Postgres with a connection cap those orphans accumulate until new
    connections are refused.
    """
    import asyncio

    loop = asyncio.new_event_loop()
    try:
        loop.run_until_complete(engine.dispose())
    finally:
        loop.close()


atexit.register(_sync_dispose_engine)


from a2wsgi import ASGIMiddleware  # noqa: E402, I001

from app.main import app  # noqa: E402

# The callable Passenger looks for — must match "Application entry point".
application = ASGIMiddleware(app)  # type: ignore[arg-type]
