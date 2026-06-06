-- ============================================================
-- CI-ONLY bootstrap — stubs the Supabase-managed objects that a vanilla
-- Postgres image lacks, so the Phase 01 migrations can be applied and tested
-- in CI. NOT a real migration; never run against Supabase (which provides
-- these natively). Faithful enough to exercise schema, constraints, triggers,
-- config check, and RLS column-scoping.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Supabase roles.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
  END IF;
END$$;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- ---- auth schema stub ----
CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE IF NOT EXISTS auth.users (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email              text UNIQUE,
  raw_user_meta_data jsonb DEFAULT '{}'::jsonb,
  created_at         timestamptz DEFAULT now()
);

-- auth.uid() resolves from the request GUC, like Supabase's GoTrue.
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;

-- ---- storage schema stub ----
CREATE SCHEMA IF NOT EXISTS storage;

CREATE TABLE IF NOT EXISTS storage.buckets (
  id     text PRIMARY KEY,
  name   text,
  public boolean DEFAULT false
);

CREATE TABLE IF NOT EXISTS storage.objects (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id text REFERENCES storage.buckets (id),
  name      text,
  owner     uuid
);

-- Returns the folder path array (Supabase semantics close enough for policy creation).
CREATE OR REPLACE FUNCTION storage.foldername(name text)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT string_to_array(name, '/');
$$;

GRANT USAGE ON SCHEMA storage TO anon, authenticated, service_role;
