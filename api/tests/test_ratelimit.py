"""Rate-limiter counting logic (§8.1 RATE_LIMITED, §9.2). The fixed-window store
counts hits per key and resets when the window elapses; over_limit decides the
429."""

from app.ratelimit import InMemoryStore, RedisStore, over_limit


def test_over_limit_boundary():
    assert over_limit(count=5, limit=5) is False  # 5th hit of a 5-budget is allowed
    assert over_limit(count=6, limit=5) is True  # 6th exceeds


def test_in_memory_window_counts_and_resets():
    store = InMemoryStore()
    # Five hits inside one 60s window, clock fixed at t=1000.
    counts = [store.incr("k", 60, now=1000.0) for _ in range(5)]
    assert counts == [1, 2, 3, 4, 5]
    # A different key is independent.
    assert store.incr("other", 60, now=1000.0) == 1
    # Past the window the count resets.
    assert store.incr("k", 60, now=1061.0) == 1


def test_in_memory_separate_windows_per_key():
    store = InMemoryStore()
    store.incr("a", 30, now=0.0)
    store.incr("a", 30, now=5.0)
    assert store.incr("a", 30, now=10.0) == 3
    assert store.incr("b", 30, now=10.0) == 1


class _FakeRedis:
    """Minimal INCR/EXPIRE stand-in for RedisStore."""

    def __init__(self):
        self.vals: dict[str, int] = {}
        self.ttls: dict[str, int] = {}

    def incr(self, key):
        self.vals[key] = self.vals.get(key, 0) + 1
        return self.vals[key]

    def expire(self, key, window_s):
        self.ttls[key] = window_s


def test_redis_store_sets_ttl_only_on_first_hit():
    fake = _FakeRedis()
    store = RedisStore(fake)
    assert store.incr("k", 60, now=0.0) == 1
    assert fake.ttls["k"] == 60  # TTL set on first hit
    fake.ttls["k"] = 999  # tamper to prove it isn't re-set
    assert store.incr("k", 60, now=1.0) == 2
    assert fake.ttls["k"] == 999  # second hit did NOT reset the window
