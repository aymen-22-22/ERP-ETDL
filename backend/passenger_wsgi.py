"""Passenger WSGI entry point for cPanel shared hosting.

cPanel's Passenger expects a WSGI callable.  FastAPI is ASGI, so we
wrap it with ``a2wsgi.ASGIMiddleware`` which bridges the two.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

os.environ.setdefault("ENVIRONMENT", "production")
os.environ.setdefault("DEBUG", "false")

from a2wsgi import ASGIMiddleware  # noqa: E402
from app.main import app  # noqa: E402

application = ASGIMiddleware(app)
