# API Conventions

Every business module mounts under `/api/v1` (see `backend/app/api_v1.py`). Infra probes (`/health`, `/health/ready`) stay unversioned — they're not part of the public API contract.

## Response envelope

- Single resource: `{ "data": { ... } }`
- List/paginated resource: `{ "data": [ ... ], "meta": { "page": 1, "page_size": 25, "total": 100, "pages": 4 } }`

Defined in `backend/app/shared/core/envelope.py` as `ResponseEnvelope[T]` / `PaginatedEnvelope[T]`. Every router return type wraps in one of these.

## Pagination contract

List endpoints accept `?page=1&page_size=25` (`PageParams` in `backend/app/shared/core/pagination.py`, `page_size` capped at 200) and return the `meta` block above (`PaginationMeta`). Cursor-based endpoints are the documented exception — currently only `/sync/pull`, which uses `since` / `cursor` / `has_more` instead, because a replication log doesn't fit page-based pagination.

## Error response contract

Every error is:

```json
{ "error": { "code": "snake_case_code", "message": "human-readable", "details": null } }
```

Defined as `ErrorResponse` / `ErrorBody` in `backend/app/shared/core/exceptions.py`. `code` is stable and meant to be matched on by clients; `message` is not — it can reword without notice.

## HTTP status conventions

| Status | Meaning |
|---|---|
| 200 | successful read/update |
| 201 | resource created |
| 204 | successful delete, no body |
| 400 | malformed request |
| 401 | missing/invalid credentials |
| 403 | authenticated but not permitted |
| 404 | resource not found |
| 409 | conflict (e.g. sync version mismatch, unique constraint) |
| 422 | request body/query failed validation |
| 429 | rate limited |
| 500 | unhandled server error |

## OpenAPI tags

One tag per module, matching the module's package name (`sync`, `auth`, `products`, ...), set via `APIRouter(prefix=..., tags=["<module>"])`.

## Versioning

All module routers register into `api_v1_router` in `backend/app/api_v1.py`, mounted once in `main.py`. A future breaking change ships as `/api/v2` alongside `/api/v1`, not an in-place break.
