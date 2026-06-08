"""Delivery pricing (§5.5, F-009, §9.2): $199 base + $5/mi beyond 10 free miles,
40-mile radius reject."""

from decimal import Decimal

from app.services.delivery import _fee_for_miles
from app.services.pricing import d

CFG = {
    "delivery_base_fee": "199.00",
    "delivery_per_mile": "5.00",
    "delivery_free_miles": 10,
    "delivery_max_radius_miles": 40,
}


def test_within_free_miles_is_base_only():
    assert _fee_for_miles(Decimal("8"), CFG) == Decimal("199.00")
    assert _fee_for_miles(Decimal("10"), CFG) == Decimal("199.00")


def test_per_mile_beyond_free_band():
    # 20 mi -> 199 + 5*(20-10) = 249
    assert _fee_for_miles(Decimal("20"), CFG) == Decimal("249.00")
    # 40 mi -> 199 + 5*(40-10) = 349
    assert _fee_for_miles(Decimal("40"), CFG) == Decimal("349.00")


def test_radius_reject_boundary():
    max_radius = d(CFG["delivery_max_radius_miles"])
    assert d("40") <= max_radius  # 40 is in range
    assert not (d("40.1") <= max_radius)  # just past the radius is rejected
