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
Passenger does not run ASGI lifespan events, so logging is configured here at
import time rather than in FastAPI's ``lifespan``.

Engine disposal is deliberately **not** done here — see the note at the bottom
of this file before adding it back.
"""

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

configure_logging()

from a2wsgi import ASGIMiddleware  # noqa: E402, I001

from app.main import app  # noqa: E402

# The callable Passenger looks for — must match "Application entry point".
application = ASGIMiddleware(app)  # type: ignore[arg-type]

# ---------------------------------------------------------------------------
# Why there is no atexit engine disposal here
# ---------------------------------------------------------------------------
# An earlier version registered an atexit hook that spun up a fresh event loop
# and ran `engine.dispose()` on it. It cannot work, and it filled the log with
# a traceback on every worker recycle:
#
#     RuntimeError: Task <AsyncEngine.dispose()> got Future <...>
#                   attached to a different loop
#
# asyncpg connections are bound to the event loop that created them — the loop
# a2wsgi runs per request. By the time atexit fires, that loop is gone, and
# closing the connections from a new one is not permitted. SQLAlchemy caught
# the error per connection, logged it, and closed nothing.
#
# It also wasn't needed. This runs as the process exits, so the OS closes every
# socket and Postgres reclaims the sessions regardless. Removing the hook
# changes no behaviour; it only removes a misleading traceback.
#
# If pooled connections ever do need releasing mid-life, do it from inside the
# request loop (an ASGI shutdown handler or middleware), never from atexit.
