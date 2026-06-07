"""Stripe configuration. Test keys come from env (Doppler/.env), never committed."""

import stripe

from app.config import get_settings

settings = get_settings()


def stripe_ready() -> bool:
    return bool(settings.stripe_secret_key)


def configure() -> None:
    if settings.stripe_secret_key:
        stripe.api_key = settings.stripe_secret_key


def get_or_create_customer(svc, customer: dict) -> str:
    """Stripe Customer for the renter (so the booking-fee card can be saved and
    re-charged off-session at handover). Cached on customers.stripe_customer_id."""
    if customer.get("stripe_customer_id"):
        return customer["stripe_customer_id"]
    cust = stripe.Customer.create(
        email=customer.get("email"),
        name=customer.get("full_name"),
        metadata={"customer_id": customer["id"]},
    )
    svc.table("customers").update({"stripe_customer_id": cust.id}).eq(
        "id", customer["id"]
    ).execute()
    return cust.id


def saved_payment_method(stripe_customer_id: str) -> str | None:
    """Most-recent saved card for off-session charges at handover."""
    pms = stripe.PaymentMethod.list(customer=stripe_customer_id, type="card", limit=1)
    return pms.data[0].id if pms.data else None
