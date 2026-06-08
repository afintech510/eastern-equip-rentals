"""Redis-backed fixed-window rate limiting (§8.1 RATE_LIMITED, §7.4).

Sensitive write endpoints (quote, reservation create, license upload, document
send) get a per-IP budget so brute-force / runaway clients are throttled with a
429 + the canonical taxonomy code. The counting logic is split out behind a tiny
store protocol so it unit-tests without a live Redis (Phase 07).

Fail-open: if Redis is unreachable the limiter allows the request (and logs) —
availability of the booking flow beats strict throttling for this workload.
"""

import logging
import time
from functools import lru_cache

from fastapi import Request, Response

from app.config import get_settings
from app.errors import api_error

logger = logging.getLogger("eastern-rentals-api")
settings = get_settings()


class InMemoryStore:
    """Process-local fixed-window store. Used as a test double and as the
    fallback when Redis is unconfigured in local dev (not shared across workers —
    Redis is the production source of truth)."""

    def __init__(self) -> None:
        self._windows: dict[str, tuple[int, float]] = {}

    def incr(self, key: str, window_s: int, now: float) -> int:
        count, expires = self._windows.get(key, (0, 0.0))
        if now >= expires:
            count, expires = 0, now + window_s
        count += 1
        self._windows[key] = (count, expires)
        return count


class RedisStore:
    """Fixed-window counter backed by Redis INCR + EXPIRE."""

    def __init__(self, client) -> None:
        self._r = client

    def incr(self, key: str, window_s: int, now: float) -> int:
        # INCR creates the key at 1; set the TTL only on first hit of the window.
        count = self._r.incr(key)
        if count == 1:
            self._r.expire(key, window_s)
        return int(count)


def over_limit(count: int, limit: int) -> bool:
    """True when this hit exceeds the budget. Pure — the unit of test."""
    return count > limit


@lru_cache
def _redis():
    try:
        import redis

        client = redis.Redis.from_url(settings.redis_url, socket_connect_timeout=1)
        client.ping()
        return client
    except Exception as exc:  # noqa: BLE001 — fall back to in-memory
        logger.warning("Rate limiter: Redis unavailable (%s) — using in-memory fallback", exc)
        return None


@lru_cache
def _fallback_store() -> InMemoryStore:
    return InMemoryStore()


def _store():
    client = _redis()
    return RedisStore(client) if client is not None else _fallback_store()


def _client_ip(request: Request) -> str:
    # Behind the shared nginx proxy; trust the left-most X-Forwarded-For hop.
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def rate_limit(name: str, limit: int, window_seconds: int):
    """Build a FastAPI dependency enforcing `limit` requests / `window_seconds`
    per client IP for the named bucket. Raises RATE_LIMITED (429) when exceeded."""

    def dependency(request: Request, response: Response) -> None:
        now = time.time()
        key = f"rl:{name}:{_client_ip(request)}"
        try:
            count = _store().incr(key, window_seconds, now)
        except Exception as exc:  # noqa: BLE001 — never let the limiter 500 the request
            logger.warning("Rate limiter store error (%s) — allowing request", exc)
            return
        remaining = max(0, limit - count)
        response.headers["X-RateLimit-Limit"] = str(limit)
        response.headers["X-RateLimit-Remaining"] = str(remaining)
        if over_limit(count, limit):
            response.headers["Retry-After"] = str(window_seconds)
            raise api_error("RATE_LIMITED")

    return dependency
