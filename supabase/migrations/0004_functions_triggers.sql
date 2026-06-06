-- ============================================================
-- Phase 01 · Migration 0004 — Functions & triggers
-- is_admin() (§7.2), updated_at triggers (§2.2.1), rental status transition +
-- release gate (§2.2 / F-017 / REV-006), recompute_gate(), customers protected-
-- column enforcement (REV-029), and idempotent auth provisioning (§7.1/REV-021).
-- All SECURITY DEFINER functions pin `search_path = ''` and schema-qualify
-- everything (prevents search-path hijacking).
-- ============================================================

-- ---------- is_admin(): server-side admin authority (REV-013/V3-004) ----------
-- Reads admin_users, NOT a self-settable JWT claim. Backs every admin RLS policy.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE auth_user_id = (SELECT auth.uid())
      AND revoked_at IS NULL
  );
$$;

-- ---------- updated_at triggers on every mutable table (§2.2.1) ----------
DO $$
DECLARE
  t text;
  mutable_tables text[] := ARRAY[
    'customers','products','units','rentals','payments',
    'license_uploads','rental_documents','config','towns','town_pages'
  ];
BEGIN
  FOREACH t IN ARRAY mutable_tables LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_set_updated_at ON public.%I;', t);
    EXECUTE format(
      'CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.%I
         FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();', t);
  END LOOP;
END$$;

-- ---------- rental status state machine + release gate (REV-006, F-017) ----------
CREATE OR REPLACE FUNCTION public.enforce_rental_status_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;  -- non-status update; nothing to validate
  END IF;

  IF NOT (
    (OLD.status = 'pending_fee'      AND NEW.status IN ('reserved','cancelled','expired')) OR
    (OLD.status = 'reserved'         AND NEW.status IN ('ready_for_pickup','cancelled','expired')) OR
    (OLD.status = 'ready_for_pickup' AND NEW.status IN ('active','cancelled','expired')) OR
    (OLD.status = 'active'           AND NEW.status = 'returned') OR
    (OLD.status = 'returned'         AND NEW.status = 'closed')
  ) THEN
    RAISE EXCEPTION 'Illegal rental status transition: % -> %', OLD.status, NEW.status
      USING ERRCODE = 'check_violation';
  END IF;

  -- Handover gate (F-017): ready_for_pickup -> active requires all four flags.
  -- Enforced in the DB as well as the service layer (defense in depth).
  IF OLD.status = 'ready_for_pickup' AND NEW.status = 'active'
     AND NOT (NEW.paid AND NEW.license_ok AND NEW.contract_signed AND NEW.waiver_signed) THEN
    RAISE EXCEPTION
      'Release gate not satisfied: paid/license_ok/contract_signed/waiver_signed all required'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_rental_status_transition ON public.rentals;
CREATE TRIGGER trg_rental_status_transition
  BEFORE UPDATE OF status ON public.rentals
  FOR EACH ROW EXECUTE FUNCTION public.enforce_rental_status_transition();

-- ---------- recompute_gate(): denormalized gate flags can't drift (REV-006) ----------
-- Called from every mutation affecting a source (license decision, document
-- webhook/override, booking-fee capture/refund). Recomputes the four booleans
-- from authoritative source state.
CREATE OR REPLACE FUNCTION public.recompute_gate(p_rental_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.rentals r SET
    paid = (r.booking_fee_paid_at IS NOT NULL),
    license_ok = (
      SELECT c.license_status = 'approved'
      FROM public.customers c WHERE c.id = r.customer_id
    ),
    contract_signed = EXISTS (
      SELECT 1 FROM public.rental_documents d
      WHERE d.rental_id = r.id AND d.doc_type = 'contract'
        AND d.status IN ('completed','manual_override')
    ),
    waiver_signed = EXISTS (
      SELECT 1 FROM public.rental_documents d
      WHERE d.rental_id = r.id AND d.doc_type = 'waiver'
        AND d.status IN ('completed','manual_override')
    )
  WHERE r.id = p_rental_id;
END;
$$;

-- ---------- customers protected-column enforcement (REV-029, CRITICAL) ----------
-- A plain authenticated user must NOT self-approve their license or self-grant
-- loyalty. Service role (auth.uid() IS NULL) and admins pass; non-admins are
-- blocked from changing any protected column even when hitting PostgREST direct.
CREATE OR REPLACE FUNCTION public.protect_customer_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF (SELECT auth.uid()) IS NOT NULL AND NOT public.is_admin() THEN
    IF NEW.license_status IS DISTINCT FROM OLD.license_status
       OR NEW.loyalty_tier IS DISTINCT FROM OLD.loyalty_tier
       OR NEW.legal_hold   IS DISTINCT FROM OLD.legal_hold
       OR NEW.hold_reason  IS DISTINCT FROM OLD.hold_reason
       OR NEW.hold_set_by  IS DISTINCT FROM OLD.hold_set_by
       OR NEW.hold_set_at  IS DISTINCT FROM OLD.hold_set_at
       OR NEW.email        IS DISTINCT FROM OLD.email
       OR NEW.auth_user_id IS DISTINCT FROM OLD.auth_user_id THEN
      RAISE EXCEPTION 'Not authorized to modify protected customer columns'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_customer_columns ON public.customers;
CREATE TRIGGER trg_protect_customer_columns
  BEFORE UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.protect_customer_columns();

-- ---------- Idempotent auth provisioning (§7.1, REV-021) ----------
-- AFTER INSERT on auth.users → create the customers row ON CONFLICT DO NOTHING.
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  BEGIN
    INSERT INTO public.customers (auth_user_id, email, full_name)
    VALUES (
      NEW.id,
      NEW.email,
      COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email)
    )
    ON CONFLICT (auth_user_id) DO NOTHING;
  EXCEPTION WHEN unique_violation THEN
    -- email already belongs to another customer row; ensure_customer()/
    -- reconcile_missing_customers() resolve linkage out of band. Never block signup.
    NULL;
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- ---------- ensure_customer(): first-authenticated-request backstop (§7.1) ----------
-- App calls `SELECT public.ensure_customer();` on first authenticated request.
CREATE OR REPLACE FUNCTION public.ensure_customer()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_id  uuid;
BEGIN
  IF v_uid IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT id INTO v_id FROM public.customers WHERE auth_user_id = v_uid;
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  INSERT INTO public.customers (auth_user_id, email, full_name)
  SELECT u.id, u.email, COALESCE(u.raw_user_meta_data->>'full_name', u.email)
  FROM auth.users u
  WHERE u.id = v_uid
  ON CONFLICT (auth_user_id) DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM public.customers WHERE auth_user_id = v_uid;
  END IF;

  RETURN v_id;
END;
$$;

-- ---------- Reconciliation (REV-021) ----------
-- count_missing_customers() = 0 after a normal signup (acceptance check).
-- reconcile_missing_customers() backfills any orphaned auth users.
CREATE OR REPLACE FUNCTION public.count_missing_customers()
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT count(*)
  FROM auth.users u
  LEFT JOIN public.customers c ON c.auth_user_id = u.id
  WHERE c.id IS NULL;
$$;

CREATE OR REPLACE FUNCTION public.reconcile_missing_customers()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE n bigint;
BEGIN
  INSERT INTO public.customers (auth_user_id, email, full_name)
  SELECT u.id, u.email, COALESCE(u.raw_user_meta_data->>'full_name', u.email)
  FROM auth.users u
  LEFT JOIN public.customers c ON c.auth_user_id = u.id
  WHERE c.id IS NULL
  ON CONFLICT (auth_user_id) DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;
