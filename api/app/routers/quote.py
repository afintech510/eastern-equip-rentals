"""Quote + delivery endpoints (§3.2/§5.5, F-007/F-009/F-010). Server-authoritative
pricing — no client-supplied amounts are trusted (REV-011)."""

from fastapi import APIRouter, Depends, HTTPException

from app.config import get_settings
from app.ratelimit import rate_limit
from app.schemas import DeliveryQuoteIn, DeliveryQuoteOut, QuoteIn, QuoteOut
from app.services.availability import units_free_for_span
from app.services.delivery import quote_delivery
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


@router.post("/delivery/quote", response_model=DeliveryQuoteOut)
def delivery_quote(body: DeliveryQuoteIn):
    svc = _svc()
    cfg = _load_config(svc)
    dq = quote_delivery(body.address, cfg)
    return DeliveryQuoteOut(
        distance_miles=dq.distance_miles, fee=dq.fee, in_radius=dq.in_radius, pending=dq.pending
    )


@router.post(
    "/quote",
    response_model=QuoteOut,
    dependencies=[Depends(rate_limit("quote", limit=60, window_seconds=60))],
)
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

    cfg = _load_config(svc)

    # Delivery pricing (F-009): out of radius → 422; API error → pending (fee 0,
    # no deadlock, REV-034); pickup → fee 0.
    delivery_fee = 0.0
    delivery_in_radius = True
    if body.fulfillment == "delivery":
        if not body.delivery_address:
            raise HTTPException(
                status_code=400,
                detail={"code": "ADDRESS_REQUIRED", "message": "Delivery address required"},
            )
        dq = quote_delivery(body.delivery_address, cfg)
        if not dq.in_radius and not dq.pending:
            raise HTTPException(
                status_code=422,
                detail={
                    "code": "DELIVERY_OUT_OF_RANGE",
                    "message": "Delivery isn't available to that address",
                },
            )
        delivery_fee = dq.fee
        delivery_in_radius = dq.in_radius

    free, _total_units = units_free_for_span(svc, body.product_id, body.start_date, body.end_date)

    q = compute_quote(
        daily_rate=p["daily_rate"],
        booking_fee_mode=p["booking_fee_mode"],
        days=days,
        cfg=cfg,
        delivery_fee=delivery_fee,
    )
    return QuoteOut(
        **q,
        delivery_in_radius=delivery_in_radius,
        requires_towing_ack=bool(p["requires_towing_ack"]),
        available=free > 0,
        rental_days=days,
    )
