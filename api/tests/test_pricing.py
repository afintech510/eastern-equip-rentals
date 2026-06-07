"""Unit tests for the quote/pricing engine (§3.2, V3-001 clamp, dumpster
percent_down, tax, deposit strategy)."""

from app.services.pricing import compute_quote, to_cents

CFG = {
    "sales_tax_rate": "0.08750",
    "card_service_fee_pct": "0.03500",
    "deposit_percent": "0.30000",
    "booking_fee_first_day_pct": "0.30000",
    "booking_fee_per_extra_day": "100.00",
    "deposit_hold_max_days": 5,
}


def test_standard_single_day():
    q = compute_quote(daily_rate=350, booking_fee_mode="standard", days=1, cfg=CFG)
    assert q["rental_subtotal"] == 350.00
    assert q["tax_amount"] == 30.63  # 350 * 0.0875 = 30.625 -> 30.63
    assert q["total"] == 380.63
    assert q["booking_fee_amount"] == 105.00  # 0.30*350
    assert q["balance_due"] == 275.63
    assert q["deposit_amount"] == 105.00
    assert q["deposit_strategy"] == "hold"


def test_standard_multi_day_clamp_v3_001():
    # daily 50 x 5 days -> subtotal 250, total 271.88. Raw booking fee =
    # 0.30*50 + 100*4 = 415 > total -> MUST clamp to total (V3-001).
    q = compute_quote(daily_rate=50, booking_fee_mode="standard", days=5, cfg=CFG)
    assert q["rental_subtotal"] == 250.00
    assert q["total"] == 271.88
    assert q["booking_fee_amount"] == 271.88  # clamped, not 415
    assert q["balance_due"] == 0.00


def test_deposit_strategy_over_5_days_charges():
    q = compute_quote(daily_rate=350, booking_fee_mode="standard", days=6, cfg=CFG)
    assert q["deposit_strategy"] == "charge"  # > 5 days


def test_dumpster_flat_fee_percent_down():
    # Dumpsters are FLAT: $850 regardless of days; subtotal does NOT × days.
    q5 = compute_quote(daily_rate=850, booking_fee_mode="percent_down", days=5, cfg=CFG)
    q14 = compute_quote(daily_rate=850, booking_fee_mode="percent_down", days=14, cfg=CFG)
    assert q5["rental_subtotal"] == 850.00
    assert q14["rental_subtotal"] == 850.00  # same flat fee at 14 days
    assert q5["booking_fee_amount"] == 255.00  # 0.30 * 850
    assert q5["total"] == 924.38  # 850 * 1.0875
    assert q5["balance_due"] == 669.38


def test_delivery_is_taxed_in_base():
    q = compute_quote(daily_rate=100, booking_fee_mode="standard", days=2, cfg=CFG, delivery_fee=199)
    # taxable = 200 + 199 = 399; tax = 34.91; total = 433.91
    assert q["delivery_fee"] == 199.00
    assert q["tax_amount"] == 34.91
    assert q["total"] == 433.91


def test_to_cents():
    from decimal import Decimal

    assert to_cents(Decimal("271.88")) == 27188
    assert to_cents(Decimal("105")) == 10500
