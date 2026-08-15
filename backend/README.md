# ERP Backend

FastAPI (ASGI) backend served through Phusion Passenger via `passenger_wsgi.py`
(bridging ASGI through WSGI with `a2wsgi`). PostgreSQL via SQLAlchemy async + asyncpg.

## Layout

```
app/
  api/        route modules under /v1
  shared/     core config, database, security
  features/   per-module business logic (auth, products, inventory, ...)
alembic/      migrations (run `alembic upgrade head` after deploy)
passenger_wsgi.py  ASGI->WSGI bridge for cPanel
```

## Local development

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -e ".[dev]"
uvicorn app.main:app --reload --port 8000
```

## Quality gates

```bash
ruff check .
black --check .
mypy app
pytest -q
```

## Deployment

CI/CD is automated via GitHub Actions (`.github/workflows/backend-*.yml`):

- `backend-ci`     — ruff, black, mypy, pytest on every push touching `backend/**`
- `backend-deploy` — `git pull` + `touch tmp/restart.txt` on the cPanel host on
  pushes to `main` touching `backend/**`

**Migrations are still manual** on the server (activate the cPanel virtualenv,
then `alembic upgrade head`).
