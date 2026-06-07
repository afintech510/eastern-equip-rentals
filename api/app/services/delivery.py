"""Delivery pricing via Google Distance Matrix (§5.5, F-009, M-006).

fee = delivery_base_fee + delivery_per_mile × max(0, miles − delivery_free_miles)
in_radius = miles ≤ delivery_max_radius_miles  (else "delivery not available")

REV-010/REV-034: if the API errors, the booking must NOT deadlock — the booking
fee is rental-based, not delivery-dependent. We return pending=True with fee 0
so checkout proceeds; the admin finalizes the delivery fee at/ before pickup.
"""

import logging
from decimal import Decimal

import httpx

from app.config import get_settings
from app.services.pricing import d, rhu

logger = logging.getLogger("eastern-rentals-api")
settings = get_settings()

DM_URL = "https://maps.googleapis.com/maps/api/distancematrix/json"
METERS_PER_MILE = Decimal("1609.344")


class DeliveryQuote:
    def __init__(self, distance_miles: float | None, fee: float, in_radius: bool, pending: bool):
        self.distance_miles = distance_miles
        self.fee = fee
        self.in_radius = in_radius
        self.pending = pending


def _fee_for_miles(miles: Decimal, cfg: dict) -> Decimal:
    base = d(cfg["delivery_base_fee"])
    per_mile = d(cfg["delivery_per_mile"])
    free = d(cfg["delivery_free_miles"])
    extra = miles - free
    if extra < 0:
        extra = Decimal("0")
    return rhu(base + per_mile * extra)


def quote_delivery(address: str, cfg: dict) -> DeliveryQuote:
    """Returns a DeliveryQuote. out-of-radius → in_radius False (caller 422s).
    API error → pending True, fee 0 (caller lets the booking proceed)."""
    if not settings.google_distance_matrix_api_key:
        # Not configured — let booking proceed; admin prices delivery manually.
        return DeliveryQuote(None, 0.0, True, True)
    try:
        resp = httpx.get(
            DM_URL,
            params={
                "origins": settings.yard_origin,
                "destinations": address,
                "units": "imperial",
                "key": settings.google_distance_matrix_api_key,
            },
            timeout=15,
        )
        data = resp.json()
        el = data["rows"][0]["elements"][0]
        if data.get("status") != "OK" or el.get("status") != "OK":
            logger.warning("Distance Matrix non-OK: %s / %s", data.get("status"), el.get("status"))
            # Bad/unresolvable address — treat as out of range (clear customer error).
            return DeliveryQuote(None, 0.0, False, False)
        miles = d(el["distance"]["value"]) / METERS_PER_MILE
        miles_q = miles.quantize(Decimal("0.1"))
        in_radius = miles <= d(cfg["delivery_max_radius_miles"])
        if not in_radius:
            return DeliveryQuote(float(miles_q), 0.0, False, False)
        return DeliveryQuote(float(miles_q), float(_fee_for_miles(miles, cfg)), True, False)
    except Exception as exc:  # noqa: BLE001 — no deadlock (REV-034)
        logger.error("Distance Matrix error: %s — proceeding pending", exc)
        return DeliveryQuote(None, 0.0, True, True)
