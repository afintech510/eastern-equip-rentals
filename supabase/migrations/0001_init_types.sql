-- ============================================================
-- Phase 01 · Migration 0001 — Extensions, types, shared helpers
-- Spec §2.2.1, §2.5. Forward-only.
-- Manual rollback: DROP TYPE rental_status; DROP FUNCTION set_updated_at();
--                  (drop extensions only if nothing else uses them).
-- ============================================================

-- gen_random_uuid() is built into PG13+, but pgcrypto guarantees availability.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
-- Required for the GiST exclusion constraint mixing equality (unit_id) with
-- range overlap (occupied) — §2.5.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Rental lifecycle (REV-007). pending_fee → reserved → ready_for_pickup →
-- active → returned → closed; cancelled/expired reachable from pre-active only.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'rental_status') THEN
    CREATE TYPE rental_status AS ENUM (
      'pending_fee',
      'reserved',
      'ready_for_pickup',
      'active',
      'returned',
      'closed',
      'cancelled',
      'expired'
    );
  END IF;
END$$;

-- Shared BEFORE UPDATE trigger to maintain updated_at on every mutable table.
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
