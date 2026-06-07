"""Quote endpoint (§3.2, F-007/F-009/F-010). Server-authoritative pricing —
no client-supplied amounts are trusted (REV-011).

Pickup is fully priced. Delivery pricing (F-009) needs the Google Distance
Matrix integration and is wired alongside Stripe once those keys are set —
until then a delivery quote returns 422 DELIVERY_UNAVAILABLE.
"""

from fastapi import APIRouter, HTTPException

from app.config import get_settings
from app.schemas import QuoteIn, QuoteOut
from app.services.availability import units_free_for_span
from app.services.pricing import compute_quote
from app.supa import service_client

router = APIRouter(prefix="/api/v1", tags=["quote"])
settings = get_settings()


def _svc():
    svc = service_client()
    if svc is None:
        raise HTTPException(
            status_code=503, detail={"code": "DB_UNCONFIGURED", "message": "DB not configured"}
        )
    return svc


def _load_config(svc) -> dict:
    res = svc.table("config").select("*").eq("id", True).execute()
    if not res.data:
        raise HTTPException(
            status_code=503, detail={"code": "CONFIG_MISSING", "message": "Config not seeded"}
        )
    return res.data[0]


@router.post("/quote", response_model=QuoteOut)
def quote(body: QuoteIn):
    svc = _svc()

    prod = (
        svc.table("products")
        .select("id,daily_rate,booking_fee_mode,max_rental_days,requires_towing_ack,active")
        .eq("id", body.product_id)
        .eq("active", True)
        .execute()
    )
    if not prod.data:
        raise HTTPException(
            status_code=404, detail={"code": "NOT_FOUND", "message": "Product not found"}
        )
    p = prod.data[0]

    if body.end_date < body.start_date:
        raise HTTPException(
            status_code=400, detail={"code": "INVALID_DATES", "message": "end before start"}
        )
    days = (body.end_date - body.start_date).days + 1  # inclusive
    if days > int(p["max_rental_days"]):
        raise HTTPException(
            status_code=400,
            detail={
                "code": "MAX_DURATION",
                "message": f"Rentals are limited to {p['max_rental_days']} days",
            },
        )

    # Delivery pricing requires the Distance Matrix integration (deferred).
    if body.fulfillment == "delivery" and not settings_has_distance_key():
        raise HTTPException(
            status_code=422,
            detail={
                "code": "DELIVERY_UNAVAILABLE",
                "message": "Delivery pricing isn't available yet — choose pickup.",
            },
        )

    free, _total_units = units_free_for_span(svc, body.product_id, body.start_date, body.end_date)
    cfg = _load_config(svc)

    q = compute_quote(
        daily_rate=p["daily_rate"],
        booking_fee_mode=p["booking_fee_mode"],
        days=days,
        cfg=cfg,
        delivery_fee=0,
    )
    return QuoteOut(
        **q,
        delivery_in_radius=True,
        requires_towing_ack=bool(p["requires_towing_ack"]),
        available=free > 0,
        rental_days=days,
    )


def settings_has_distance_key() -> bool:
    return bool(getattr(settings, "google_distance_matrix_api_key", "") or "")
