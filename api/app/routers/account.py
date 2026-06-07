"""Customer account + license (§3.2, F-012/F-013). Auth required."""

import logging

from fastapi import APIRouter, Depends, HTTPException

from app.config import get_settings
from app.deps import get_current_user_id
from app.email import send_email
from app.schemas import LicenseIn, ProfileUpdate
from app.supa import service_client

logger = logging.getLogger("eastern-rentals-api")
router = APIRouter(prefix="/api/v1", tags=["account"])
settings = get_settings()


def _svc():
    svc = service_client()
    if svc is None:
        raise HTTPException(
            status_code=503, detail={"code": "DB_UNCONFIGURED", "message": "DB not configured"}
        )
    return svc


def _customer(svc, user_id: str) -> dict:
    res = svc.table("customers").select("*").eq("auth_user_id", user_id).execute()
    if not res.data:
        raise HTTPException(
            status_code=400, detail={"code": "NO_CUSTOMER", "message": "Customer profile missing"}
        )
    return res.data[0]


@router.get("/me")
def get_me(user_id: str = Depends(get_current_user_id)):
    svc = _svc()
    c = _customer(svc, user_id)
    return {
        "id": c["id"],
        "email": c["email"],
        "full_name": c["full_name"],
        "phone": c["phone"],
        "license_status": c["license_status"],
        "loyalty_tier": c["loyalty_tier"],
        "transactional_sms": c["transactional_sms"],
        "sms_marketing_opt_in": c["sms_marketing_opt_in"],
        "email_marketing_opt_in": c["email_marketing_opt_in"],
    }


@router.patch("/me")
def update_me(body: ProfileUpdate, user_id: str = Depends(get_current_user_id)):
    svc = _svc()
    c = _customer(svc, user_id)
    patch = {k: v for k, v in body.model_dump().items() if v is not None}
    if not patch:
        raise HTTPException(
            status_code=400, detail={"code": "NO_FIELDS", "message": "Nothing to update"}
        )
    # Only safe columns are in ProfileUpdate; protected-column trigger guards the rest.
    svc.table("customers").update(patch).eq("id", c["id"]).execute()
    return {"status": "ok"}


@router.post("/license", status_code=201)
def upload_license(body: LicenseIn, user_id: str = Depends(get_current_user_id)):
    svc = _svc()
    c = _customer(svc, user_id)

    # Path must belong to this user (defense in depth beyond Storage RLS).
    if not body.storage_path.startswith(f"{user_id}/"):
        raise HTTPException(
            status_code=400, detail={"code": "BAD_PATH", "message": "Invalid storage path"}
        )

    svc.table("license_uploads").insert(
        {"customer_id": c["id"], "storage_path": body.storage_path, "status": "pending"}
    ).execute()
    # license_status is admin-only at the column level; service role may set it.
    svc.table("customers").update({"license_status": "pending"}).eq("id", c["id"]).execute()

    if settings.admin_notify_email:
        send_email(
            to=settings.admin_notify_email,
            subject="New driver's license to review",
            html=f"<p>{c['full_name']} ({c['email']}) uploaded a license for review.</p>"
            f"<p><a href='{settings.app_base_url}/admin/licenses'>Open the review queue</a></p>",
            template="admin_license_pending",
        )
    return {"status": "pending"}


@router.get("/me/rentals")
def my_rentals(user_id: str = Depends(get_current_user_id)):
    svc = _svc()
    c = _customer(svc, user_id)
    res = (
        svc.table("rentals")
        .select(
            "id,status,start_date,end_date,total,booking_fee_amount,balance_amount,product_id,paid,license_ok,contract_signed,waiver_signed"
        )
        .eq("customer_id", c["id"])
        .order("created_at", desc=True)
        .execute()
    )
    rentals = res.data or []
    # attach product names
    pids = list({r["product_id"] for r in rentals})
    names = {}
    if pids:
        pr = svc.table("products").select("id,name").in_("id", pids).execute()
        names = {p["id"]: p["name"] for p in (pr.data or [])}
    for r in rentals:
        r["product_name"] = names.get(r["product_id"])
    return rentals
