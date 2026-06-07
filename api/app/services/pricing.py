"""Authoritative quote/pricing engine (§3.2, §5.1).

Server is the single source of truth for money (REV-011): the client never
supplies amounts. All money is Decimal with ROUND_HALF_UP to 2 decimals
(REV-009/REV-030). The deposit and the card service fee are NOT taxed; the
booking fee is a payment against the tax-inclusive total, not a taxable line.

V3-001 (CRITICAL): the booking fee is clamped to never exceed the total, and
dumpsters use a percent-down booking fee instead of the per-day formula.
"""

from decimal import ROUND_HALF_UP, Decimal

TWO = Decimal("0.01")


def rhu(x: Decimal) -> Decimal:
    """round_half_up to cents."""
    return x.quantize(TWO, rounding=ROUND_HALF_UP)


def d(x) -> Decimal:
    return Decimal(str(x))


def to_cents(amount: Decimal) -> int:
    """Integer cents for Stripe (REV-030)."""
    return int(rhu(amount) * 100)


def compute_quote(
    *,
    daily_rate,
    booking_fee_mode: str,
    days: int,
    cfg: dict,
    delivery_fee=0,
) -> dict:
    """Pure pricing. `cfg` is the config singleton row. `delivery_fee` is already
    resolved (0 for pickup). Returns a dict of 2-dp floats matching §3.2."""
    dr = d(daily_rate)
    # percent_down products (dumpsters) are FLAT-priced: the daily_rate column
    # holds the flat fee (e.g. $850 incl. up to 10 tons, up to 2 weeks) and the
    # subtotal does not multiply by days. Standard products bill per day.
    subtotal = rhu(dr) if booking_fee_mode == "percent_down" else rhu(dr * days)
    discount = Decimal("0.00")  # disabled at launch (F-010/F-011)
    delivery = rhu(d(delivery_fee))

    taxable = subtotal - discount + delivery
    tax = rhu(taxable * d(cfg["sales_tax_rate"]))
    total = rhu(taxable + tax)

    if booking_fee_mode == "percent_down":
        # Dumpsters: 30% of the pre-tax subtotal, no per-day component.
        booking_fee = rhu(d(cfg["booking_fee_first_day_pct"]) * subtotal)
    else:
        # Standard: 30% of the first day + flat per extra day.
        booking_fee = rhu(
            d(cfg["booking_fee_first_day_pct"]) * dr
            + d(cfg["booking_fee_per_extra_day"]) * (days - 1)
        )

    # V3-001 clamp: the non-refundable booking fee can never exceed the total.
    if booking_fee > total:
        booking_fee = total

    balance_due = total - booking_fee
    if balance_due < 0:
        balance_due = Decimal("0.00")

    deposit_amount = rhu(d(cfg["deposit_percent"]) * subtotal)  # not taxed
    deposit_strategy = "hold" if days <= int(cfg["deposit_hold_max_days"]) else "charge"

    return {
        "rental_subtotal": float(subtotal),
        "discount_amount": float(discount),
        "delivery_fee": float(delivery),
        "tax_amount": float(tax),
        "total": float(total),
        "booking_fee_amount": float(booking_fee),
        "balance_due": float(balance_due),
        "card_service_fee_pct": float(d(cfg["card_service_fee_pct"])),
        "deposit_amount": float(deposit_amount),
        "deposit_strategy": deposit_strategy,
    }
