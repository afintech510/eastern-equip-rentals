"""Handover, return & deposit settlement (§3.2, F-007b/F-008/F-027, V3-003).

Handover ordering (V3-003 — Postgres, Stripe and the physical handoff can't
share one atomic txn):
  (1) place/verify the DEPOSIT first (hold ≤5d via manual-capture auth / charge
      >5d). If it fails, no money moved → resumable error, stay ready_for_pickup.
  (2) settle the BALANCE (card-on-file off-session +3.5%, or cash/other). If a
      card balance fails, RELEASE the deposit hold (compensation) → resumable.
  (3) the ready_for_pickup → active flip is the LAST, single committed DB write.

"Manual card entry" = attach a different card via /setup-card (tablet
PaymentElement), which becomes the card on file; handover then runs the same
off-session path.
"""

import logging
from datetime import UTC, datetime

import stripe
from fastapi import APIRouter, Depends, HTTPException

from app.config import get_settings
from app.deps import require_admin
from app.schemas import DepositActionIn, HandoverIn, PhotoIn, SwapUnitIn
from app.services.availability import free_unit_ids
from app.services.gate import recompute_and_advance
from app.services.pricing import d, rhu, to_cents
from app.services.storage import signed_url
from app.signwell import create_document, signwell_ready
from app.stripe_client import configure as configure_stripe
from app.stripe_client import get_or_create_customer, saved_payment_method
from app.supa import service_client

logger = logging.getLogger("eastern-rentals-api")
router = APIRouter(prefix="/api/v1/admin", tags=["admin-handover"])
settings = get_settings()


def _svc():
    svc = service_client()
    if svc is None:
        raise HTTPException(
            status_code=503, detail={"code": "DB_UNCONFIGURED", "message": "DB not configured"}
        )
    return svc


def _config(svc) -> dict:
    return svc.table("config").select("*").eq("id", True).execute().data[0]


def _rental(svc, rental_id: str) -> dict:
    r = svc.table("rentals").select("*").eq("id", rental_id).execute()
    if not r.data:
        raise HTTPException(
            status_code=404, detail={"code": "NOT_FOUND", "message": "Rental not found"}
        )
    return r.data[0]


def _payment_row(svc, rental_id: str) -> dict:
    p = svc.table("payments").select("*").eq("rental_id", rental_id).execute()
    if p.data:
        return p.data[0]
    return (
        svc.table("payments")
        .insert({"rental_id": rental_id, "deposit_state": "none"})
        .execute()
        .data[0]
    )


@router.get("/rentals")
def admin_rentals(status: str | None = None, _: str = Depends(require_admin)):
    svc = _svc()
    q = svc.table("rentals").select(
        "id,status,start_date,end_date,customer_id,product_id,total,balance_amount"
    )
    if status:
        q = q.eq("status", status)
    rows = q.order("start_date").execute().data or []
    cids = list({r["customer_id"] for r in rows})
    pids = list({r["product_id"] for r in rows})
    custs = (
        {
            c["id"]: c
            for c in (
                svc.table("customers").select("id,full_name").in_("id", cids).execute().data or []
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
        r["customer_name"] = custs.get(r["customer_id"], {}).get("full_name")
        r["product_name"] = prods.get(r["product_id"], {}).get("name")
    return rows


@router.get("/rentals/{rental_id}")
def admin_rental_detail(rental_id: str, _: str = Depends(require_admin)):
    svc = _svc()
    configure_stripe()
    r = _rental(svc, rental_id)
    cust = (
        svc.table("customers")
        .select("full_name,email,license_status,stripe_customer_id")
        .eq("id", r["customer_id"])
        .execute()
        .data[0]
    )
    unit = None
    if r["unit_id"]:
        u = svc.table("units").select("label,serial_number").eq("id", r["unit_id"]).execute().data
        unit = u[0] if u else None
    pay = _payment_row(svc, rental_id)
    has_card = bool(
        cust.get("stripe_customer_id") and saved_payment_method(cust["stripe_customer_id"])
    )
    days = (
        datetime.fromisoformat(r["end_date"]).date()
        - datetime.fromisoformat(r["start_date"]).date()
    ).days + 1
    cfg = _config(svc)
    deposit_amount = float(rhu(d(cfg["deposit_percent"]) * d(r["rental_subtotal"])))
    return {
        "id": r["id"],
        "status": r["status"],
        "product_id": r["product_id"],
        "unit_id": r["unit_id"],
        "start_date": r["start_date"],
        "end_date": r["end_date"],
        "fulfillment": r["fulfillment"],
        "delivery_address": r["delivery_address"],
        "rental_subtotal": float(r["rental_subtotal"]),
        "total": float(r["total"]),
        "balance_amount": float(r["balance_amount"]),
        "booking_fee_amount": float(r["booking_fee_amount"]),
        "deposit_amount": deposit_amount,
        "deposit_strategy": "hold" if days <= int(cfg["deposit_hold_max_days"]) else "charge",
        "gate": {
            "paid": r["paid"],
            "license_ok": r["license_ok"],
            "contract_signed": r["contract_signed"],
            "waiver_signed": r["waiver_signed"],
        },
        "deposit_state": pay["deposit_state"],
        "customer": {
            "name": cust["full_name"],
            "email": cust["email"],
            "license_status": cust["license_status"],
        },
        "unit": unit,
        "has_card_on_file": has_card,
    }


@router.post("/rentals/{rental_id}/setup-card")
def setup_card(rental_id: str, _: str = Depends(require_admin)):
    """SetupIntent so the admin can attach a (different) card on the tablet."""
    svc = _svc()
    configure_stripe()
    r = _rental(svc, rental_id)
    cust = (
        svc.table("customers")
        .select("id,email,full_name,stripe_customer_id")
        .eq("id", r["customer_id"])
        .execute()
        .data[0]
    )
    sc = get_or_create_customer(svc, cust)
    si = stripe.SetupIntent.create(
        customer=sc,
        usage="off_session",
        automatic_payment_methods={"enabled": True},
        metadata={"rental_id": rental_id},
    )
    return {"client_secret": si.client_secret}


def _gate_ok(r: dict) -> bool:
    return r["paid"] and r["license_ok"] and r["contract_signed"] and r["waiver_signed"]


@router.post("/rentals/{rental_id}/handover")
def handover(rental_id: str, body: HandoverIn, admin_id: str = Depends(require_admin)):
    svc = _svc()
    configure_stripe()
    recompute_and_advance(svc, rental_id)  # advances reserved→ready_for_pickup if gate satisfied
    r = _rental(svc, rental_id)

    if not _gate_ok(r):
        raise HTTPException(
            status_code=409,
            detail={
                "code": "GATE_NOT_SATISFIED",
                "message": "Paid, license, contract and waiver are all required before handover",
            },
        )
    if r["status"] != "ready_for_pickup":
        raise HTTPException(
            status_code=409,
            detail={"code": "BAD_STATE", "message": f"Cannot hand over from {r['status']}"},
        )

    cfg = _config(svc)
    days = (
        datetime.fromisoformat(r["end_date"]).date()
        - datetime.fromisoformat(r["start_date"]).date()
    ).days + 1
    deposit_amount = rhu(d(cfg["deposit_percent"]) * d(r["rental_subtotal"]))
    deposit_strategy = "hold" if days <= int(cfg["deposit_hold_max_days"]) else "charge"
    balance = d(r["balance_amount"])

    cust = (
        svc.table("customers")
        .select("id,email,full_name,stripe_customer_id")
        .eq("id", r["customer_id"])
        .execute()
        .data[0]
    )
    sc = get_or_create_customer(svc, cust)
    pm = saved_payment_method(sc)
    if not pm:
        raise HTTPException(
            status_code=409,
            detail={"code": "NO_CARD_ON_FILE", "message": "No card on file — add a card first"},
        )

    pay = _payment_row(svc, rental_id)

    # ---- (1) DEPOSIT FIRST ----
    try:
        dep = stripe.PaymentIntent.create(
            amount=to_cents(deposit_amount),
            currency="usd",
            customer=sc,
            payment_method=pm,
            off_session=True,
            confirm=True,
            capture_method="manual" if deposit_strategy == "hold" else "automatic",
            metadata={"rental_id": rental_id, "kind": "deposit"},
            idempotency_key=f"dep_{rental_id}",
        )
    except stripe.error.CardError as exc:
        raise HTTPException(
            status_code=402,
            detail={
                "code": "DEPOSIT_FAILED",
                "message": f"Deposit card declined: {exc.user_message or exc.code}. No charge made — try another card.",
            },
        ) from exc

    deposit_state = "held" if deposit_strategy == "hold" else "charged"
    svc.table("payments").update(
        {"stripe_deposit_intent_id": dep.id, "deposit_state": deposit_state}
    ).eq("id", pay["id"]).execute()

    # ---- (2) BALANCE ----
    surcharge = d("0")
    balance_method = body.balance_method
    if body.balance_method == "card_on_file" and balance > 0:
        surcharge = rhu(balance * d(cfg["card_service_fee_pct"]))
        try:
            bal = stripe.PaymentIntent.create(
                amount=to_cents(balance + surcharge),
                currency="usd",
                customer=sc,
                payment_method=pm,
                off_session=True,
                confirm=True,
                metadata={"rental_id": rental_id, "kind": "balance"},
                idempotency_key=f"bal_{rental_id}",
            )
        except stripe.error.CardError as exc:
            # Compensation: undo the deposit so no money is stranded (V3-003).
            try:
                if deposit_strategy == "hold":
                    stripe.PaymentIntent.cancel(dep.id)
                else:
                    stripe.Refund.create(payment_intent=dep.id)
            except Exception as comp_exc:  # noqa: BLE001
                logger.error("deposit compensation failed for %s: %s", rental_id, comp_exc)
            svc.table("payments").update({"deposit_state": "none"}).eq("id", pay["id"]).execute()
            raise HTTPException(
                status_code=402,
                detail={
                    "code": "BALANCE_FAILED",
                    "message": f"Balance card declined: {exc.user_message or exc.code}. Deposit was released — try another card.",
                },
            ) from exc
        svc.table("payments").update(
            {"stripe_balance_intent_id": bal.id, "balance_charged": float(balance)}
        ).eq("id", pay["id"]).execute()
        balance_method = "card"

    # ---- (3) ACTIVE FLIP — last committed write ----
    svc.table("rentals").update(
        {
            "status": "active",
            "deposit_amount": float(deposit_amount),
            "deposit_strategy": deposit_strategy,
            "balance_paid_method": balance_method if balance > 0 else None,
            "balance_paid_at": datetime.now(UTC).isoformat() if balance > 0 else None,
            "service_fee_total": float(d(r["service_fee_total"]) + surcharge),
            "released_at": datetime.now(UTC).isoformat(),
        }
    ).eq("id", rental_id).eq("status", "ready_for_pickup").execute()

    svc.table("audit_log").insert(
        {
            "actor_id": admin_id,
            "action": "handover",
            "entity_type": "rental",
            "entity_id": rental_id,
            "detail_json": {"deposit_strategy": deposit_strategy, "balance_method": balance_method},
        }
    ).execute()
    return {"status": "active", "deposit_state": deposit_state, "balance_method": balance_method}


@router.post("/rentals/{rental_id}/return")
def mark_returned(rental_id: str, admin_id: str = Depends(require_admin)):
    svc = _svc()
    r = _rental(svc, rental_id)
    if r["status"] != "active":
        raise HTTPException(
            status_code=409,
            detail={"code": "BAD_STATE", "message": "Only active rentals can be returned"},
        )
    svc.table("rentals").update(
        {"status": "returned", "returned_at": datetime.now(UTC).isoformat()}
    ).eq("id", rental_id).eq("status", "active").execute()
    svc.table("audit_log").insert(
        {"actor_id": admin_id, "action": "return", "entity_type": "rental", "entity_id": rental_id}
    ).execute()
    return {"status": "returned"}


# ---------------- Condition photos (F-020, M-004) ----------------
@router.post("/rentals/{rental_id}/photos", status_code=201)
def add_photo(rental_id: str, body: PhotoIn, admin_id: str = Depends(require_admin)):
    svc = _svc()
    _rental(svc, rental_id)  # 404 if missing
    svc.table("condition_photos").insert(
        {
            "rental_id": rental_id,
            "phase": body.phase,
            "storage_path": body.storage_path,
            "uploaded_by": admin_id,
        }
    ).execute()
    return {"status": "ok"}


@router.get("/rentals/{rental_id}/photos")
def list_photos(rental_id: str, _: str = Depends(require_admin)):
    svc = _svc()
    rows = (
        svc.table("condition_photos")
        .select("id,phase,storage_path,taken_at")
        .eq("rental_id", rental_id)
        .order("taken_at")
        .execute()
        .data
        or []
    )
    for p in rows:
        p["view_url"] = signed_url("condition-photos", p["storage_path"])
    return rows


# ---------------- Unit swap (F-029, REV-015 Option B) ----------------
@router.post("/rentals/{rental_id}/swap-unit")
def swap_unit(rental_id: str, body: SwapUnitIn, admin_id: str = Depends(require_admin)):
    """Reassign the unit on an active/ready rental. Re-checks the target unit is
    free for the remaining range (the exclusion constraint is the real guard),
    issues a single-field SignWell addendum acknowledging the substitute serial,
    and preserves the original contract/waiver."""
    svc = _svc()
    configure_stripe()
    r = _rental(svc, rental_id)
    if r["status"] not in ("reserved", "ready_for_pickup", "active"):
        raise HTTPException(
            status_code=409, detail={"code": "BAD_STATE", "message": "Cannot swap at this stage"}
        )

    target = (
        svc.table("units")
        .select("id,product_id,label,serial_number,status")
        .eq("id", body.unit_id)
        .execute()
        .data
    )
    if not target:
        raise HTTPException(
            status_code=404, detail={"code": "NOT_FOUND", "message": "Unit not found"}
        )
    target = target[0]
    if target["product_id"] != r["product_id"]:
        raise HTTPException(
            status_code=422,
            detail={"code": "WRONG_PRODUCT", "message": "Unit is a different product"},
        )

    # Re-check the target is free for this rental's range (exclude this rental).
    from datetime import date as _date

    start = _date.fromisoformat(r["start_date"])
    end = _date.fromisoformat(r["end_date"])
    free = free_unit_ids(svc, r["product_id"], start, end)
    if body.unit_id not in free and body.unit_id != r["unit_id"]:
        raise HTTPException(
            status_code=409,
            detail={
                "code": "UNIT_UNAVAILABLE",
                "message": "Target unit isn't free for these dates",
            },
        )

    old_unit = (
        svc.table("units").select("label,serial_number").eq("id", r["unit_id"]).execute().data
        if r["unit_id"]
        else None
    )
    old_serial = (old_unit[0]["serial_number"] or old_unit[0]["label"]) if old_unit else None

    # Reassign (exclusion constraint enforces no overlap on commit).
    try:
        svc.table("rentals").update({"unit_id": body.unit_id}).eq("id", rental_id).execute()
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=409,
            detail={"code": "UNIT_UNAVAILABLE", "message": "Target unit just became unavailable"},
        ) from exc

    # Single-field e-sign addendum (Option B) — preserves original signatures.
    addendum_doc = None
    if signwell_ready() and settings.signwell_waiver_template_id:
        cust = (
            svc.table("customers")
            .select("full_name,email")
            .eq("id", r["customer_id"])
            .execute()
            .data[0]
        )
        try:
            doc = create_document(
                doc_type="waiver",  # reuse a template as the addendum carrier
                full_name=cust["full_name"],
                email=cust["email"],
                rental_id=rental_id,
                serial=target["serial_number"] or target["label"],
                redirect_url=f"{settings.app_base_url}/account",
            )
            svc.table("rental_documents").insert(
                {
                    "rental_id": rental_id,
                    "doc_type": "contract",
                    "signwell_document_id": doc["document_id"],
                    "status": "sent",
                }
            ).execute()
            addendum_doc = doc["document_id"]
        except Exception as exc:  # noqa: BLE001
            logger.error("swap addendum create failed: %s", exc)

    svc.table("audit_log").insert(
        {
            "actor_id": admin_id,
            "action": "unit_swap",
            "entity_type": "rental",
            "entity_id": rental_id,
            "detail_json": {
                "from_serial": old_serial,
                "to_serial": target["serial_number"] or target["label"],
                "addendum": addendum_doc,
            },
        }
    ).execute()
    return {"status": "swapped", "to_unit": target["label"], "addendum_document": addendum_doc}


@router.post("/rentals/{rental_id}/deposit")
def settle_deposit(rental_id: str, body: DepositActionIn, admin_id: str = Depends(require_admin)):
    svc = _svc()
    configure_stripe()
    pay = _payment_row(svc, rental_id)
    dep_id = pay.get("stripe_deposit_intent_id")
    if not dep_id:
        raise HTTPException(
            status_code=409, detail={"code": "NO_DEPOSIT", "message": "No deposit on this rental"}
        )

    r = _rental(svc, rental_id)
    full = d(r["deposit_amount"]) if r["deposit_amount"] else d("0")
    amt = d(str(body.amount)) if body.amount is not None else full

    if body.action == "capture":
        stripe.PaymentIntent.capture(dep_id, amount_to_capture=to_cents(amt))
        svc.table("payments").update(
            {"deposit_state": "captured", "deposit_captured_amount": float(amt)}
        ).eq("id", pay["id"]).execute()
        new_state = "captured"
    elif body.action == "release":
        stripe.PaymentIntent.cancel(dep_id)
        svc.table("payments").update({"deposit_state": "released"}).eq("id", pay["id"]).execute()
        new_state = "released"
    else:  # refund (for charged/captured deposits)
        stripe.Refund.create(payment_intent=dep_id, amount=to_cents(amt))
        svc.table("payments").update(
            {"deposit_state": "refunded", "deposit_refund_amount": float(amt)}
        ).eq("id", pay["id"]).execute()
        new_state = "refunded"

    svc.table("audit_log").insert(
        {
            "actor_id": admin_id,
            "action": f"deposit_{body.action}",
            "entity_type": "rental",
            "entity_id": rental_id,
            "detail_json": {"amount": float(amt)},
        }
    ).execute()
    return {"deposit_state": new_state}
