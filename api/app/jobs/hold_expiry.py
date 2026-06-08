"""Reservation hold-expiry job (deferred from 02b; §2.5, REV-003).

A reservation sits at `pending_fee` while the renter is paying the booking fee.
If the fee never lands within `config.reservation_hold_ttl_min`, the hold must
expire so the unit frees up (the exclusion constraint ignores `expired`).

Payment-in-flight shield (REV-003): never expire a row whose booking fee is paid,
and don't race a webhook that may still be arriving — a row whose
`payment_attempted_at` is within `shield_min` is left alone. Stripe webhooks are
near-instant, so a generous shield avoids cancelling a just-paid hold; truly
abandoned carts (no attempt, or an attempt well past the shield) expire.
"""

import logging
from datetime import UTC, datetime, timedelta

from app.supa import service_client

logger = logging.getLogger("eastern-rentals-api.jobs")

SHIELD_MIN = 30  # minutes to wait past a payment attempt before expiring


def _parse(ts: str | None) -> datetime | None:
    if not ts:
        return None
    return datetime.fromisoformat(ts.replace("Z", "+00:00"))


def is_expirable(
    now: datetime,
    created_at: datetime,
    payment_attempted_at: datetime | None,
    booking_fee_paid_at: datetime | None,
    ttl_min: int,
    shield_min: int = SHIELD_MIN,
) -> bool:
    """Pure expiry decision (unit-tested). True when the hold is stale and not
    payment-shielded."""
    if booking_fee_paid_at is not None:
        return False  # paid — never expire
    if now - created_at < timedelta(minutes=ttl_min):
        return False  # still inside the TTL window
    if payment_attempted_at is not None and now - payment_attempted_at < timedelta(
        minutes=shield_min
    ):
        return False  # a charge may still be settling — shield it
    return True


def expire_stale_holds(svc=None, now: datetime | None = None) -> dict:
    svc = svc if svc is not None else service_client()
    if svc is None:
        return {"processed": 0, "skipped": 0, "detail": {"note": "no db"}}
    now = now or datetime.now(UTC)
    cfg = svc.table("config").select("reservation_hold_ttl_min").eq("id", True).execute().data
    ttl_min = int(cfg[0]["reservation_hold_ttl_min"]) if cfg else 30

    rows = (
        svc.table("rentals")
        .select("id,unit_id,created_at,payment_attempted_at,booking_fee_paid_at")
        .eq("status", "pending_fee")
        .execute()
        .data
        or []
    )
    expired = skipped = 0
    for r in rows:
        if is_expirable(
            now,
            _parse(r["created_at"]),
            _parse(r.get("payment_attempted_at")),
            _parse(r.get("booking_fee_paid_at")),
            ttl_min,
        ):
            # Guard the transition on pending_fee so a webhook that confirms
            # between our read and write wins the race (no lost payment).
            svc.table("rentals").update({"status": "expired"}).eq("id", r["id"]).eq(
                "status", "pending_fee"
            ).execute()
            expired += 1
            logger.info("hold-expiry: rental %s expired (unit %s freed)", r["id"], r.get("unit_id"))
        else:
            skipped += 1
    return {"processed": expired, "skipped": skipped}
