"""Webhook handlers (§3.3). Stripe booking-fee confirmation.

- verifies the signature
- idempotency-guards via processed_webhook_events FIRST (REV-004) — a duplicate
  event short-circuits with 200, no side effects
- payment_intent.succeeded (booking fee) → status reserved, paid=true,
  booking_fee_paid_at set, payment_attempted_at cleared, recompute_gate
- payment_intent.payment_failed → do NOT hard-release (REV-033); the hold TTL
  governs (Phase 06) so the customer can retry the card
"""

import logging

import stripe
from fastapi import APIRouter, HTTPException, Request

from app.config import get_settings
from app.stripe_client import configure as configure_stripe
from app.supa import service_client

logger = logging.getLogger("eastern-rentals-api")
router = APIRouter(prefix="/api/v1/webhooks", tags=["webhooks"])
settings = get_settings()


def _already_processed(svc, event_id: str) -> bool:
    """Insert-first idempotency guard. Returns True if this event was seen before."""
    try:
        svc.table("processed_webhook_events").insert(
            {"provider": "stripe", "event_id": event_id}
        ).execute()
        return False
    except Exception as exc:  # noqa: BLE001 — duplicate PK => already processed
        if "23505" in str(exc) or "duplicate" in str(exc).lower():
            return True
        raise


@router.post("/stripe")
async def stripe_webhook(request: Request):
    if not settings.stripe_webhook_secret:
        raise HTTPException(
            status_code=503,
            detail={"code": "WEBHOOK_UNCONFIGURED", "message": "Webhook secret not set"},
        )
    configure_stripe()

    payload = await request.body()
    sig = request.headers.get("stripe-signature", "")
    try:
        event = stripe.Webhook.construct_event(payload, sig, settings.stripe_webhook_secret)
    except (ValueError, stripe.error.SignatureVerificationError) as exc:
        raise HTTPException(
            status_code=400, detail={"code": "BAD_SIGNATURE", "message": "Invalid signature"}
        ) from exc

    svc = service_client()
    if svc is None:
        raise HTTPException(
            status_code=503, detail={"code": "DB_UNCONFIGURED", "message": "DB not configured"}
        )

    if _already_processed(svc, event["id"]):
        return {"received": True, "duplicate": True}

    etype = event["type"]
    obj = event["data"]["object"]

    if etype == "payment_intent.succeeded" and obj.get("metadata", {}).get("kind") == "booking_fee":
        rental_id = obj["metadata"].get("rental_id")
        if rental_id:
            # Confirm the reservation. Guard on pending_fee so a late/duplicate
            # event can't regress a later state.
            svc.table("rentals").update(
                {
                    "status": "reserved",
                    "paid": True,
                    "booking_fee_paid_at": "now()",
                    "payment_attempted_at": None,
                }
            ).eq("id", rental_id).eq("status", "pending_fee").execute()
            # Record the captured booking fee on the payment row.
            r = svc.table("rentals").select("booking_fee_amount").eq("id", rental_id).execute()
            if r.data:
                svc.table("payments").update(
                    {"booking_fee_charged": r.data[0]["booking_fee_amount"]}
                ).eq("stripe_booking_fee_intent_id", obj["id"]).execute()
            svc.rpc("recompute_gate", {"p_rental_id": rental_id}).execute()
            logger.info("Booking fee confirmed for rental %s", rental_id)

    elif etype == "payment_intent.payment_failed":
        # REV-033: do not hard-release; the hold TTL governs so the card can be retried.
        logger.info("Booking-fee payment failed for PI %s (no hard release)", obj.get("id"))

    return {"received": True}
