"""SignWell polling job + exhaustion alert (§8.3, H-004).

The webhook is the primary completion signal; this job is the safety net for a
missed/late webhook. It polls every `rental_documents` row still awaiting a
signature, and on confirmed completion mirrors the webhook path: mark completed,
store the PDF, recompute the gate. Documents under `manual_override` are never
regressed.

Exhaustion (§8.3): a document still unsigned past `POLL_EXHAUST_HOURS` raises one
admin alert, deduped via the message_log idempotency guard so re-runs don't spam.
"""

import logging
from datetime import UTC, datetime, timedelta

from app.config import get_settings
from app.email import send_email
from app.services.gate import recompute_and_advance
from app.signwell import get_completed_pdf_url, get_document, signwell_ready
from app.supa import service_client

logger = logging.getLogger("eastern-rentals-api.jobs")
settings = get_settings()

POLL_EXHAUST_HOURS = 48


def _parse(ts: str | None) -> datetime | None:
    if not ts:
        return None
    return datetime.fromisoformat(ts.replace("Z", "+00:00"))


def poll_pending_documents(svc=None, now: datetime | None = None) -> dict:
    svc = svc if svc is not None else service_client()
    if svc is None or not signwell_ready():
        return {"processed": 0, "skipped": 0, "detail": {"note": "signwell off / no db"}}
    now = now or datetime.now(UTC)

    rows = (
        svc.table("rental_documents")
        .select("id,rental_id,doc_type,status,signwell_document_id,created_at")
        .in_("status", ["sent", "pending"])
        .execute()
        .data
        or []
    )
    completed = exhausted = 0
    for d in rows:
        doc_id = d.get("signwell_document_id")
        if not doc_id:
            continue
        fetched = get_document(doc_id)
        svc.table("rental_documents").update({"last_polled_at": now.isoformat()}).eq(
            "id", d["id"]
        ).execute()
        if fetched and "complet" in str(fetched.get("status", "")).lower():
            pdf_url = get_completed_pdf_url(doc_id)
            svc.table("rental_documents").update(
                {"status": "completed", "signed_pdf_path": pdf_url}
            ).eq("id", d["id"]).eq("status", d["status"]).execute()
            recompute_and_advance(svc, d["rental_id"])
            completed += 1
            logger.info("signwell-poll: %s completed for rental %s", doc_id, d["rental_id"])
            continue
        created = _parse(d.get("created_at"))
        if created and now - created > timedelta(hours=POLL_EXHAUST_HOURS):
            if _alert_exhausted(svc, d):
                exhausted += 1
    return {"processed": completed, "skipped": exhausted, "detail": {"exhausted_alerts": exhausted}}


def _alert_exhausted(svc, doc_row) -> bool:
    """Email the admin once per exhausted document. Dedupe via message_log
    (rental_id, template, channel) so repeated job runs don't re-alert."""
    template = f"signwell_exhausted_{doc_row['doc_type']}"
    rental = (
        svc.table("rentals").select("customer_id").eq("id", doc_row["rental_id"]).execute().data
    )
    customer_id = rental[0]["customer_id"] if rental else None
    if customer_id:
        already = (
            svc.table("message_log")
            .select("id")
            .eq("rental_id", doc_row["rental_id"])
            .eq("template", template)
            .eq("channel", "email")
            .execute()
            .data
        )
        if already:
            return False
    if settings.admin_notify_email:
        send_email(
            to=settings.admin_notify_email,
            subject=f"SignWell {doc_row['doc_type']} unsigned >{POLL_EXHAUST_HOURS}h",
            html=(
                f"<p>Rental {doc_row['rental_id']}: the {doc_row['doc_type']} has been awaiting "
                f"signature for over {POLL_EXHAUST_HOURS} hours. Consider a manual override "
                f"or contacting the renter.</p>"
            ),
            template=template,
            customer_id=customer_id,
            rental_id=doc_row["rental_id"],
        )
    logger.warning(
        "signwell-poll: %s (%s) exhausted polling window", doc_row["id"], doc_row["doc_type"]
    )
    return True
