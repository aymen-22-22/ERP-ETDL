# Deployment Guide — cPanel with Passenger

## Prerequisites

- Python 3.14+ (via cPanel "Setup Python App" or system Python)
- PostgreSQL database (created in cPanel "Databases")
- Node.js 18+ (for frontend build)

## Directory Structure

```
~/
├── .htaccess                    # Apache rewrite rules
├── passenger_wsgi.py            # Passenger WSGI entry point
├── backend/
│   ├── requirements.txt
│   ├── alembic.ini
│   ├── alembic/
│   └── app/
├── frontend/
│   └── dist/                    # Built frontend (served as static)
└── .env                         # Environment variables
```

## Steps

### 1. Upload Code

Upload the backend and frontend directories to your cPanel home directory
(or a subdirectory). Upload `.htaccess` and `passenger_wsgi.py` to the
document root.

### 2. Create PostgreSQL Database

In cPanel → PostgreSQL Databases:
1. Create a database (e.g. `youruser_erp`)
2. Create a user and add it to the database
3. Note the connection string: `postgresql+asyncpg://user:pass@localhost/youruser_erp`

### 3. Set Up Python Environment

```bash
cd ~/backend
python3.14 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### 4. Configure Environment

Create `~/.env` (or set via cPanel "Setup Python App"):

```
ENVIRONMENT=production
DEBUG=false
DATABASE_URL=postgresql+asyncpg://user:pass@localhost/youruser_erp
REDIS_URL=redis://localhost:6379/0
JWT_SECRET_KEY=<generate-a-random-64-char-string>
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=15
REFRESH_TOKEN_EXPIRE_DAYS=30
CORS_ORIGINS=["https://yourdomain.com"]
```

Generate a secret key:
```bash
python3 -c "import secrets; print(secrets.token_hex(32))"
```

### 5. Run Database Migrations

```bash
cd ~/backend
source venv/bin/activate
alembic upgrade head
```

### 6. Build Frontend

```bash
cd ~/frontend
npm ci
npm run build
```

The output goes to `frontend/dist/`. The `.htaccess` serves these files
directly.

### 7. Passenger Configuration

cPanel "Setup Python App" should point to:
- **Application root**: your deployment directory
- **Application startup file**: `passenger_wsgi.py`
- **Python version**: 3.14

### 8. Create Admin User

```bash
cd ~/backend
source venv/bin/activate
python -c "
import asyncio
from app.auth.service import register_user
from app.shared.database.session import async_session

async def create():
    async with async_session() as s:
        await register_user(s, email='admin@yourdomain.com', password='changeme', name='Admin')
        await s.commit()

asyncio.run(create())
"
```

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | Yes | — | PostgreSQL connection string (asyncpg) |
| `JWT_SECRET_KEY` | Yes | — | Random string for JWT signing |
| `ENVIRONMENT` | No | `local` | `local`, `staging`, or `production` |
| `DEBUG` | No | `true` | Set `false` in production |
| `REDIS_URL` | No | `redis://localhost:6379/0` | Redis for caching (fails open if unavailable) |
| `CORS_ORIGINS` | No | `["http://localhost:5173"]` | JSON array of allowed origins |

## Notes

- **Redis**: Optional — the app degrades gracefully without it (no rate
  limiting, no server-side caching).
- **Offline sync**: The PWA works fully offline. Data syncs when connectivity
  returns via the mutation queue.
- **HTTPS**: Configure in cPanel → Security → SSL/TLS. The frontend API base
  URL should use `https://`.
