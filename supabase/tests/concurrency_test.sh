#!/usr/bin/env bash
# Phase 02a concurrency proof (F-004, §2.5).
# Fires N parallel overlapping INSERTs on the SAME unit → exactly one commits
# (others hit the no_unit_overlap exclusion constraint). Then proves two
# DIFFERENT free units both book the same dates. Uses psql with PG* env vars.
# Self-contained: creates fixtures, asserts, cleans up. Exit 1 on failure.
set -uo pipefail

PSQL="psql -v ON_ERROR_STOP=0 -t -A -q"
DATES="'2026-09-01','2026-09-05'"
N=8
fail=0

cleanup() {
  psql -q -c "DELETE FROM rentals WHERE product_id IN (SELECT id FROM products WHERE name='__conc_test__');" >/dev/null 2>&1
  psql -q -c "DELETE FROM units   WHERE product_id IN (SELECT id FROM products WHERE name='__conc_test__');" >/dev/null 2>&1
  psql -q -c "DELETE FROM products WHERE name='__conc_test__';" >/dev/null 2>&1
  psql -q -c "DELETE FROM customers WHERE email='__conc_test__@example.com';" >/dev/null 2>&1
}
trap cleanup EXIT

cleanup  # clear any prior run

CUST=$($PSQL -c "INSERT INTO customers(email,full_name) VALUES('__conc_test__@example.com','Conc Test') RETURNING id")
PROD=$($PSQL -c "INSERT INTO products(name,category,daily_rate) VALUES('__conc_test__','test',100) RETURNING id")
UNIT1=$($PSQL -c "INSERT INTO units(product_id,label) VALUES('$PROD','__conc_u1__') RETURNING id")
UNIT2=$($PSQL -c "INSERT INTO units(product_id,label) VALUES('$PROD','__conc_u2__') RETURNING id")

insert_rental() {  # $1 = unit_id
  psql -q -c "INSERT INTO rentals(customer_id,product_id,unit_id,start_date,end_date,rental_subtotal,total,booking_fee_amount,status)
              VALUES('$CUST','$PROD','$1',$DATES,500,500,150,'reserved');" >/dev/null 2>&1
}

echo "── firing $N concurrent overlapping inserts on the same unit"
for _ in $(seq 1 "$N"); do insert_rental "$UNIT1" & done
wait

WON=$($PSQL -c "SELECT count(*) FROM rentals WHERE unit_id='$UNIT1' AND status NOT IN ('cancelled','expired');")
if [ "$WON" = "1" ]; then
  echo "PASS: exactly one of $N concurrent inserts won the unit (got $WON)"
else
  echo "FAIL: expected 1 winner on the contended unit, got $WON"; fail=1
fi

echo "── booking a second, free unit for the same dates"
insert_rental "$UNIT2"
TWO=$($PSQL -c "SELECT count(DISTINCT unit_id) FROM rentals WHERE unit_id IN ('$UNIT1','$UNIT2') AND status NOT IN ('cancelled','expired');")
if [ "$TWO" = "2" ]; then
  echo "PASS: two different free units both booked the same dates (distinct units=$TWO)"
else
  echo "FAIL: expected 2 booked units, got $TWO"; fail=1
fi

exit $fail
