# Deployment — what is host-specific and what isn't

The app is portable. Only a thin layer is tied to a particular host, and that
layer is isolated here so moving providers doesn't mean rediscovering it.

## Portable — never changes between hosts

- The whole `backend/app/` package and all Alembic migrations
- The frontend source
- The database. If it's managed (Neon, Supabase, RDS) it doesn't move at all —
  same `DATABASE_URL`, same data, no re-migration.
- The *names* of the environment variables

## Changes per host — three values

| Variable | Notes |
|---|---|
| `CORS_ORIGINS` | The new frontend origin. A mismatch is the usual "blocked by CORS policy". |
| `VITE_API_BASE_URL` | Vite inlines this **at build time** — the frontend must be rebuilt, not just reconfigured. |
| `DATABASE_URL` | Unchanged when staying with the same managed database. |

## cPanel / Passenger only — delete these on any other host

| File | Why it exists |
|---|---|
| `backend/passenger_wsgi.py` | Passenger speaks WSGI; FastAPI is ASGI |
| `deploy/cpanel/.htaccess` | Apache routing + SPA fallback |
| `a2wsgi` dependency | Used solely by `passenger_wsgi.py` |

None of that exists on a container host, because there uvicorn serves the ASGI
app directly — no adapter, and no per-request async penalty.

---

## Container host (Railway, Render, Fly.io, VPS + Docker)

The `backend/Dockerfile` is multi-stage.

```bash
docker build --target production -t erp-backend ./backend
```

The `production` stage differs from `dev` deliberately: no `--reload` (it runs
a file-watching supervisor and is unsupported in production), no `[dev]`
extras (ruff/mypy/pytest don't belong in a runtime image), and it runs as a
non-root user.

`docker-compose.yml` targets the `dev` stage for local work.

Steps:

1. Point the platform at the repo; it builds from the Dockerfile.
2. Set `DATABASE_URL`, `JWT_SECRET_KEY`, `CORS_ORIGINS`.
3. Run `alembic upgrade head` once. It's a no-op against an already-migrated
   database, so reusing an existing managed instance is safe.
4. Rebuild the frontend with the new `VITE_API_BASE_URL` and deploy `dist/`.

**Workers vs. the connection pool:** each uvicorn worker is a process with its
own pool, so real connection usage is roughly
`(DB_POOL_SIZE + DB_MAX_OVERFLOW) × workers`. Check the database's connection
limit before raising `--workers`.

---

## cPanel

See `DEPLOYMENT.md` in the repository root for the full procedure. The parts
that are easy to get wrong:

- **Python version must be 3.14.** The project uses `uuid.uuid7()` and PEP 758
  `except` syntax; on 3.13 it fails at import.
- **`.env` goes in the backend root**, beside `passenger_wsgi.py` — settings
  resolve it from there, not from the home directory.
- **Passenger caches the running process.** Editing a file changes nothing
  until you `touch tmp/restart.txt` in the app root or hit Restart in cPanel.
  Deleting `.pyc` files does not help; Python already invalidates those by
  mtime.
- **Read logs only after truncating them.** A stale traceback in
  `PassengerAppLogFile` looks identical to a live one — check the PID, or
  `: > logfile` before reproducing.
- `deploy/cpanel/.htaccess` is **not** deployed automatically. Copy it to the
  document root by hand after editing.
