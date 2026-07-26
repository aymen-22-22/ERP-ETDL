from collections.abc import Awaitable, Callable
from typing import Annotated

from fastapi import Depends
from redis.exceptions import RedisError

from app.auth.dependencies import get_current_user
from app.shared.core.exceptions import RateLimitedError
from app.shared.core.logging import get_logger
from app.shared.core.redis import get_redis, is_redis_available, note_redis_failure

logger = get_logger(__name__)


async def enforce_rate_limit(key: str, *, limit: int, window_seconds: int = 60) -> None:
    """Fixed-window counter. Good enough for a login endpoint; a sliding
    window or token bucket would be overkill for this milestone's scope.

    Fails open: if Redis is unreachable (e.g. not running in local dev), the
    request is allowed through with a logged warning rather than 500'ing.
    Rate limiting is a protective layer, not a correctness guarantee — losing
    it temporarily degrades protection but doesn't break the endpoint.
    """
    if not is_redis_available():
        return

    try:
        redis = get_redis()
        current = await redis.incr(key)
        if current == 1:
            await redis.expire(key, window_seconds)
    except (RedisError, OSError) as exc:
        # OSError too: a socket-level failure/timeout isn't always wrapped in a
        # RedisError, and an uncaught one here would 500 an otherwise-fine login.
        note_redis_failure()
        logger.warning("rate_limit_unavailable", key=key, error=str(exc))
        return

    if current > limit:
        raise RateLimitedError("Too many requests, please try again later.")


def rate_limit(
    key_prefix: str, *, limit: int, window_seconds: int = 60
) -> Callable[..., Awaitable[None]]:
    """FastAPI dependency factory for per-user rate limiting.

    Usage::

        @router.post("/push")
        async def push(
            ...,
            _: Annotated[None, Depends(rate_limit("sync:push", limit=30))],
        ) -> ...

    The key is ``ratelimit:{key_prefix}:{user_id}``.
    """

    async def _enforce(
        user: Annotated[object, Depends(get_current_user)],
    ) -> None:
        uid = getattr(user, "id", "anonymous")
        key = f"ratelimit:{key_prefix}:{uid}"
        await enforce_rate_limit(key, limit=limit, window_seconds=window_seconds)

    return _enforce
