"""Webhook handlers (§3.3). Stripe booking-fee confirmation.

- verifies the signature
- idempotency-guards via processed_webhook_events FIRST (REV-004) — a duplicate
  event short-circuits with 200, no side effects
- payment_intent.succeeded (booking fee) → status reserved, paid=true,
  booking_fee_paid_at set, payment_attempted_at cleared, recompute_gate
- payment_intent.payment_failed → do NOT hard-release (REV-033); the hold TTL
  governs (Phase 06) so the customer can retry the card
"""

import json
import logging

import stripe
from fastapi import APIRouter, HTTPException, Request

from app.config import get_settings
from app.routers.documents import send_rental_documents
from app.services.gate import recompute_and_advance
from app.signwell import get_completed_pdf_url, get_document, verify_webhook
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
            # Send contract + waiver now (post-payment, F-015/16). No-op if
            # SignWell unconfigured; idempotent.
            try:
                send_rental_documents(svc, rental_id)
            except Exception as exc:  # noqa: BLE001
                logger.error("document send after booking fee failed: %s", exc)
            logger.info("Booking fee confirmed for rental %s", rental_id)

    elif etype == "payment_intent.payment_failed":
        # REV-033: do not hard-release; the hold TTL governs so the card can be retried.
        logger.info("Booking-fee payment failed for PI %s (no hard release)", obj.get("id"))

    elif etype == "charge.refunded":
        # REV-032: sync deposit refunds done in the Stripe dashboard.
        pi = obj.get("payment_intent")
        refunded = (obj.get("amount_refunded") or 0) / 100.0
        if pi:
            svc.table("payments").update(
                {"deposit_state": "refunded", "deposit_refund_amount": refunded}
            ).eq("stripe_deposit_intent_id", pi).execute()

    return {"received": True}


@router.post("/signwell")
async def signwell_webhook(request: Request):
    """SignWell document.completed (§3.3, F-015/16, H-004). Signature-verified
    (when secret set) + re-fetch to defend against forgery; idempotency-guarded;
    completed-after-override safe."""
    raw = await request.body()
    sig = request.headers.get("x-signwell-signature") or request.headers.get("signwell-signature")
    if not verify_webhook(raw, sig):
        raise HTTPException(
            status_code=400, detail={"code": "BAD_SIGNATURE", "message": "Invalid signature"}
        )

    try:
        payload = json.loads(raw.decode() or "{}")
    except ValueError as exc:
        raise HTTPException(
            status_code=400, detail={"code": "BAD_PAYLOAD", "message": "Invalid JSON"}
        ) from exc

    event_type = (payload.get("event", {}) or {}).get("type") or payload.get("type") or ""
    doc_obj = (payload.get("data", {}) or {}).get("object") or payload.get("document") or payload
    doc_id = doc_obj.get("id")
    if not doc_id:
        return {"received": True, "ignored": "no document id"}

    svc = service_client()
    if svc is None:
        raise HTTPException(
            status_code=503, detail={"code": "DB_UNCONFIGURED", "message": "DB not configured"}
        )

    if _already_processed_event(svc, "signwell", f"{doc_id}:{event_type}"):
        return {"received": True, "duplicate": True}

    if "complet" not in event_type.lower():
        return {"received": True}

    # Defense against forged payloads: re-fetch and confirm the document really
    # is completed before acting (maningo pattern).
    fetched = get_document(doc_id)
    if fetched and "complet" not in str(fetched.get("status", "")).lower():
        logger.warning(
            "SignWell %s event but re-fetch status=%s — ignoring", doc_id, fetched.get("status")
        )
        return {"received": True, "unverified": True}

    rows = (
        svc.table("rental_documents")
        .select("id,rental_id,status")
        .eq("signwell_document_id", doc_id)
        .execute()
        .data
    )
    if not rows:
        return {"received": True, "unmatched": True}
    d = rows[0]
    pdf_url = get_completed_pdf_url(doc_id)

    if d["status"] == "manual_override":
        # Completed-after-override: store the real PDF + audit, do NOT regress.
        if pdf_url:
            svc.table("rental_documents").update({"signed_pdf_path": pdf_url}).eq(
                "id", d["id"]
            ).execute()
        svc.table("audit_log").insert(
            {
                "action": "signwell_completed_after_override",
                "entity_type": "rental_document",
                "entity_id": d["id"],
            }
        ).execute()
        return {"received": True, "after_override": True}

    svc.table("rental_documents").update({"status": "completed", "signed_pdf_path": pdf_url}).eq(
        "id", d["id"]
    ).execute()
    recompute_and_advance(svc, d["rental_id"])
    logger.info("SignWell document %s completed for rental %s", doc_id, d["rental_id"])
    return {"received": True}


def _already_processed_event(svc, provider: str, event_id: str) -> bool:
    try:
        svc.table("processed_webhook_events").insert(
            {"provider": provider, "event_id": event_id}
        ).execute()
        return False
    except Exception as exc:  # noqa: BLE001
        if "23505" in str(exc) or "duplicate" in str(exc).lower():
            return True
        raise
