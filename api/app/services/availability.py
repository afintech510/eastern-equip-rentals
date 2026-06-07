"""Availability read service (§2.5, F-003/F-004/F-005).

The READ rule mirrors the `no_unit_overlap` exclusion constraint EXACTLY so the
calendar never disagrees with what the DB write path will accept:

  - A unit is occupied by every rental whose status is NOT IN
    ('cancelled','expired'), over the INCLUSIVE range [start_date, end_date].
  - Inclusive overlap of [a1,a2] and [b1,b2] ⇔ a1 <= b2 AND b1 <= a2.
  - "Next-day": a unit returned on end_date is free on end_date+1, because
    [.., end_date] and [end_date+1, ..] do not overlap under inclusive bounds.

Read-only — no INSERT/lock here. The reservation write path (insert-retry) is
Phase 02b. The pure functions (no DB) carry the logic and are unit-tested.
"""

from calendar import monthrange
from datetime import date, timedelta

# Statuses that occupy a unit (everything except cancelled/expired) — matches
# the exclusion constraint's WHERE predicate.
BLOCKING_STATUSES = [
    "pending_fee",
    "reserved",
    "ready_for_pickup",
    "active",
    "returned",
    "closed",
]


# ---------------- Pure logic (no DB) ----------------
def overlaps(a1: date, a2: date, b1: date, b2: date) -> bool:
    """Inclusive-range overlap (mirrors daterange '[]' && in Postgres)."""
    return a1 <= b2 and b1 <= a2


def units_free_pure(unit_ids: list[str], rentals: list[dict], start: date, end: date) -> int:
    """rentals: [{unit_id, start, end}] already filtered to blocking statuses."""
    occupied = {r["unit_id"] for r in rentals if overlaps(r["start"], r["end"], start, end)}
    return sum(1 for uid in unit_ids if uid not in occupied)


def calendar_pure(unit_ids: list[str], rentals: list[dict], year: int, month: int) -> dict:
    total = len(unit_ids)
    days_in_month = monthrange(year, month)[1]
    days = []
    for dom in range(1, days_in_month + 1):
        d = date(year, month, dom)
        occupied = {r["unit_id"] for r in rentals if r["start"] <= d <= r["end"]}
        free = total - len(occupied)
        days.append({"date": d, "available": free > 0, "units_free": free})
    return {"month": f"{year:04d}-{month:02d}", "total_units": total, "days": days}


# ---------------- DB-backed wrappers ----------------
def _available_unit_ids(svc, product_id: str) -> list[str]:
    res = (
        svc.table("units")
        .select("id")
        .eq("product_id", product_id)
        .eq("status", "available")
        .execute()
    )
    return [row["id"] for row in (res.data or [])]


def _blocking_rentals(svc, unit_ids: list[str], window_start: date, window_end: date) -> list[dict]:
    if not unit_ids:
        return []
    res = (
        svc.table("rentals")
        .select("unit_id,start_date,end_date,status")
        .in_("unit_id", unit_ids)
        .in_("status", BLOCKING_STATUSES)
        .lte("start_date", window_end.isoformat())
        .gte("end_date", window_start.isoformat())
        .execute()
    )
    return [
        {
            "unit_id": r["unit_id"],
            "start": date.fromisoformat(r["start_date"]),
            "end": date.fromisoformat(r["end_date"]),
        }
        for r in (res.data or [])
    ]


def units_free_for_span(svc, product_id: str, start: date, end: date) -> tuple[int, int]:
    unit_ids = _available_unit_ids(svc, product_id)
    total = len(unit_ids)
    if total == 0:
        return 0, 0
    rentals = _blocking_rentals(svc, unit_ids, start, end)
    return units_free_pure(unit_ids, rentals, start, end), total


def free_unit_ids(svc, product_id: str, start: date, end: date) -> list[str]:
    """Ordered list of unit ids with no overlapping rental for [start,end].
    The reservation handler tries these in order (insert-retry, REV-003); the
    exclusion constraint is the real guard against races."""
    unit_ids = _available_unit_ids(svc, product_id)
    if not unit_ids:
        return []
    rentals = _blocking_rentals(svc, unit_ids, start, end)
    occupied = {r["unit_id"] for r in rentals if overlaps(r["start"], r["end"], start, end)}
    return [uid for uid in unit_ids if uid not in occupied]


def calendar_for_month(svc, product_id: str, year: int, month: int) -> dict:
    unit_ids = _available_unit_ids(svc, product_id)
    first = date(year, month, 1)
    last = date(year, month, monthrange(year, month)[1])
    rentals = _blocking_rentals(svc, unit_ids, first, last) if unit_ids else []
    return calendar_pure(unit_ids, rentals, year, month)


def next_free_day(svc, product_id: str, after: date) -> date | None:
    for offset in range(0, 90):
        d = after + timedelta(days=offset)
        free, total = units_free_for_span(svc, product_id, d, d)
        if total and free > 0:
            return d
    return None
