"""Release-gate boolean logic (§9.2, F-017). The gate opens only when all four
flags are true; any single false keeps it shut."""

import pytest

from app.services.gate import gate_satisfied

ALL_TRUE = {"paid": True, "license_ok": True, "contract_signed": True, "waiver_signed": True}


def test_all_four_flags_open_the_gate():
    assert gate_satisfied(ALL_TRUE) is True


@pytest.mark.parametrize("missing", list(ALL_TRUE.keys()))
def test_any_single_false_keeps_gate_shut(missing):
    row = {**ALL_TRUE, missing: False}
    assert gate_satisfied(row) is False


def test_missing_keys_treated_as_false():
    assert gate_satisfied({"paid": True}) is False
    assert gate_satisfied({}) is False
