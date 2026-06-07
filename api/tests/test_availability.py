"""Unit tests for the availability read logic — proves the calendar/read rule
mirrors the §2.5 inclusive-range exclusion constraint (next-day model)."""

from datetime import date

from app.services.availability import calendar_pure, overlaps, units_free_pure


def test_overlap_inclusive_next_day():
    # [Jun1,Jun3] vs [Jun4,Jun6] → no overlap (available next day)
    assert overlaps(date(2026, 6, 1), date(2026, 6, 3), date(2026, 6, 4), date(2026, 6, 6)) is False
    # [Jun1,Jun3] vs [Jun3,Jun5] → overlap (no same-day rebook)
    assert overlaps(date(2026, 6, 1), date(2026, 6, 3), date(2026, 6, 3), date(2026, 6, 5)) is True


def test_units_free_single_unit_next_day():
    units = ["u1"]
    rentals = [{"unit_id": "u1", "start": date(2026, 6, 1), "end": date(2026, 6, 3)}]
    # same-day rebook starting Jun3 → blocked
    assert units_free_pure(units, rentals, date(2026, 6, 3), date(2026, 6, 5)) == 0
    # next-day Jun4 → free
    assert units_free_pure(units, rentals, date(2026, 6, 4), date(2026, 6, 6)) == 1


def test_units_free_multi_unit():
    units = ["u1", "u2", "u3"]
    rentals = [
        {"unit_id": "u1", "start": date(2026, 6, 1), "end": date(2026, 6, 10)},
        {"unit_id": "u2", "start": date(2026, 6, 5), "end": date(2026, 6, 7)},
    ]
    # span Jun6-Jun6: u1 and u2 busy, u3 free → 1 free
    assert units_free_pure(units, rentals, date(2026, 6, 6), date(2026, 6, 6)) == 1
    # span Jun20: all free
    assert units_free_pure(units, rentals, date(2026, 6, 20), date(2026, 6, 20)) == 3


def test_cancelled_excluded_by_caller():
    # cancelled/expired are filtered out before reaching units_free_pure, so a
    # unit with only such rentals (none passed in) is fully free.
    assert units_free_pure(["u1"], [], date(2026, 6, 2), date(2026, 6, 3)) == 1


def test_calendar_marks_booked_and_next_day_free():
    units = ["u1"]
    rentals = [{"unit_id": "u1", "start": date(2026, 6, 1), "end": date(2026, 6, 3)}]
    cal = calendar_pure(units, rentals, 2026, 6)
    by_day = {d["date"].day: d for d in cal["days"]}
    assert cal["total_units"] == 1
    assert by_day[2]["available"] is False  # within booked range
    assert by_day[3]["available"] is False  # end_date still occupied
    assert by_day[4]["available"] is True  # next day free
    assert len(cal["days"]) == 30  # June
