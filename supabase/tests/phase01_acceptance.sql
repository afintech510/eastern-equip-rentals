-- ============================================================
-- Phase 01 · Acceptance assertions (run against the live DB)
--   psql "$SUPABASE_DB_URL" -f supabase/tests/phase01_acceptance.sql
-- Everything runs inside one transaction and ROLLs BACK — no data persists.
-- Emits PASS/FAIL NOTICEs; a FAIL raises and aborts.
-- ============================================================
BEGIN;

-- ---- Exclusion constraint (§2.5) + status state machine + config check ----
DO $$
DECLARE
  cust uuid; prod uuid; unit uuid; r1 uuid; r_pf uuid;
BEGIN
  INSERT INTO public.customers (email, full_name)
    VALUES ('phase01-test@example.com', 'Phase01 Test') RETURNING id INTO cust;
  INSERT INTO public.products (name, category, daily_rate)
    VALUES ('__test_product__', 'test', 100.00) RETURNING id INTO prod;
  INSERT INTO public.units (product_id, label)
    VALUES (prod, '__test_unit__') RETURNING id INTO unit;

  -- Base reservation Jun1–Jun3 (inclusive).
  INSERT INTO public.rentals
    (customer_id, product_id, unit_id, start_date, end_date, rental_subtotal, total, booking_fee_amount, status)
    VALUES (cust, prod, unit, DATE '2026-06-01', DATE '2026-06-03', 200, 200, 60, 'reserved')
    RETURNING id INTO r1;

  -- A) next-day Jun4–Jun6 must be allowed.
  BEGIN
    INSERT INTO public.rentals
      (customer_id, product_id, unit_id, start_date, end_date, rental_subtotal, total, booking_fee_amount, status)
      VALUES (cust, prod, unit, DATE '2026-06-04', DATE '2026-06-06', 200, 200, 60, 'reserved');
    RAISE NOTICE 'PASS A: next-day booking allowed (Jun4-6 after Jun1-3)';
  EXCEPTION WHEN exclusion_violation THEN
    RAISE EXCEPTION 'FAIL A: next-day booking was blocked';
  END;

  -- B) same-day rebook starting Jun3 must be blocked.
  BEGIN
    INSERT INTO public.rentals
      (customer_id, product_id, unit_id, start_date, end_date, rental_subtotal, total, booking_fee_amount, status)
      VALUES (cust, prod, unit, DATE '2026-06-03', DATE '2026-06-05', 200, 200, 60, 'reserved');
    RAISE EXCEPTION 'FAIL B: same-day rebook (start Jun3) was allowed';
  EXCEPTION WHEN exclusion_violation THEN
    RAISE NOTICE 'PASS B: same-day rebook blocked';
  END;

  -- C) cancelled/expired rows must not block.
  UPDATE public.rentals SET status = 'cancelled' WHERE id = r1;
  BEGIN
    INSERT INTO public.rentals
      (customer_id, product_id, unit_id, start_date, end_date, rental_subtotal, total, booking_fee_amount, status)
      VALUES (cust, prod, unit, DATE '2026-06-02', DATE '2026-06-04', 200, 200, 60, 'reserved');
    RAISE NOTICE 'PASS C: cancelled reservation does not block overlap';
  EXCEPTION WHEN exclusion_violation THEN
    RAISE EXCEPTION 'FAIL C: cancelled reservation still blocks';
  END;

  -- D) illegal status transition pending_fee -> active must be rejected.
  INSERT INTO public.rentals
    (customer_id, product_id, unit_id, start_date, end_date, rental_subtotal, total, booking_fee_amount, status)
    VALUES (cust, prod, NULL, DATE '2026-07-01', DATE '2026-07-02', 200, 200, 60, 'pending_fee')
    RETURNING id INTO r_pf;
  BEGIN
    UPDATE public.rentals SET status = 'active' WHERE id = r_pf;
    RAISE EXCEPTION 'FAIL D: illegal transition pending_fee->active was allowed';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS D: illegal transition pending_fee->active rejected';
  END;

  -- E) config completeness: true after seed, false when a required value is zeroed.
  IF NOT public.config_is_complete() THEN
    RAISE EXCEPTION 'FAIL E1: config_is_complete() false after seed';
  END IF;
  RAISE NOTICE 'PASS E1: config_is_complete() true after seed';
  UPDATE public.config SET deposit_percent = 0 WHERE id;
  IF public.config_is_complete() THEN
    RAISE EXCEPTION 'FAIL E2: config_is_complete() true with deposit_percent=0';
  END IF;
  RAISE NOTICE 'PASS E2: config_is_complete() false when deposit_percent invalid';
END$$;

-- ---- RLS column-scoping (REV-029): authenticated role privilege checks ----
SET LOCAL ROLE authenticated;

DO $$
BEGIN
  -- license_status is NOT granted to authenticated → permission denied for column,
  -- regardless of row matching (planner-time privilege check).
  EXECUTE 'UPDATE public.customers SET license_status = ''approved'' WHERE false';
  RAISE EXCEPTION 'FAIL F: authenticated may UPDATE customers.license_status (column grant too broad)';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'PASS F: license_status UPDATE denied to authenticated (column-scoped)';
END$$;

DO $$
BEGIN
  -- loyalty_tier likewise admin-only.
  EXECUTE 'UPDATE public.customers SET loyalty_tier = ''gold'' WHERE false';
  RAISE EXCEPTION 'FAIL G: authenticated may UPDATE customers.loyalty_tier';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'PASS G: loyalty_tier UPDATE denied to authenticated';
END$$;

DO $$
BEGIN
  -- phone IS a granted safe column → no privilege error (0 rows under RLS is fine).
  EXECUTE 'UPDATE public.customers SET phone = phone WHERE false';
  RAISE NOTICE 'PASS H: phone UPDATE permitted at column level';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE EXCEPTION 'FAIL H: phone UPDATE denied (safe-column grant missing)';
END$$;

RESET ROLE;

ROLLBACK;
