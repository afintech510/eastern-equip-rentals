"""Reservations (§3.2, F-006/F-007/F-019/F-028).

POST /reservations:
  - auth required; server recomputes the quote (REV-011)
  - towing_ack enforced for towable products on pickup (F-028)
  - picks a free unit and INSERTs at pending_fee with insert-retry on the
    exclusion constraint (REV-003) → 409 only when no unit succeeds
  - creates a Stripe booking-fee PaymentIntent (booking fee + 3.5% card surcharge)
  - returns the client secret + hold_expires_at

Deposit & balance are NOT taken here — they happen at handover (Phase 03).
"""

from datetime import UTC, datetime, timedelta
from decimal import Decimal

import stripe
from fastapi import APIRouter, Depends, HTTPException

from app.deps import get_current_user_id
from app.schemas import GateOut, ReservationIn, ReservationOut
from app.services.availability import free_unit_ids
from app.services.pricing import compute_quote, rhu, to_cents
from app.stripe_client import configure as configure_stripe
from app.stripe_client import stripe_ready
from app.supa import service_client

router = APIRouter(prefix="/api/v1", tags=["reservations"])

_CONFLICT_MARKERS = ("23P01", "no_unit_overlap", "exclusion")


def _svc():
    svc = service_client()
    if svc is None:
        raise HTTPException(
            status_code=503, detail={"code": "DB_UNCONFIGURED", "message": "DB not configured"}
        )
    return svc


def _customer_id(svc, user_id: str) -> str:
    res = svc.table("customers").select("id").eq("auth_user_id", user_id).execute()
    if not res.data:
        raise HTTPException(
            status_code=400, detail={"code": "NO_CUSTOMER", "message": "Customer profile missing"}
        )
    return res.data[0]["id"]


def _config(svc) -> dict:
    res = svc.table("config").select("*").eq("id", True).execute()
    if not res.data:
        raise HTTPException(
            status_code=503, detail={"code": "CONFIG_MISSING", "message": "Config not seeded"}
        )
    return res.data[0]


def _is_conflict(exc: Exception) -> bool:
    blob = f"{getattr(exc, 'code', '')} {getattr(exc, 'message', '')} {getattr(exc, 'details', '')} {exc}".lower()
    return any(m.lower() in blob for m in _CONFLICT_MARKERS)


@router.post("/reservations", response_model=ReservationOut, status_code=201)
def create_reservation(body: ReservationIn, user_id: str = Depends(get_current_user_id)):
    if not stripe_ready():
        raise HTTPException(
            status_code=503,
            detail={"code": "PAYMENT_UNCONFIGURED", "message": "Payments not configured"},
        )
    configure_stripe()
    svc = _svc()
    customer_id = _customer_id(svc, user_id)

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
    days = (body.end_date - body.start_date).days + 1
    if days > int(p["max_rental_days"]):
        raise HTTPException(
            status_code=400,
            detail={"code": "MAX_DURATION", "message": f"Max {p['max_rental_days']} days"},
        )

    if body.fulfillment == "delivery":
        raise HTTPException(
            status_code=422,
            detail={
                "code": "DELIVERY_UNAVAILABLE",
                "message": "Delivery isn't available yet — choose pickup.",
            },
        )

    # F-028: towable products on pickup require the towing acknowledgment.
    if p["requires_towing_ack"] and body.fulfillment == "pickup" and not body.towing_ack:
        raise HTTPException(
            status_code=422,
            detail={"code": "TOWING_ACK_REQUIRED", "message": "Please confirm towing requirements"},
        )

    cfg = _config(svc)
    q = compute_quote(
        daily_rate=p["daily_rate"], booking_fee_mode=p["booking_fee_mode"], days=days, cfg=cfg
    )
    card_service_fee = float(
        rhu(Decimal(str(q["booking_fee_amount"])) * Decimal(str(cfg["card_service_fee_pct"])))
    )

    # Insert-retry across free units (REV-003); the exclusion constraint is the
    # real guard — a stale free list just means a retry.
    candidates = free_unit_ids(svc, body.product_id, body.start_date, body.end_date)
    if not candidates:
        raise HTTPException(
            status_code=409,
            detail={
                "code": "UNIT_UNAVAILABLE",
                "message": "That unit was just booked — please pick new dates",
            },
        )

    rental = None
    base_row = {
        "customer_id": customer_id,
        "product_id": body.product_id,
        "start_date": body.start_date.isoformat(),
        "end_date": body.end_date.isoformat(),
        "fulfillment": body.fulfillment,
        "status": "pending_fee",
        "rental_subtotal": q["rental_subtotal"],
        "discount_amount": q["discount_amount"],
        "delivery_fee": q["delivery_fee"],
        "tax_amount": q["tax_amount"],
        "total": q["total"],
        "booking_fee_amount": q["booking_fee_amount"],
        "balance_amount": q["balance_due"],
        "service_fee_total": card_service_fee,
        "towing_ack": body.towing_ack,
        "payment_attempted_at": datetime.now(UTC).isoformat(),
    }
    for unit_id in candidates:
        try:
            res = svc.table("rentals").insert({**base_row, "unit_id": unit_id}).execute()
            rental = res.data[0]
            break
        except Exception as exc:  # noqa: BLE001
            if _is_conflict(exc):
                continue  # unit taken in a race — try the next free unit
            raise
    if rental is None:
        raise HTTPException(
            status_code=409,
            detail={
                "code": "UNIT_UNAVAILABLE",
                "message": "That unit was just booked — please pick new dates",
            },
        )

    rental_id = rental["id"]

    # Booking fee + 3.5% card surcharge, in integer cents (REV-030).
    amount_cents = to_cents(Decimal(str(q["booking_fee_amount"])) + Decimal(str(card_service_fee)))
    try:
        intent = stripe.PaymentIntent.create(
            amount=amount_cents,
            currency="usd",
            metadata={"rental_id": rental_id, "kind": "booking_fee", "customer_id": customer_id},
            automatic_payment_methods={"enabled": True},
            idempotency_key=f"bf_{rental_id}",
        )
    except Exception as exc:  # noqa: BLE001
        # Could not create the intent — release the hold so the unit frees up.
        svc.table("rentals").update({"status": "cancelled"}).eq("id", rental_id).execute()
        raise HTTPException(
            status_code=502, detail={"code": "PAYMENT_FAILED", "message": "Could not start payment"}
        ) from exc

    svc.table("payments").insert(
        {"rental_id": rental_id, "stripe_booking_fee_intent_id": intent.id, "deposit_state": "none"}
    ).execute()

    ttl = int(cfg["reservation_hold_ttl_min"])
    hold_expires_at = (datetime.now(UTC) + timedelta(minutes=ttl)).isoformat()

    return ReservationOut(
        rental_id=rental_id,
        booking_fee_amount=q["booking_fee_amount"],
        card_service_fee=card_service_fee,
        booking_fee_client_secret=intent.client_secret,
        hold_expires_at=hold_expires_at,
    )


@router.get("/reservations/{rental_id}", response_model=GateOut)
def get_reservation(rental_id: str, user_id: str = Depends(get_current_user_id)):
    svc = _svc()
    customer_id = _customer_id(svc, user_id)
    res = (
        svc.table("rentals")
        .select(
            "id,customer_id,status,paid,license_ok,contract_signed,waiver_signed,"
            "booking_fee_amount,balance_amount,total,start_date,end_date,product_id"
        )
        .eq("id", rental_id)
        .execute()
    )
    if not res.data:
        raise HTTPException(
            status_code=404, detail={"code": "NOT_FOUND", "message": "Reservation not found"}
        )
    r = res.data[0]
    if r["customer_id"] != customer_id:
        raise HTTPException(
            status_code=403, detail={"code": "FORBIDDEN", "message": "Not your reservation"}
        )

    prod = svc.table("products").select("name").eq("id", r["product_id"]).execute()
    return GateOut(
        rental_id=r["id"],
        status=r["status"],
        paid=r["paid"],
        license_ok=r["license_ok"],
        contract_signed=r["contract_signed"],
        waiver_signed=r["waiver_signed"],
        booking_fee_amount=float(r["booking_fee_amount"]),
        balance_due=float(r["balance_amount"]),
        total=float(r["total"]),
        start_date=r["start_date"],
        end_date=r["end_date"],
        product_name=prod.data[0]["name"] if prod.data else None,
    )


@router.post("/reservations/{rental_id}/cancel")
def cancel_reservation(rental_id: str, user_id: str = Depends(get_current_user_id)):
    svc = _svc()
    customer_id = _customer_id(svc, user_id)
    res = svc.table("rentals").select("id,customer_id,status").eq("id", rental_id).execute()
    if not res.data:
        raise HTTPException(
            status_code=404, detail={"code": "NOT_FOUND", "message": "Reservation not found"}
        )
    r = res.data[0]
    if r["customer_id"] != customer_id:
        raise HTTPException(
            status_code=403, detail={"code": "FORBIDDEN", "message": "Not your reservation"}
        )
    if r["status"] not in ("pending_fee", "reserved", "ready_for_pickup"):
        raise HTTPException(
            status_code=409, detail={"code": "BAD_STATE", "message": "Cannot cancel at this stage"}
        )

    # Booking fee is non-refundable (F-019). Releases the unit (cancelled is
    # excluded from the no_unit_overlap constraint).
    svc.table("rentals").update({"status": "cancelled"}).eq("id", rental_id).execute()
    svc.table("audit_log").insert(
        {
            "actor_id": user_id,
            "action": "reservation_cancelled",
            "entity_type": "rental",
            "entity_id": rental_id,
        }
    ).execute()
    return {"status": "cancelled"}
