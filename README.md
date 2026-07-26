# ERP SaaS

Multi-tenant ERP for small and medium businesses. Mobile-first PWA frontend, modular-monolith FastAPI backend, PostgreSQL with row-level tenant isolation.

Architecture and milestone roadmap: see the plan this repo was scaffolded from. Current status: **Milestone 0 — repo & tooling foundation** complete. No business logic yet — auth, tenancy, and inventory land in Milestones 1–4.

## Repository layout

```
backend/    FastAPI modular monolith (see backend/app/shared for cross-cutting code)
frontend/   React 19 + Vite + TypeScript PWA
.github/    CI workflows (lint/type-check/test per side)
```

## Local development

Requires Docker Desktop, or Python 3.13+ and Node 22+ if running natively.

```bash
cp .env.example .env
docker compose up --build
```

- Backend: http://localhost:8000 (docs at `/docs`, health at `/health`)
- Frontend: http://localhost:5173

### Running natively (without Docker)

Backend:
```bash
cd backend
python -m venv .venv
source .venv/Scripts/activate   # Windows Git Bash; use .venv/bin/activate on macOS/Linux
pip install -e ".[dev]"
uvicorn app.main:app --reload
```

Frontend:
```bash
cd frontend
npm install
npm run dev
```

## Quality gates

Backend (from `backend/`):
```bash
ruff check .
black --check .
mypy app
pytest -q
```

Frontend (from `frontend/`):
```bash
npm run lint
npm run format:check
npm run typecheck
npm run build
npm run validate:manifest   # after build — asserts the PWA manifest has the fields required to be installable
npm run lhci                # after build — Lighthouse CI, informational only, never fails the build
```

## PWA offline shell

- The service worker is registered explicitly from `src/pwa/registerServiceWorker.ts` (`vite.config.ts` sets `injectRegister: false` so this is the only registration path). `registerType: "autoUpdate"` + an immediate `updateSW(true)` on `onNeedRefresh` means updates apply with no user prompt; a periodic `registration.update()` check (hourly) works around browsers not polling for a new SW promptly on their own.
- `workbox.navigateFallback` is set to `/index.html`, denylisting `/api` and `/sync` — any uncached navigation resolves to the cached app shell instead of a browser offline error. Because this is a single-page app, the app shell itself **is** the offline fallback page; a separate static `offline.html` would be redundant (and isn't supported cleanly in `generateSW` mode without switching to a custom `injectManifest` service worker).
- The `/api/*` runtime-cache rule is explicitly scoped to `GET` (`method: "GET"`) — Workbox doesn't cache non-GET requests by default, but this makes it explicit now that `/sync/push` (a POST) is real traffic.
- `npm run validate:manifest` and `npm run lhci` both run in `frontend-ci.yml` after every build. Lighthouse CI is informational only (`continue-on-error: true`, assertions set to `warn`) — it establishes a baseline (PWA installability score, `interactive` vs. the <2s mid-range-Android target) without blocking CI before there's real page content to measure.
- PWA manifest currently uses the placeholder `favicon.svg` as its icon. Replace with real 192x192 / 512x512 (maskable) PNG icons once branding is finalized — SVG-only icons have inconsistent Android/Chrome install-prompt support. `npm run validate:manifest` will keep passing either way (it checks the manifest is well-formed, not that the icons are production-ready).

## Notes

- Multi-tenancy, auth, and RBAC are not implemented yet (Milestones 1–2).
