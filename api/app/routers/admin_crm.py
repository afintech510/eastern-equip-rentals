"""Admin dispatch (F-025) + customer CRM (F-023)."""

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException

from app.deps import require_admin
from app.supa import service_client

router = APIRouter(prefix="/api/v1/admin", tags=["admin-crm"])


def _svc():
    svc = service_client()
    if svc is None:
        raise HTTPException(
            status_code=503, detail={"code": "DB_UNCONFIGURED", "message": "DB not configured"}
        )
    return svc


def _names(svc, rows):
    cids = list({r["customer_id"] for r in rows})
    pids = list({r["product_id"] for r in rows})
    custs = (
        {
            c["id"]: c
            for c in (
                svc.table("customers").select("id,full_name,phone").in_("id", cids).execute().data
                or []
            )
        }
        if cids
        else {}
    )
    prods = (
        {
            p["id"]: p
            for p in (svc.table("products").select("id,name").in_("id", pids).execute().data or [])
        }
        if pids
        else {}
    )
    for r in rows:
        c = custs.get(r["customer_id"], {})
        r["customer_name"] = c.get("full_name")
        r["customer_phone"] = c.get("phone")
        r["product_name"] = prods.get(r["product_id"], {}).get("name")
    return rows


@router.get("/dispatch")
def dispatch(day: str | None = None, _: str = Depends(require_admin)):
    svc = _svc()
    target = day or datetime.now(UTC).date().isoformat()
    cols = "id,status,start_date,end_date,fulfillment,delivery_address,customer_id,product_id"

    pickups = _names(
        svc,
        svc.table("rentals")
        .select(cols)
        .eq("start_date", target)
        .in_("status", ["reserved", "ready_for_pickup"])
        .execute()
        .data
        or [],
    )
    returns = _names(
        svc,
        svc.table("rentals")
        .select(cols)
        .eq("end_date", target)
        .eq("status", "active")
        .execute()
        .data
        or [],
    )
    deliveries = [p for p in pickups if p["fulfillment"] == "delivery"]
    return {"date": target, "pickups": pickups, "returns": returns, "deliveries": deliveries}


@router.get("/customers")
def customers(q: str | None = None, _: str = Depends(require_admin)):
    svc = _svc()
    query = svc.table("customers").select(
        "id,full_name,email,phone,license_status,loyalty_tier,created_at"
    )
    if q:
        query = query.ilike("full_name", f"%{q}%")
    return query.order("created_at", desc=True).limit(100).execute().data or []


@router.get("/customers/{customer_id}")
def customer_detail(customer_id: str, _: str = Depends(require_admin)):
    svc = _svc()
    c = svc.table("customers").select("*").eq("id", customer_id).execute().data
    if not c:
        raise HTTPException(
            status_code=404, detail={"code": "NOT_FOUND", "message": "Customer not found"}
        )
    cust = c[0]
    rentals = (
        svc.table("rentals")
        .select("id,status,start_date,end_date,product_id,total,balance_amount")
        .eq("customer_id", customer_id)
        .order("created_at", desc=True)
        .execute()
        .data
        or []
    )
    _names(svc, [{**r, "customer_id": customer_id} for r in rentals])  # warm product names
    pids = list({r["product_id"] for r in rentals})
    prods = (
        {
            p["id"]: p["name"]
            for p in (svc.table("products").select("id,name").in_("id", pids).execute().data or [])
        }
        if pids
        else {}
    )
    for r in rentals:
        r["product_name"] = prods.get(r["product_id"])
    messages = (
        svc.table("message_log")
        .select("channel,template,status,created_at")
        .eq("customer_id", customer_id)
        .order("created_at", desc=True)
        .limit(50)
        .execute()
        .data
        or []
    )
    return {
        "id": cust["id"],
        "full_name": cust["full_name"],
        "email": cust["email"],
        "phone": cust["phone"],
        "license_status": cust["license_status"],
        "loyalty_tier": cust["loyalty_tier"],
        "transactional_sms": cust["transactional_sms"],
        "rentals": rentals,
        "messages": messages,
    }
