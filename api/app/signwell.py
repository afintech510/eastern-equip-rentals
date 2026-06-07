"""SignWell e-sign client (§5.2, F-015/F-016/H-004). Ported from the maningo
pattern. Gated on SIGNWELL_API_KEY + template ids.

Hosted signing (full-page redirect) — SignWell blocks iframe embedding for
non-allowlisted domains. Webhook verified by HMAC-SHA256 of the raw body; when
no secret is set we re-fetch the document to defend against forged payloads.
"""

import hashlib
import hmac
import logging

import httpx

from app.config import get_settings

logger = logging.getLogger("eastern-rentals-api")
settings = get_settings()

SW_BASE = "https://www.signwell.com/api/v1"


def signwell_ready() -> bool:
    return bool(settings.signwell_api_key)


def _headers() -> dict:
    return {"X-Api-Key": settings.signwell_api_key, "Content-Type": "application/json"}


def _template_id(doc_type: str) -> str:
    return (
        settings.signwell_contract_template_id
        if doc_type == "contract"
        else settings.signwell_waiver_template_id
    )


def create_document(
    *, doc_type: str, full_name: str, email: str, rental_id: str, serial: str, redirect_url: str
) -> dict:
    """Create a contract/waiver from a template with renter + serial merged.
    Returns {document_id, signing_url}."""
    template_id = _template_id(doc_type)
    if not template_id:
        raise RuntimeError(f"SignWell {doc_type} template id not configured")

    body = {
        "test_mode": True,  # flip to false at pre-launch (human gate)
        "template_id": template_id,
        "embedded_signing": True,
        "embedded_signing_notifications": True,
        "redirect_url": redirect_url,
        "recipients": [
            {"id": "renter", "placeholder_name": "Renter", "name": full_name, "email": email}
        ],
        "template_fields": [{"api_id": "unit_serial", "value": serial}],
        "metadata": {"rental_id": rental_id, "doc_type": doc_type},
        "name": f"{doc_type.title()} - {full_name}",
    }
    resp = httpx.post(
        f"{SW_BASE}/document_templates/documents", headers=_headers(), json=body, timeout=30
    )
    if resp.status_code >= 300:
        raise RuntimeError(
            f"SignWell create {doc_type} failed: {resp.status_code} {resp.text[:300]}"
        )
    data = resp.json()
    doc_id = data.get("id")
    recips = data.get("recipients") or [{}]
    url = (
        recips[0].get("embedded_signing_url")
        or data.get("embedded_signing_url")
        or recips[0].get("signing_url")
    )
    if not doc_id or not url:
        raise RuntimeError(f"SignWell response missing id/url: {str(data)[:300]}")
    return {"document_id": doc_id, "signing_url": url}


def get_document(document_id: str) -> dict | None:
    resp = httpx.get(
        f"{SW_BASE}/documents/{document_id}",
        headers={"X-Api-Key": settings.signwell_api_key},
        timeout=20,
    )
    if resp.status_code >= 300:
        return None
    return resp.json()


def get_completed_pdf_url(document_id: str) -> str | None:
    resp = httpx.get(
        f"{SW_BASE}/documents/{document_id}/completed_pdf",
        headers={"X-Api-Key": settings.signwell_api_key},
        timeout=20,
    )
    if resp.status_code >= 300:
        return None
    data = resp.json()
    return data.get("file_url") or data.get("url")


def verify_webhook(raw_body: bytes, signature: str | None) -> bool:
    """HMAC-SHA256 of the raw body. If no secret is configured, accept and rely
    on document-id re-fetch (maningo pattern)."""
    secret = settings.signwell_webhook_secret
    if not secret:
        return True
    if not signature:
        return False
    computed = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(computed, signature)
