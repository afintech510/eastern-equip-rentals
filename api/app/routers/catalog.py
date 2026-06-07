"""Public catalog + availability (§3.2, F-001/F-002/F-003/F-004/F-005)."""

from datetime import date

from fastapi import APIRouter, HTTPException, Query

from app.schemas import AvailabilityOut, CalendarDay, CalendarOut, ProductOut
from app.services.availability import calendar_for_month, units_free_for_span
from app.supa import service_client

router = APIRouter(prefix="/api/v1", tags=["catalog"])

_PRODUCT_COLS = (
    "id,name,category,description,photo_url,daily_rate,"
    "booking_fee_mode,requires_towing_ack,max_rental_days,active"
)


def _svc():
    svc = service_client()
    if svc is None:
        raise HTTPException(status_code=503, detail={"code": "DB_UNCONFIGURED", "message": "DB not configured"})
    return svc


@router.get("/products", response_model=list[ProductOut])
def list_products(category: str | None = Query(default=None)):
    svc = _svc()
    q = svc.table("products").select(_PRODUCT_COLS).eq("active", True)
    if category:
        q = q.eq("category", category)
    res = q.order("category").order("name").execute()
    return res.data or []


@router.get("/products/{product_id}", response_model=ProductOut)
def get_product(product_id: str):
    svc = _svc()
    res = svc.table("products").select(_PRODUCT_COLS).eq("id", product_id).eq("active", True).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "Product not found"})
    return res.data[0]


def _load_max_days(svc, product_id: str) -> int:
    res = svc.table("products").select("max_rental_days").eq("id", product_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "Product not found"})
    return int(res.data[0]["max_rental_days"])


@router.get("/products/{product_id}/availability", response_model=AvailabilityOut)
def availability(
    product_id: str,
    start: date = Query(...),
    end: date = Query(...),
):
    svc = _svc()
    if end < start:
        raise HTTPException(status_code=400, detail={"code": "INVALID_DATES", "message": "end before start"})
    max_days = _load_max_days(svc, product_id)
    span = (end - start).days + 1  # inclusive
    if span > max_days:
        raise HTTPException(
            status_code=400,
            detail={"code": "MAX_DURATION", "message": f"Rentals are limited to {max_days} days"},
        )
    free, _total = units_free_for_span(svc, product_id, start, end)
    return AvailabilityOut(available=free > 0, units_free=free)


@router.get("/products/{product_id}/calendar", response_model=CalendarOut)
def calendar(product_id: str, month: str = Query(..., pattern=r"^\d{4}-\d{2}$")):
    svc = _svc()
    _load_max_days(svc, product_id)  # 404 if product missing
    year, mon = (int(p) for p in month.split("-"))
    if not 1 <= mon <= 12:
        raise HTTPException(status_code=400, detail={"code": "INVALID_MONTH", "message": "Bad month"})
    data = calendar_for_month(svc, product_id, year, mon)
    return CalendarOut(
        month=data["month"],
        total_units=data["total_units"],
        days=[CalendarDay(**d) for d in data["days"]],
    )
