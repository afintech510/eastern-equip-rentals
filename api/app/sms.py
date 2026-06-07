"""Transactional SMS via Twilio REST (§5.4, F-022). Gated on Twilio creds —
a no-op (logged) until set. Respects consent and never blocks the rental flow.
Logged to message_log with the (rental_id, template, channel) idempotency
guard (REV-020)."""

import logging

import httpx

from app.config import get_settings
from app.supa import service_client

logger = logging.getLogger("eastern-rentals-api")
settings = get_settings()


def sms_ready() -> bool:
    return bool(
        settings.twilio_account_sid and settings.twilio_auth_token and settings.twilio_from_number
    )


def _log(customer_id, rental_id, template, status, provider_id):
    svc = service_client()
    if svc is None or not customer_id:
        return
    try:
        svc.table("message_log").insert(
            {
                "customer_id": customer_id,
                "rental_id": rental_id,
                "channel": "sms",
                "template": template,
                "status": status,
                "provider_id": provider_id,
            }
        ).execute()
    except Exception as exc:  # idempotency guard / transient — never block
        if "23505" not in str(exc) and "duplicate" not in str(exc).lower():
            logger.warning("sms message_log insert failed: %s", exc)


def send_sms(
    *,
    to: str | None,
    body: str,
    template: str,
    consent: bool,
    customer_id: str | None = None,
    rental_id: str | None = None,
) -> bool:
    """Send transactional SMS. Skips silently if no consent / no number / Twilio
    unconfigured. Never raises."""
    if not to or not consent:
        return False
    if not sms_ready():
        logger.info("Twilio not configured — skipping SMS '%s'", template)
        _log(customer_id, rental_id, template, "failed", None)
        return False
    try:
        resp = httpx.post(
            f"https://api.twilio.com/2010-04-01/Accounts/{settings.twilio_account_sid}/Messages.json",
            auth=(settings.twilio_account_sid, settings.twilio_auth_token),
            data={"From": settings.twilio_from_number, "To": to, "Body": body},
            timeout=15,
        )
        ok = resp.status_code < 300
        provider_id = resp.json().get("sid") if ok else None
        _log(customer_id, rental_id, template, "sent" if ok else "failed", provider_id)
        if not ok:
            logger.warning("Twilio send failed %s: %s", resp.status_code, resp.text[:200])
        return ok
    except Exception as exc:  # noqa: BLE001
        logger.error("Twilio send error: %s", exc)
        _log(customer_id, rental_id, template, "failed", None)
        return False
