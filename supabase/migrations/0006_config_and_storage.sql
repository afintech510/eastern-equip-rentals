-- ============================================================
-- Phase 01 · Migration 0006 — Config completeness + Storage RLS
-- config_is_complete()/assert_config_complete() back the startup healthcheck
-- (REV-008) — production boot is refused if the singleton is missing or any
-- required value is zero/invalid. Storage policies enforce §7.3 (REV-031).
-- ============================================================

-- ---------- Config completeness (REV-008) ----------
CREATE OR REPLACE FUNCTION public.config_is_complete()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.config c
    WHERE c.id = true
      AND c.sales_tax_rate            > 0
      AND c.card_service_fee_pct      >= 0
      AND c.deposit_percent           > 0
      AND c.booking_fee_first_day_pct > 0
      AND c.booking_fee_per_extra_day > 0
      AND c.delivery_base_fee         > 0
      AND c.delivery_free_miles       >= 0
      AND c.delivery_per_mile         > 0
      AND c.delivery_max_radius_miles > 0
      AND c.max_rental_days_default   > 0
      AND c.deposit_hold_max_days     > 0
      AND c.yard_hours_json IS NOT NULL
      AND c.license_retention_months  > 0
      AND c.contract_retention_years  > 0
      AND c.photo_retention_years     > 0
      AND c.reservation_hold_ttl_min  > 0
  );
$$;

CREATE OR REPLACE FUNCTION public.assert_config_complete()
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.config_is_complete() THEN
    RAISE EXCEPTION
      'Config completeness check failed: config singleton missing or has invalid/zero required values';
  END IF;
END;
$$;

-- ---------- Storage buckets (private) ----------
INSERT INTO storage.buckets (id, name, public)
VALUES
  ('licenses',         'licenses',         false),
  ('condition-photos', 'condition-photos', false),
  ('signed-documents', 'signed-documents', false)
ON CONFLICT (id) DO NOTHING;

-- ---------- Storage RLS (§7.3, REV-031) ----------
-- licenses: object path is `{auth_user_id}/<file>`. Owner reads/inserts own;
-- admins full. Customers receive 300s signed URLs minted server-side, never
-- long-lived links (§7.3).
DROP POLICY IF EXISTS licenses_owner_read ON storage.objects;
CREATE POLICY licenses_owner_read ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'licenses'
    AND ((storage.foldername(name))[1] = (SELECT auth.uid())::text OR public.is_admin())
  );

DROP POLICY IF EXISTS licenses_owner_insert ON storage.objects;
CREATE POLICY licenses_owner_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'licenses'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  );

DROP POLICY IF EXISTS licenses_admin_all ON storage.objects;
CREATE POLICY licenses_admin_all ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'licenses' AND public.is_admin())
  WITH CHECK (bucket_id = 'licenses' AND public.is_admin());

-- condition-photos: admin only (M-004).
DROP POLICY IF EXISTS photos_admin_all ON storage.objects;
CREATE POLICY photos_admin_all ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'condition-photos' AND public.is_admin())
  WITH CHECK (bucket_id = 'condition-photos' AND public.is_admin());

-- signed-documents: admin only; customers view via auth-gated server endpoint
-- that mints a fresh 300s signed URL (§7.3).
DROP POLICY IF EXISTS signed_docs_admin_all ON storage.objects;
CREATE POLICY signed_docs_admin_all ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'signed-documents' AND public.is_admin())
  WITH CHECK (bucket_id = 'signed-documents' AND public.is_admin());
