"""Webhook idempotency (§9.2, REV-004). The insert-first guard against
processed_webhook_events makes a duplicate Stripe/SignWell event a no-op: the
first insert succeeds (not-yet-processed → False), the second collides on the PK
(already-processed → True). A non-duplicate DB error must propagate, not be
swallowed as 'processed'."""

import types

import pytest

from app.routers.webhooks import _already_processed, _already_processed_event


class _Exec:
    def __init__(self, dup: bool):
        self._dup = dup

    def execute(self):
        if self._dup:
            raise Exception("duplicate key value violates unique constraint (23505)")
        return types.SimpleNamespace(data=[{}])


class _Table:
    def __init__(self, store: set):
        self._store = store
        self._row: dict | None = None

    def insert(self, row):
        self._row = row
        key = (row["provider"], row["event_id"])
        dup = key in self._store
        self._store.add(key)
        return _Exec(dup)


class _RaisingTable:
    """Simulates a non-duplicate DB error (e.g. connection drop)."""

    def insert(self, _row):
        return self

    def execute(self):
        raise Exception("connection reset by peer")


class FakeClient:
    def __init__(self, raising: bool = False):
        self._store: set = set()
        self._raising = raising

    def table(self, _name):
        return _RaisingTable() if self._raising else _Table(self._store)


def test_stripe_first_then_duplicate():
    svc = FakeClient()
    assert _already_processed(svc, "evt_1") is False  # first time
    assert _already_processed(svc, "evt_1") is True  # replay → no-op
    assert _already_processed(svc, "evt_2") is False  # distinct event


def test_signwell_first_then_duplicate():
    svc = FakeClient()
    assert _already_processed_event(svc, "signwell", "doc:completed") is False
    assert _already_processed_event(svc, "signwell", "doc:completed") is True


def test_non_duplicate_error_propagates():
    svc = FakeClient(raising=True)
    with pytest.raises(Exception, match="connection reset"):
        _already_processed(svc, "evt_x")
