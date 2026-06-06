-- ============================================================
-- Phase 01 · Migration 0003 — Availability exclusion engine (§2.5, F-004, REV-001)
-- Inclusive daterange + GiST exclude is the source of truth for double-booking
-- prevention. Inclusive bounds make "available next day" native (no buffer):
--   [Jun1,Jun3] and [Jun4,Jun6] coexist; a row starting Jun3 collides with
--   [Jun1,Jun3]; cancelled/expired rows never block.
-- Manual rollback: ALTER TABLE rentals DROP CONSTRAINT no_unit_overlap;
--                  ALTER TABLE rentals DROP COLUMN occupied;
-- ============================================================

ALTER TABLE rentals
  ADD COLUMN IF NOT EXISTS occupied daterange
  GENERATED ALWAYS AS (daterange(start_date, end_date, '[]')) STORED;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'no_unit_overlap'
  ) THEN
    ALTER TABLE rentals
      ADD CONSTRAINT no_unit_overlap
      EXCLUDE USING gist (unit_id WITH =, occupied WITH &&)
      WHERE (status NOT IN ('cancelled','expired'));
  END IF;
END$$;
