"""Background-job framework (§9.2, REV-023): retry/backoff/dead-letter, and the
hold-expiry expiry decision with its payment-in-flight shield (REV-003)."""

from datetime import UTC, datetime, timedelta

from app.jobs.hold_expiry import is_expirable
from app.jobs.runner import backoff_delay, run_with_retry


# ---------- runner: backoff + retry + dead-letter ----------
def test_backoff_is_exponential():
    assert backoff_delay(1) == 2
    assert backoff_delay(2) == 4
    assert backoff_delay(3) == 8


def test_run_with_retry_succeeds_after_transient_failures():
    calls = {"n": 0}

    def flaky():
        calls["n"] += 1
        if calls["n"] < 3:
            raise RuntimeError("transient")
        return {"processed": 7}

    result = run_with_retry("t", flaky, sleep=lambda _s: None, svc=None)
    assert result == {"processed": 7}
    assert calls["n"] == 3


def test_run_with_retry_dead_letters_after_exhaustion():
    def always_fails():
        raise RuntimeError("nope")

    result = run_with_retry(
        "t", always_fails, max_attempts=3, sleep=lambda _s: None, svc=None
    )
    assert result is None  # dead-lettered → None


# ---------- hold-expiry decision ----------
NOW = datetime(2026, 6, 7, 12, 0, tzinfo=UTC)
TTL = 30


def _ago(minutes: int) -> datetime:
    return NOW - timedelta(minutes=minutes)


def test_paid_hold_never_expires():
    assert (
        is_expirable(NOW, _ago(999), payment_attempted_at=_ago(900), booking_fee_paid_at=_ago(800), ttl_min=TTL)
        is False
    )


def test_inside_ttl_does_not_expire():
    assert (
        is_expirable(NOW, _ago(10), payment_attempted_at=None, booking_fee_paid_at=None, ttl_min=TTL)
        is False
    )


def test_abandoned_no_attempt_expires():
    assert (
        is_expirable(NOW, _ago(45), payment_attempted_at=None, booking_fee_paid_at=None, ttl_min=TTL)
        is True
    )


def test_recent_attempt_is_shielded():
    # Past TTL but a charge was attempted 5 min ago — a webhook may still arrive.
    assert (
        is_expirable(NOW, _ago(45), payment_attempted_at=_ago(5), booking_fee_paid_at=None, ttl_min=TTL)
        is False
    )


def test_stale_attempt_past_shield_expires():
    assert (
        is_expirable(NOW, _ago(120), payment_attempted_at=_ago(90), booking_fee_paid_at=None, ttl_min=TTL)
        is True
    )
