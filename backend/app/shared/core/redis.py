import time

from redis.asyncio import Redis

from app.shared.core.config import get_settings

# Redis is a protective/optimizing layer here (rate limiting, read cache), never
# a correctness dependency — every caller fails open. So connection attempts get
# tight timeouts: a slow or absent Redis must not add latency to a request that
# will succeed without it. Without these, an unreachable-but-not-refused port
# (common on Windows, where the connection is filtered rather than rejected)
# stalls each call for seconds.
CONNECT_TIMEOUT_SECONDS = 0.25
OPERATION_TIMEOUT_SECONDS = 0.5

# After a failure, skip Redis entirely for this long instead of re-paying the
# timeout on every subsequent request.
UNAVAILABLE_BACKOFF_SECONDS = 30.0

_redis: Redis | None = None
_unavailable_until = 0.0


def get_redis() -> Redis | None:
    global _redis
    url = get_settings().redis_url
    if not url:
        return None
    if _redis is None:
        _redis = Redis.from_url(
            url,
            decode_responses=True,
            socket_connect_timeout=CONNECT_TIMEOUT_SECONDS,
            socket_timeout=OPERATION_TIMEOUT_SECONDS,
        )
    return _redis


def is_redis_available() -> bool:
    """False while inside the backoff window after a recent failure, so callers
    can skip Redis without paying the connect timeout again.
    """
    url = get_settings().redis_url
    if not url:
        return False
    return time.monotonic() >= _unavailable_until


def note_redis_failure() -> None:
    """Opens the circuit for `UNAVAILABLE_BACKOFF_SECONDS`."""
    global _unavailable_until
    _unavailable_until = time.monotonic() + UNAVAILABLE_BACKOFF_SECONDS
