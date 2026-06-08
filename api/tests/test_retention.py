"""Retention legal-hold logic (§9.2, V3-002). The purge windows are easy; the
risk is purging PII that's under litigation hold. These assert the hold rules
that gate every delete."""

from datetime import date

from app.services.retention import due_for_purge, license_is_held, record_is_held


def test_due_for_purge_window():
    today = date(2026, 6, 7)
    assert due_for_purge(date(2026, 6, 6), today) is True  # past
    assert due_for_purge(date(2026, 6, 7), today) is True  # exactly today
    assert due_for_purge(date(2026, 6, 8), today) is False  # future
    assert due_for_purge(None, today) is False  # no window set


def test_license_held_when_customer_held():
    # V3-002: a hold on the owning customer blocks the license purge even if no
    # rental is held.
    assert license_is_held(customer_legal_hold=True, rental_holds=[]) is True
    assert license_is_held(customer_legal_hold=True, rental_holds=[False, False]) is True


def test_license_held_when_any_rental_held():
    assert license_is_held(customer_legal_hold=False, rental_holds=[False, True]) is True


def test_license_not_held_when_nothing_held():
    assert license_is_held(customer_legal_hold=False, rental_holds=[False, False]) is False
    assert license_is_held(customer_legal_hold=False, rental_holds=[]) is False


def test_rental_scoped_record_hold():
    assert record_is_held(True) is True
    assert record_is_held(False) is False
