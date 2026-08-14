# ERP Frontend

Mobile-first PWA for the ERP. React 19 + Vite + TypeScript + TanStack Query. Talks to the FastAPI backend under `/api/v1` (see `src/services/api/client.ts` and the repo-root `API_CONVENTIONS.md`).

## Layout

```
src/features/    per-module API wrappers + TanStack Query hooks (auth, products, inventory, ...)
src/pages/       route pages (AppRoutes.tsx wires them up)
src/components/  shared UI (ui/* is the shadcn-style primitives)
src/layouts/     sidebar / mobile tab navigation (navItems.ts)
src/pwa/         service worker registration
src/routes/      route definitions
```

## Local development

```bash
npm install
npm run dev          # http://localhost:5173
```

The dev server proxies `/api` and `/sync` to `http://localhost:8000` (see `vite.config.ts`); `VITE_API_BASE_URL` overrides the base for production builds.

## Quality gates

```bash
npm run lint              # eslint
npm run format:check      # prettier
npm run typecheck         # tsc -b --noEmit
npm run build             # tsc -b + vite build (PWA service worker generated)
npm run validate:manifest # after build — manifest must be installable
npm run lhci              # Lighthouse CI, informational, never fails the build
```

## PWA offline shell

- Service worker registered explicitly from `src/pwa/registerServiceWorker.ts` (`vite.config.ts` sets `injectRegister: false`; `registerType: "autoUpdate"` applies updates without prompting, plus an hourly `registration.update()` check).
- `workbox.navigateFallback` = `/index.html`, denylisting `/api` and `/sync` — uncached navigation resolves to the cached app shell. The app shell **is** the offline fallback page.
- After deploying a new build, the service worker caches old JS — hard-refresh the PWA (Ctrl+Shift+R) to pick up changes.
- PWA manifest still uses the placeholder `favicon.svg`. Replace with real 192x192 / 512x512 (maskable) PNGs once branding is finalized.

## Business-specific hardcoded values

- `src/features/configurable/ConfigurableWizard.tsx` — `AXIS_LABELS` hardcodes the per-rail tube labels (`tube28: "Tube 28"`, `tube19: "Tube 19"`); add a label here when new rail axes are introduced.

See repo-root `README.md` for the full list of known hardcoded business values.
