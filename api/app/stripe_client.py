"""Stripe configuration. Test keys come from env (Doppler/.env), never committed."""

import stripe

from app.config import get_settings

settings = get_settings()


def stripe_ready() -> bool:
    return bool(settings.stripe_secret_key)


def configure() -> None:
    if settings.stripe_secret_key:
        stripe.api_key = settings.stripe_secret_key
