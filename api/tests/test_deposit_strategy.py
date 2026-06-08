"""Deposit-strategy selection (§9.2, F-008): ≤5 rental days → hold the deposit,
>5 days → charge it. Boundary lives at exactly 5 vs 6 days."""

from app.services.pricing import compute_quote

CFG = {
    "sales_tax_rate": "0.08750",
    "card_service_fee_pct": "0.03500",
    "deposit_percent": "0.30000",
    "booking_fee_first_day_pct": "0.30000",
    "booking_fee_per_extra_day": "100.00",
    "deposit_hold_max_days": 5,
}


def _strategy(days: int) -> str:
    return compute_quote(daily_rate=350, booking_fee_mode="standard", days=days, cfg=CFG)[
        "deposit_strategy"
    ]


def test_short_rentals_hold():
    assert _strategy(1) == "hold"
    assert _strategy(4) == "hold"
    assert _strategy(5) == "hold"  # boundary: 5 days still holds


def test_long_rentals_charge():
    assert _strategy(6) == "charge"  # boundary: 6 days charges
    assert _strategy(14) == "charge"


def test_deposit_is_percent_of_subtotal():
    q = compute_quote(daily_rate=350, booking_fee_mode="standard", days=2, cfg=CFG)
    # 0.30 * (350 * 2) = 210.00
    assert q["deposit_amount"] == 210.00
