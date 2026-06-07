"""Rental documents — SignWell contract + waiver (§3.2, F-015/F-016/H-004).

Documents are created only post-payment (status reserved/paid) to conserve the
free tier. send_rental_documents() is idempotent and is called from the Stripe
webhook on booking-fee success, and is also exposed as a manual endpoint.
"""

import logging

from fastapi import APIRouter, Depends, HTTPException

from app.config import get_settings
from app.deps import get_current_user_id
from app.signwell import create_document, get_document, signwell_ready
from app.supa import service_client

logger = logging.getLogger("eastern-rentals-api")
router = APIRouter(prefix="/api/v1", tags=["documents"])
settings = get_settings()
DOC_TYPES = ("contract", "waiver")


def _svc():
    svc = service_client()
    if svc is None:
        raise HTTPException(
            status_code=503, detail={"code": "DB_UNCONFIGURED", "message": "DB not configured"}
        )
    return svc


def send_rental_documents(svc, rental_id: str) -> None:
    """Create contract + waiver in SignWell for a paid rental. Idempotent: skips
    any doc_type that already has a row. No-op (logged) if SignWell unconfigured."""
    if not signwell_ready():
        logger.info("SignWell not configured — skipping document send for %s", rental_id)
        return

    r = svc.table("rentals").select("id,customer_id,unit_id,paid").eq("id", rental_id).execute()
    if not r.data or not r.data[0]["paid"]:
        return
    rental = r.data[0]

    existing = {
        d["doc_type"]
        for d in (
            svc.table("rental_documents")
            .select("doc_type")
            .eq("rental_id", rental_id)
            .execute()
            .data
            or []
        )
    }
    cust = (
        svc.table("customers")
        .select("full_name,email")
        .eq("id", rental["customer_id"])
        .execute()
        .data[0]
    )
    serial = ""
    if rental["unit_id"]:
        u = (
            svc.table("units")
            .select("serial_number,label")
            .eq("id", rental["unit_id"])
            .execute()
            .data
        )
        if u:
            serial = u[0]["serial_number"] or u[0]["label"] or ""

    redirect_url = f"{settings.app_base_url}/reserve/confirmation/{rental_id}"
    for doc_type in DOC_TYPES:
        if doc_type in existing:
            continue
        try:
            doc = create_document(
                doc_type=doc_type,
                full_name=cust["full_name"],
                email=cust["email"],
                rental_id=rental_id,
                serial=serial,
                redirect_url=redirect_url,
            )
            svc.table("rental_documents").insert(
                {
                    "rental_id": rental_id,
                    "doc_type": doc_type,
                    "signwell_document_id": doc["document_id"],
                    "status": "sent",
                }
            ).execute()
        except Exception as exc:  # noqa: BLE001 — never block the rental flow
            logger.error("SignWell create %s for %s failed: %s", doc_type, rental_id, exc)


def _owns_or_admin(svc, rental_id: str, user_id: str) -> dict:
    r = svc.table("rentals").select("id,customer_id").eq("id", rental_id).execute()
    if not r.data:
        raise HTTPException(
            status_code=404, detail={"code": "NOT_FOUND", "message": "Rental not found"}
        )
    cust = svc.table("customers").select("id").eq("auth_user_id", user_id).execute()
    is_owner = cust.data and cust.data[0]["id"] == r.data[0]["customer_id"]
    is_admin = bool(
        svc.table("admin_users")
        .select("id")
        .eq("auth_user_id", user_id)
        .is_("revoked_at", "null")
        .execute()
        .data
    )
    if not (is_owner or is_admin):
        raise HTTPException(
            status_code=403, detail={"code": "FORBIDDEN", "message": "Not your rental"}
        )
    return r.data[0]


@router.post("/rentals/{rental_id}/documents/send")
def trigger_send(rental_id: str, user_id: str = Depends(get_current_user_id)):
    svc = _svc()
    _owns_or_admin(svc, rental_id, user_id)
    if not signwell_ready():
        raise HTTPException(
            status_code=503,
            detail={"code": "SIGNWELL_UNCONFIGURED", "message": "E-sign not configured yet"},
        )
    send_rental_documents(svc, rental_id)
    return {"status": "sent"}


@router.get("/rentals/{rental_id}/documents")
def list_documents(rental_id: str, user_id: str = Depends(get_current_user_id)):
    svc = _svc()
    _owns_or_admin(svc, rental_id, user_id)
    docs = (
        svc.table("rental_documents")
        .select("id,doc_type,status,signwell_document_id")
        .eq("rental_id", rental_id)
        .execute()
        .data
        or []
    )
    out = []
    for d in docs:
        signing_url = None
        # Re-fetch a fresh signing URL for documents still awaiting signature.
        if d["status"] in ("sent", "pending") and signwell_ready() and d["signwell_document_id"]:
            doc = get_document(d["signwell_document_id"])
            if doc:
                recips = doc.get("recipients") or [{}]
                signing_url = recips[0].get("embedded_signing_url") or recips[0].get("signing_url")
        out.append({"doc_type": d["doc_type"], "status": d["status"], "signing_url": signing_url})
    return out
