-- ============================================================
-- Migration 0009 — Public product-photos bucket (catalog imagery)
-- Equipment catalog photos are public marketing assets (unlike the private
-- licenses / condition-photos / signed-documents buckets). Admins upload from
-- the inventory manager; anyone can read so <img src> works without signed URLs.
-- Manual rollback:  DELETE FROM storage.buckets WHERE id = 'product-photos';
-- ============================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('product-photos', 'product-photos', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Public read (catalog imagery is not sensitive).
DROP POLICY IF EXISTS product_photos_public_read ON storage.objects;
CREATE POLICY product_photos_public_read ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'product-photos');

-- Admin-only write (insert/update/delete).
DROP POLICY IF EXISTS product_photos_admin_write ON storage.objects;
CREATE POLICY product_photos_admin_write ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'product-photos' AND public.is_admin())
  WITH CHECK (bucket_id = 'product-photos' AND public.is_admin());
