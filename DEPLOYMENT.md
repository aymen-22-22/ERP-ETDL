# Deployment Guide — cPanel (Passenger) + PostgreSQL

The backend is FastAPI (**ASGI**); cPanel's Python Selector serves **WSGI**
through Phusion Passenger. `backend/passenger_wsgi.py` bridges the two using
`a2wsgi`. The frontend is a static SPA build served as plain files.

## Prerequisites

- **Python 3.14** — the project uses `uuid.uuid7()` and PEP 758 `except`
  syntax, both 3.14-only. Selecting 3.13 in cPanel means the app will not
  import at all.
- A PostgreSQL database (local to cPanel or a remote server).
- Node.js 20+ to build the frontend (can be built locally and uploaded).

---

## 1. Backend

### 1.1 Upload

Upload the contents of `backend/` into the application root you configure in
cPanel (e.g. `erpapp`), so `passenger_wsgi.py` is at its top level:

```
/home/<cpanel-user>/erpapp/
├── passenger_wsgi.py
├── requirements.txt
├── alembic.ini
├── alembic/
├── app/
└── .env                <- created in 1.2; never commit this
```

Do **not** upload `.venv/` — cPanel creates its own virtualenv.

> **`.env` location matters.** Settings load from the backend root
> (`app/shared/core/config.py` resolves it as an absolute path), so `.env` must
> sit next to `passenger_wsgi.py` — *not* in your cPanel home directory.

### 1.2 Environment

Copy `backend/.env.production.example` to `.env` in the application root and
fill it in. Two entries matter most:

- **`JWT_SECRET_KEY`** — the app **refuses to start** in production while this
  is the placeholder value. Generate one:
  ```bash
  python -c "import secrets; print(secrets.token_urlsafe(64))"
  ```
- **`CORS_ORIGINS`** — the exact origin serving the frontend, e.g.
  `["https://stock.etdledger.com"]`. Scheme + host, no trailing slash. A
  mismatch is the usual cause of "blocked by CORS policy" in the browser.

For a **remote** database, TLS is added automatically in production for
non-local hosts, so `DATABASE_URL` needs no `ssl` parameter unless you want a
stricter mode (`verify-full`).

### 1.3 Create the app in cPanel

| Field | Value |
|---|---|
| Python version | **3.14** |
| Application root | `erpapp` |
| Application URL | your API domain/subdomain |
| Application startup file | `passenger_wsgi.py` |
| Application entry point | `application` |

Create the application-root folder **before** submitting the form — the
selector returns *"No such application (or application not configured)"* when
it cannot resolve the path.

### 1.4 Install dependencies and migrate

From the cPanel terminal (or SSH), activate the virtualenv cPanel created — the
exact `source .../bin/activate` command is shown on the app's page — then:

```bash
pip install -r requirements.txt
alembic upgrade head
```

`alembic upgrade head` creates the schema, the RLS policies, and the seeded
roles/permissions. Re-run it after any deployment that adds migrations.

### 1.5 Restart

Use **Restart** on the cPanel application page after any code or `.env` change.
Passenger caches the loaded application; edits are not picked up until it
restarts.

### 1.6 First account

Register through the app's own `/register` page. It creates the user, their
tenant, the owner role assignment and the tenant's default warehouse in a
single transaction.

Additional staff are then added from inside the app (owner or admin only) —
they do **not** self-register, since registering always creates a brand-new
tenant.

---

## 2. Frontend

Build with the API URL baked in. Vite inlines `VITE_*` values at **build
time**, so setting this on the server afterwards has no effect:

```bash
cd frontend
VITE_API_BASE_URL=https://api.your-domain.com npm run build
```

Upload the **contents** of `frontend/dist/` to the document root of the domain
serving the app (e.g. `public_html/`).

### 2.1 SPA routing

Client-side routing means a hard refresh on `/products` would otherwise 404.
Add `.htaccess` beside `index.html`:

```apache
<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteBase /
  RewriteRule ^index\.html$ - [L]
  RewriteCond %{REQUEST_FILENAME} !-f
  RewriteCond %{REQUEST_FILENAME} !-d
  RewriteRule . /index.html [L]
</IfModule>
```

### 2.2 HTTPS is not optional

The service worker — and therefore offline mode, installability and background
sync — only works over HTTPS (or localhost). Enable AutoSSL for the domain.

---

## 3. Verify

```bash
curl https://api.your-domain.com/health          # {"status":"ok"}
curl https://api.your-domain.com/health/ready    # {"status":"ready"}
```

`/health/ready` runs `SELECT 1` against PostgreSQL, so a failure there is a
database connectivity or credentials problem, not an application one.

Then in the browser: register a tenant, sign in, and confirm there are no CORS
errors in the console.

---

## 4. Environment variables

| Variable | Required | Default | Notes |
|---|---|---|---|
| `DATABASE_URL` | Yes | — | asyncpg connection string |
| `JWT_SECRET_KEY` | Yes | — | Startup fails in production if left as the placeholder |
| `CORS_ORIGINS` | Yes | localhost dev ports | JSON array of exact frontend origins |
| `ENVIRONMENT` | No | `local` | Set to `production` (passenger_wsgi.py defaults it) |
| `DEBUG` | No | `false` | |
| `SQL_ECHO` | No | `false` | Logs every statement — expensive, leave off |
| `DB_POOL_SIZE` | No | `5` | Per worker process |
| `DB_MAX_OVERFLOW` | No | `5` | Per worker process |
| `DB_POOL_RECYCLE_SECONDS` | No | `900` | Recycle before idle timeouts drop links |
| `REDIS_URL` | No | localhost | Fails open when unreachable |
| `RATE_LIMIT_PER_MINUTE` | No | `60` | |

---

## 5. Known constraints on this platform

- **Redis is normally absent on shared hosting.** Safe: the cache and rate
  limiter fail open behind a short circuit breaker, so requests still succeed —
  you lose rate limiting on login, nothing more.
- **`a2wsgi` serialises async work per request.** Fine for a shop with a
  handful of concurrent users; it will not scale like uvicorn. Outgrowing it
  means moving the backend to a container host and running uvicorn directly —
  no code changes, only a different process manager.
- **Connection limits.** Passenger forks several workers, each with its own
  pool, so real usage is roughly `(DB_POOL_SIZE + DB_MAX_OVERFLOW) × workers`.
  If the database starts refusing connections, lower those two first.
- **Cold starts.** Passenger idles applications out; the first request after a
  quiet period pays the import cost.
