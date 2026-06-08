"""Release-gate helpers (§2.2, F-017, REV-006). recompute_gate() is the DB
source of truth for the four flags; when all are satisfied a `reserved` rental
auto-advances to `ready_for_pickup` (handover then flips it to `active`)."""

import logging

logger = logging.getLogger("eastern-rentals-api")


def gate_satisfied(rental_row: dict) -> bool:
    """The four-flag release gate (F-017): a rental is ready for handover only
    when the booking fee is paid, the license is approved, and both the contract
    and waiver are signed. Pure — the unit of test (§9.2)."""
    return bool(
        rental_row.get("paid")
        and rental_row.get("license_ok")
        and rental_row.get("contract_signed")
        and rental_row.get("waiver_signed")
    )


def recompute_and_advance(svc, rental_id: str) -> dict | None:
    """Recompute the gate flags from source state, then advance reserved →
    ready_for_pickup if all four are satisfied. Returns the updated rental row."""
    svc.rpc("recompute_gate", {"p_rental_id": rental_id}).execute()
    res = (
        svc.table("rentals")
        .select("id,status,paid,license_ok,contract_signed,waiver_signed")
        .eq("id", rental_id)
        .execute()
    )
    if not res.data:
        return None
    r = res.data[0]
    gate_ok = gate_satisfied(r)
    if gate_ok and r["status"] == "reserved":
        svc.table("rentals").update({"status": "ready_for_pickup"}).eq("id", rental_id).eq(
            "status", "reserved"
        ).execute()
        r["status"] = "ready_for_pickup"
        logger.info("Rental %s gate satisfied → ready_for_pickup", rental_id)
    return r


def recompute_for_customer(svc, customer_id: str) -> None:
    """Re-evaluate every open rental for a customer (e.g. after a license decision)."""
    res = (
        svc.table("rentals")
        .select("id")
        .eq("customer_id", customer_id)
        .in_("status", ["pending_fee", "reserved", "ready_for_pickup"])
        .execute()
    )
    for r in res.data or []:
        recompute_and_advance(svc, r["id"])
