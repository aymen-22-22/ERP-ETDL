import json
from datetime import datetime
from typing import Any
from uuid import UUID

from redis.asyncio import Redis
from redis.exceptions import RedisError

from app.shared.core.logging import get_logger
from app.shared.core.redis import get_redis, is_redis_available, note_redis_failure

logger = get_logger(__name__)

DEFAULT_TTL = 30  # seconds


class TenantCache:
    """Tenant-scoped Redis read cache with fail-open semantics.

    Cache keys are namespaced by tenant so different tenants never share
    entries.  ``None`` is returned on any Redis failure — callers fall back
    to the DB path transparently.

    Usage::

        cache = TenantCache()

        # Read path
        cached = await cache.get(tenant_id, "products", "list", query_hash)
        if cached is not None:
            return cached

        result = await _query_db(...)
        await cache.set(tenant_id, "products", "list", query_hash, result)
        return result

        # Write path — invalidate all product caches for this tenant
        await cache.invalidate_pattern(tenant_id, "products")
    """

    async def _redis(self) -> Redis:
        return get_redis()

    def _key(self, tenant_id: UUID, entity: str, *parts: str) -> str:
        return f"cache:{tenant_id}:{entity}:{':'.join(parts)}"

    async def get(self, tenant_id: UUID, entity: str, *key_parts: str) -> Any | None:
        """Fetch a cached value. Returns ``None`` on miss or Redis error."""
        if not is_redis_available():
            return None
        key = self._key(tenant_id, entity, *key_parts)
        try:
            raw = await (await self._redis()).get(key)
        except (RedisError, OSError) as exc:
            note_redis_failure()
            logger.warning("cache_get_error", key=key, error=str(exc))
            return None
        if raw is None:
            return None
        try:
            return json.loads(raw)
        except json.JSONDecodeError, TypeError:
            return None

    async def set(
        self,
        tenant_id: UUID,
        entity: str,
        *key_parts: str,
        ttl: int = DEFAULT_TTL,
        value: Any,
    ) -> None:
        """Store a JSON-serialisable value under a tenant-scoped key."""
        if not is_redis_available():
            return
        key = self._key(tenant_id, entity, *key_parts)
        try:
            await (await self._redis()).setex(key, ttl, json.dumps(value, default=_json_default))
        except (RedisError, OSError) as exc:
            note_redis_failure()
            logger.warning("cache_set_error", key=key, error=str(exc))

    async def invalidate_pattern(self, tenant_id: UUID, entity: str) -> None:
        """Delete every cached key matching ``cache:{tenant_id}:{entity}:*``.

        Uses SCAN (not KEYS) so it doesn't block the event loop on large
        keyspaces.  Fails open — on Redis error nothing is deleted and a
        warning is logged.
        """
        if not is_redis_available():
            return
        pattern = f"cache:{tenant_id}:{entity}:*"
        try:
            redis = await self._redis()
            cursor = 0
            while True:
                cursor, keys = await redis.scan(cursor=cursor, match=pattern, count=100)
                if keys:
                    await redis.delete(*keys)
                if cursor == 0:
                    break
        except (RedisError, OSError) as exc:
            note_redis_failure()
            logger.warning("cache_invalidate_error", pattern=pattern, error=str(exc))


def _json_default(obj: Any) -> Any:
    """JSON encoder fallback for common Python types."""
    if isinstance(obj, UUID):
        return str(obj)
    if isinstance(obj, datetime):
        return obj.isoformat()
    raise TypeError(f"Object of type {type(obj).__name__} is not JSON serializable")


# Module-level singleton — lazy like get_redis().
_tenant_cache: TenantCache | None = None


def get_tenant_cache() -> TenantCache:
    global _tenant_cache
    if _tenant_cache is None:
        _tenant_cache = TenantCache()
    return _tenant_cache
