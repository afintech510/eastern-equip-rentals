-- ============================================================
-- Phase 03 part 2 · Migration 0007 — save-card support
-- A Stripe Customer per renter so the booking-fee card can be saved
-- (setup_future_usage) and re-charged off-session at handover (balance +
-- deposit hold/charge, V3-003).
-- ============================================================
ALTER TABLE customers ADD COLUMN IF NOT EXISTS stripe_customer_id text;
