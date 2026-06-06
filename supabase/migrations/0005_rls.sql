-- ============================================================
-- Phase 01 · Migration 0005 — Row-Level Security (§2.2, §7.2)
-- Customer-owned tables scoped to auth.uid(); units/payments/photos/etc.
-- admin-only; the CRITICAL customers UPDATE is column-scoped (REV-029):
-- GRANT UPDATE only on safe columns + the protect_customer_columns() trigger.
-- service_role bypasses RLS (Supabase) so the backend is unaffected.
-- ============================================================

-- Helper: the customer row id for the current auth user (avoids policy recursion).
CREATE OR REPLACE FUNCTION public.current_customer_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT id FROM public.customers WHERE auth_user_id = (SELECT auth.uid());
$$;

-- Enable RLS everywhere.
DO $$
DECLARE t text;
  all_tables text[] := ARRAY[
    'customers','products','units','product_rates','rentals','payments',
    'processed_webhook_events','license_uploads','rental_documents',
    'condition_photos','delivery_quotes','message_log','towns','town_pages',
    'config','audit_log','admin_users'
  ];
BEGIN
  FOREACH t IN ARRAY all_tables LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
  END LOOP;
END$$;

-- ============================================================
-- customers (REV-029 — privilege-escalation fix)
-- ============================================================
REVOKE ALL ON public.customers FROM anon, authenticated;
GRANT SELECT ON public.customers TO authenticated;
GRANT UPDATE (full_name, phone, transactional_sms, sms_marketing_opt_in, email_marketing_opt_in)
  ON public.customers TO authenticated;

DROP POLICY IF EXISTS customers_select_own ON public.customers;
CREATE POLICY customers_select_own ON public.customers
  FOR SELECT TO authenticated
  USING (auth_user_id = (SELECT auth.uid()) OR public.is_admin());

DROP POLICY IF EXISTS customers_update_own ON public.customers;
CREATE POLICY customers_update_own ON public.customers
  FOR UPDATE TO authenticated
  USING (auth_user_id = (SELECT auth.uid()))
  WITH CHECK (auth_user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS customers_admin_all ON public.customers;
CREATE POLICY customers_admin_all ON public.customers
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ============================================================
-- products — public SELECT of active rows; admin full
-- ============================================================
GRANT SELECT ON public.products TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.products TO authenticated;

DROP POLICY IF EXISTS products_public_read ON public.products;
CREATE POLICY products_public_read ON public.products
  FOR SELECT TO anon, authenticated
  USING (active = true OR public.is_admin());

DROP POLICY IF EXISTS products_admin_all ON public.products;
CREATE POLICY products_admin_all ON public.products
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ============================================================
-- Admin-only tables: units, product_rates, payments, condition_photos,
-- delivery_quotes, audit_log, admin_users, processed_webhook_events
-- (service_role bypasses RLS; admins pass via is_admin()).
-- ============================================================
DO $$
DECLARE t text;
  admin_only text[] := ARRAY[
    'units','product_rates','payments','condition_photos','delivery_quotes',
    'audit_log','admin_users','processed_webhook_events'
  ];
BEGIN
  FOREACH t IN ARRAY admin_only LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated;', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', t || '_admin_all', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated
         USING (public.is_admin()) WITH CHECK (public.is_admin());',
      t || '_admin_all', t);
  END LOOP;
END$$;

-- ============================================================
-- rentals — customer SELECT own; admin full (writes are service-role/admin)
-- ============================================================
GRANT SELECT ON public.rentals TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.rentals TO authenticated;

DROP POLICY IF EXISTS rentals_select_own ON public.rentals;
CREATE POLICY rentals_select_own ON public.rentals
  FOR SELECT TO authenticated
  USING (customer_id = public.current_customer_id() OR public.is_admin());

DROP POLICY IF EXISTS rentals_admin_all ON public.rentals;
CREATE POLICY rentals_admin_all ON public.rentals
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ============================================================
-- license_uploads — customer INSERT/SELECT own; admin full (review)
-- ============================================================
GRANT SELECT, INSERT ON public.license_uploads TO authenticated;
GRANT UPDATE, DELETE ON public.license_uploads TO authenticated;

DROP POLICY IF EXISTS license_select_own ON public.license_uploads;
CREATE POLICY license_select_own ON public.license_uploads
  FOR SELECT TO authenticated
  USING (customer_id = public.current_customer_id() OR public.is_admin());

DROP POLICY IF EXISTS license_insert_own ON public.license_uploads;
CREATE POLICY license_insert_own ON public.license_uploads
  FOR INSERT TO authenticated
  WITH CHECK (customer_id = public.current_customer_id());

DROP POLICY IF EXISTS license_admin_all ON public.license_uploads;
CREATE POLICY license_admin_all ON public.license_uploads
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ============================================================
-- rental_documents — customer SELECT own (via rental); admin full
-- ============================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rental_documents TO authenticated;

DROP POLICY IF EXISTS docs_select_own ON public.rental_documents;
CREATE POLICY docs_select_own ON public.rental_documents
  FOR SELECT TO authenticated
  USING (
    rental_id IN (SELECT id FROM public.rentals WHERE customer_id = public.current_customer_id())
    OR public.is_admin()
  );

DROP POLICY IF EXISTS docs_admin_all ON public.rental_documents;
CREATE POLICY docs_admin_all ON public.rental_documents
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ============================================================
-- message_log — customer SELECT own; admin full
-- ============================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON public.message_log TO authenticated;

DROP POLICY IF EXISTS msg_select_own ON public.message_log;
CREATE POLICY msg_select_own ON public.message_log
  FOR SELECT TO authenticated
  USING (customer_id = public.current_customer_id() OR public.is_admin());

DROP POLICY IF EXISTS msg_admin_all ON public.message_log;
CREATE POLICY msg_admin_all ON public.message_log
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ============================================================
-- towns / town_pages — public SELECT; admin full
-- ============================================================
GRANT SELECT ON public.towns, public.town_pages TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.towns, public.town_pages TO authenticated;

DROP POLICY IF EXISTS towns_public_read ON public.towns;
CREATE POLICY towns_public_read ON public.towns
  FOR SELECT TO anon, authenticated USING (active = true OR public.is_admin());
DROP POLICY IF EXISTS towns_admin_all ON public.towns;
CREATE POLICY towns_admin_all ON public.towns
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS town_pages_public_read ON public.town_pages;
CREATE POLICY town_pages_public_read ON public.town_pages
  FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS town_pages_admin_all ON public.town_pages;
CREATE POLICY town_pages_admin_all ON public.town_pages
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ============================================================
-- config — public read (non-secret pricing params); admin write
-- ============================================================
GRANT SELECT ON public.config TO anon, authenticated;
GRANT UPDATE ON public.config TO authenticated;

DROP POLICY IF EXISTS config_public_read ON public.config;
CREATE POLICY config_public_read ON public.config
  FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS config_admin_write ON public.config;
CREATE POLICY config_admin_write ON public.config
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
