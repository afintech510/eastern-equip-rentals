"""Admin inventory CRUD — products / units / rates (F-026, §3.2).

Every route re-checks admin authority via require_admin (admin_users). Uses the
service-role client (bypasses RLS); authorization is enforced at the API layer.
"""

from fastapi import APIRouter, Depends, HTTPException

from app.deps import require_admin
from app.schemas import ProductIn, ProductUpdate, RateIn, UnitIn, UnitUpdate
from app.supa import service_client

router = APIRouter(prefix="/api/v1/admin", tags=["admin-inventory"])

_PRODUCT_COLS = (
    "id,name,category,description,photo_url,daily_rate,"
    "booking_fee_mode,requires_towing_ack,max_rental_days,active,created_at,updated_at"
)


def _svc():
    svc = service_client()
    if svc is None:
        raise HTTPException(
            status_code=503, detail={"code": "DB_UNCONFIGURED", "message": "DB not configured"}
        )
    return svc


def _deposit_percent_set(svc) -> bool:
    res = svc.table("config").select("deposit_percent").eq("id", True).execute()
    return bool(res.data) and float(res.data[0]["deposit_percent"]) > 0


# ---------------- Products ----------------
@router.get("/products")
def list_products(_: str = Depends(require_admin)):
    svc = _svc()
    res = svc.table("products").select(_PRODUCT_COLS).order("category").order("name").execute()
    return res.data or []


@router.post("/products", status_code=201)
def create_product(body: ProductIn, _: str = Depends(require_admin)):
    svc = _svc()
    # A product cannot go active until config.deposit_percent is set.
    if body.active and not _deposit_percent_set(svc):
        raise HTTPException(
            status_code=409,
            detail={
                "code": "CONFIG_INCOMPLETE",
                "message": "config.deposit_percent must be set before activating products",
            },
        )
    res = svc.table("products").insert(body.model_dump()).execute()
    return res.data[0]


@router.patch("/products/{product_id}")
def update_product(product_id: str, body: ProductUpdate, _: str = Depends(require_admin)):
    svc = _svc()
    patch = {k: v for k, v in body.model_dump().items() if v is not None}
    if not patch:
        raise HTTPException(
            status_code=400, detail={"code": "NO_FIELDS", "message": "Nothing to update"}
        )
    if patch.get("active") is True and not _deposit_percent_set(svc):
        raise HTTPException(
            status_code=409,
            detail={
                "code": "CONFIG_INCOMPLETE",
                "message": "config.deposit_percent must be set before activating products",
            },
        )
    res = svc.table("products").update(patch).eq("id", product_id).execute()
    if not res.data:
        raise HTTPException(
            status_code=404, detail={"code": "NOT_FOUND", "message": "Product not found"}
        )
    return res.data[0]


@router.delete("/products/{product_id}", status_code=204)
def delete_product(product_id: str, _: str = Depends(require_admin)):
    svc = _svc()
    svc.table("products").delete().eq("id", product_id).execute()
    return None


# ---------------- Units ----------------
@router.get("/products/{product_id}/units")
def list_units(product_id: str, _: str = Depends(require_admin)):
    svc = _svc()
    res = svc.table("units").select("*").eq("product_id", product_id).order("label").execute()
    return res.data or []


@router.post("/units", status_code=201)
def create_unit(body: UnitIn, _: str = Depends(require_admin)):
    svc = _svc()
    res = svc.table("units").insert(body.model_dump()).execute()
    return res.data[0]


@router.patch("/units/{unit_id}")
def update_unit(unit_id: str, body: UnitUpdate, _: str = Depends(require_admin)):
    svc = _svc()
    patch = {k: v for k, v in body.model_dump().items() if v is not None}
    if not patch:
        raise HTTPException(
            status_code=400, detail={"code": "NO_FIELDS", "message": "Nothing to update"}
        )
    res = svc.table("units").update(patch).eq("id", unit_id).execute()
    if not res.data:
        raise HTTPException(
            status_code=404, detail={"code": "NOT_FOUND", "message": "Unit not found"}
        )
    return res.data[0]


@router.delete("/units/{unit_id}", status_code=204)
def delete_unit(unit_id: str, _: str = Depends(require_admin)):
    svc = _svc()
    svc.table("units").delete().eq("id", unit_id).execute()
    return None


# ---------------- Rates ----------------
@router.get("/products/{product_id}/rates")
def list_rates(product_id: str, _: str = Depends(require_admin)):
    svc = _svc()
    res = (
        svc.table("product_rates")
        .select("*")
        .eq("product_id", product_id)
        .order("min_days")
        .execute()
    )
    return res.data or []


@router.post("/rates", status_code=201)
def create_rate(body: RateIn, _: str = Depends(require_admin)):
    svc = _svc()
    res = svc.table("product_rates").insert(body.model_dump()).execute()
    return res.data[0]


@router.delete("/rates/{rate_id}", status_code=204)
def delete_rate(rate_id: str, _: str = Depends(require_admin)):
    svc = _svc()
    svc.table("product_rates").delete().eq("id", rate_id).execute()
    return None
