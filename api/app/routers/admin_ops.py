"""Admin paperwork ops — license review (F-014) + document override (F-026).
Handover/return/deposit (V3-003, F-007b/008/027) land in the next round."""

import logging
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException

from app.config import get_settings
from app.deps import require_admin
from app.email import send_email
from app.schemas import LicenseDecisionIn
from app.services.gate import recompute_and_advance, recompute_for_customer
from app.services.storage import signed_url
from app.supa import service_client

logger = logging.getLogger("eastern-rentals-api")
router = APIRouter(prefix="/api/v1/admin", tags=["admin-ops"])
settings = get_settings()


def _svc():
    svc = service_client()
    if svc is None:
        raise HTTPException(
            status_code=503, detail={"code": "DB_UNCONFIGURED", "message": "DB not configured"}
        )
    return svc


@router.get("/licenses")
def license_queue(status: str = "pending", _: str = Depends(require_admin)):
    svc = _svc()
    res = (
        svc.table("license_uploads")
        .select("id,customer_id,storage_path,status,reject_reason,created_at")
        .eq("status", status)
        .order("created_at")
        .execute()
    )
    rows = res.data or []
    cids = list({r["customer_id"] for r in rows})
    custs = {}
    if cids:
        cr = svc.table("customers").select("id,full_name,email").in_("id", cids).execute()
        custs = {c["id"]: c for c in (cr.data or [])}
    for r in rows:
        c = custs.get(r["customer_id"], {})
        r["customer_name"] = c.get("full_name")
        r["customer_email"] = c.get("email")
        # Fresh 300s signed URL to view the license image (§7.3).
        r["view_url"] = signed_url("licenses", r["storage_path"])
    return rows


@router.post("/licenses/{license_id}/decision")
def license_decision(
    license_id: str, body: LicenseDecisionIn, admin_id: str = Depends(require_admin)
):
    svc = _svc()
    lic = (
        svc.table("license_uploads").select("id,customer_id,status").eq("id", license_id).execute()
    )
    if not lic.data:
        raise HTTPException(
            status_code=404, detail={"code": "NOT_FOUND", "message": "License not found"}
        )
    customer_id = lic.data[0]["customer_id"]
    now = datetime.now(UTC).isoformat()

    svc.table("license_uploads").update(
        {
            "status": body.decision,
            "reviewed_by": admin_id,
            "reviewed_at": now,
            "reject_reason": body.reason if body.decision == "rejected" else None,
        }
    ).eq("id", license_id).execute()
    # license_status is admin-only at the column level; service role sets it.
    svc.table("customers").update({"license_status": body.decision}).eq("id", customer_id).execute()

    # Re-evaluate the gate on the customer's open rentals (REV-006).
    recompute_for_customer(svc, customer_id)

    cust = svc.table("customers").select("full_name,email").eq("id", customer_id).execute().data[0]
    if body.decision == "approved":
        send_email(
            to=cust["email"],
            subject="Your driver's license is approved",
            html="<p>Your license is approved. You're cleared to complete your rental paperwork.</p>",
            template="license_approved",
            customer_id=customer_id,
        )
    else:
        send_email(
            to=cust["email"],
            subject="Action needed on your driver's license",
            html=f"<p>We couldn't approve your license: {body.reason or 'please re-upload a clear photo'}.</p>",
            template="license_rejected",
            customer_id=customer_id,
        )
    return {"status": body.decision}


@router.post("/documents/{document_id}/override")
def override_document(document_id: str, admin_id: str = Depends(require_admin)):
    """Manually mark a document signed if the webhook dropped (F-026/H-004)."""
    svc = _svc()
    d = svc.table("rental_documents").select("id,rental_id,status").eq("id", document_id).execute()
    if not d.data:
        raise HTTPException(
            status_code=404, detail={"code": "NOT_FOUND", "message": "Document not found"}
        )
    rental_id = d.data[0]["rental_id"]
    svc.table("rental_documents").update({"status": "manual_override", "override_by": admin_id}).eq(
        "id", document_id
    ).execute()
    svc.table("audit_log").insert(
        {
            "actor_id": admin_id,
            "action": "document_override",
            "entity_type": "rental_document",
            "entity_id": document_id,
        }
    ).execute()
    recompute_and_advance(svc, rental_id)
    return {"status": "manual_override"}
