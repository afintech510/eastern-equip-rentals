"""Transactional email via the Resend REST API (§5.4). Gated on RESEND_API_KEY
— a no-op (logged) until the key is set, so the flow never blocks on email.

Every send is logged to message_log with the (rental_id, template, channel)
idempotency guard (REV-020) so a job re-run can't duplicate a notification.
"""

import logging

import httpx

from app.config import get_settings
from app.supa import service_client

logger = logging.getLogger("eastern-rentals-api")
settings = get_settings()

RESEND_URL = "https://api.resend.com/emails"


def _log_message(
    customer_id: str | None,
    rental_id: str | None,
    template: str,
    status: str,
    provider_id: str | None,
):
    svc = service_client()
    if svc is None or customer_id is None:
        return
    try:
        svc.table("message_log").insert(
            {
                "customer_id": customer_id,
                "rental_id": rental_id,
                "channel": "email",
                "template": template,
                "status": status,
                "provider_id": provider_id,
            }
        ).execute()
    except Exception as exc:  # duplicate (idempotency guard) or transient — never block
        if "23505" not in str(exc) and "duplicate" not in str(exc).lower():
            logger.warning("message_log insert failed: %s", exc)


def send_email(
    *,
    to: str,
    subject: str,
    html: str,
    template: str,
    customer_id: str | None = None,
    rental_id: str | None = None,
) -> bool:
    """Send a transactional email. Returns True if dispatched. Never raises —
    email failures must not block the rental flow."""
    if not settings.resend_api_key:
        logger.info("Resend not configured — skipping email '%s' to %s", template, to)
        _log_message(customer_id, rental_id, template, "failed", None)
        return False
    try:
        resp = httpx.post(
            RESEND_URL,
            headers={
                "Authorization": f"Bearer {settings.resend_api_key}",
                "Content-Type": "application/json",
            },
            json={"from": settings.resend_from_email, "to": [to], "subject": subject, "html": html},
            timeout=15,
        )
        ok = resp.status_code < 300
        provider_id = resp.json().get("id") if ok else None
        _log_message(customer_id, rental_id, template, "sent" if ok else "failed", provider_id)
        if not ok:
            logger.warning("Resend send failed %s: %s", resp.status_code, resp.text[:200])
        return ok
    except Exception as exc:  # noqa: BLE001
        logger.error("Resend send error: %s", exc)
        _log_message(customer_id, rental_id, template, "failed", None)
        return False
