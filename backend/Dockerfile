# Python 3.14 is required, not optional: the project uses `uuid.uuid7()` and
# PEP 758 unparenthesized `except` tuples, both 3.14-only. On 3.13 the app
# raises at import time.
FROM python:3.14-slim AS base

WORKDIR /srv

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential libpq-dev curl \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml ./


# --- Development -------------------------------------------------------------
# Used by docker-compose: dev tooling plus --reload. The source is bind-mounted
# over /srv, so COPY here would be pointless.
FROM base AS dev

RUN pip install -e ".[dev]"

COPY . .

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]


# --- Production --------------------------------------------------------------
# Build with:  docker build --target production -t erp-backend ./backend
#
# Differences that matter:
#   * no --reload    — it spawns a file-watching supervisor and is explicitly
#                      unsupported for production use
#   * no [dev] extra — ruff/mypy/pytest have no business in a runtime image
#   * non-root user  — a container process should not run as root
FROM base AS production

RUN pip install .

COPY . .

RUN useradd --create-home --uid 1000 appuser && chown -R appuser:appuser /srv
USER appuser

EXPOSE 8000

# Workers are processes, each with its own connection pool — see DB_POOL_SIZE
# in shared/core/config.py before raising this against a capped database.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
