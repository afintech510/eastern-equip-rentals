-- ============================================================
-- Phase 01 · Migration 0002 — Core tables (§2.2)
-- Columns/types/constraints/defaults/indexes/FKs match §2.2 exactly.
-- §2.2.1: controlled-value fields use CHECK (... IN (...)); every mutable
-- table carries updated_at (incl. units, license_uploads, rental_documents).
-- Manual rollback: DROP TABLE ... CASCADE (reverse dependency order).
-- ============================================================

-- ---------- customers (F-012, F-011, F-013, F-022, F-023) ----------
CREATE TABLE IF NOT EXISTS customers (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id           uuid UNIQUE REFERENCES auth.users (id) ON DELETE SET NULL,
  email                  text NOT NULL UNIQUE,
  full_name              text NOT NULL,
  phone                  text,
  loyalty_tier           text NOT NULL DEFAULT 'none'
                           CHECK (loyalty_tier IN ('none','bronze','silver','gold')),
  transactional_sms      boolean NOT NULL DEFAULT true,
  sms_marketing_opt_in   boolean NOT NULL DEFAULT false,
  email_marketing_opt_in boolean NOT NULL DEFAULT false,
  license_status         text NOT NULL DEFAULT 'none'
                           CHECK (license_status IN ('none','pending','approved','rejected')),
  legal_hold             boolean NOT NULL DEFAULT false,
  hold_reason            text,
  hold_set_by            uuid,
  hold_set_at            timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_customers_auth_user_id ON customers (auth_user_id);
CREATE INDEX IF NOT EXISTS idx_customers_email ON customers (email);
CREATE INDEX IF NOT EXISTS idx_customers_license_status ON customers (license_status);

-- ---------- products (F-001, F-002, F-028, M-002) ----------
CREATE TABLE IF NOT EXISTS products (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                text NOT NULL,
  category            text NOT NULL,
  description         text,
  photo_url           text,
  daily_rate          numeric(10,2) NOT NULL,
  booking_fee_mode    text NOT NULL DEFAULT 'standard'
                        CHECK (booking_fee_mode IN ('standard','percent_down')),
  requires_towing_ack boolean NOT NULL DEFAULT false,
  max_rental_days     int NOT NULL DEFAULT 30,
  active              boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_products_active ON products (active);
CREATE INDEX IF NOT EXISTS idx_products_category ON products (category);

-- ---------- units (F-002, F-004, F-029) ----------
-- updated_at added per §2.2.1 (units lacked it in v2).
CREATE TABLE IF NOT EXISTS units (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id    uuid NOT NULL REFERENCES products (id) ON DELETE CASCADE,
  label         text NOT NULL,
  serial_number text,
  status        text NOT NULL DEFAULT 'available'
                  CHECK (status IN ('available','maintenance','retired')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_units_product_id ON units (product_id);
CREATE INDEX IF NOT EXISTS idx_units_status ON units (status);

-- ---------- product_rates (F-010, L-003) ----------
CREATE TABLE IF NOT EXISTS product_rates (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products (id) ON DELETE CASCADE,
  min_days   int NOT NULL,
  rate_type  text NOT NULL DEFAULT 'percent_off'
               CHECK (rate_type IN ('percent_off','flat_daily','weekly')),
  value      numeric(10,2) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_product_rates_product_id ON product_rates (product_id);

-- ---------- rentals (F-006..F-029) ----------
CREATE TABLE IF NOT EXISTS rentals (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id          uuid NOT NULL REFERENCES customers (id) ON DELETE RESTRICT,
  product_id           uuid NOT NULL REFERENCES products (id) ON DELETE RESTRICT,
  unit_id              uuid REFERENCES units (id) ON DELETE SET NULL,
  start_date           date NOT NULL,
  end_date             date NOT NULL,
  fulfillment          text NOT NULL DEFAULT 'pickup'
                         CHECK (fulfillment IN ('pickup','delivery')),
  delivery_address     text,
  status               rental_status NOT NULL DEFAULT 'pending_fee',
  rental_subtotal      numeric(10,2) NOT NULL,
  discount_amount      numeric(10,2) NOT NULL DEFAULT 0,
  delivery_fee         numeric(10,2) NOT NULL DEFAULT 0,
  tax_amount           numeric(10,2) NOT NULL DEFAULT 0,
  total                numeric(10,2) NOT NULL,
  booking_fee_amount   numeric(10,2) NOT NULL,
  booking_fee_paid_at  timestamptz,
  payment_attempted_at timestamptz,
  balance_amount       numeric(10,2) NOT NULL DEFAULT 0,
  balance_paid_method  text CHECK (balance_paid_method IS NULL
                         OR balance_paid_method IN ('card','cash','other')),
  balance_paid_at      timestamptz,
  service_fee_total    numeric(10,2) NOT NULL DEFAULT 0,
  deposit_amount       numeric(10,2) NOT NULL DEFAULT 0,
  deposit_strategy     text CHECK (deposit_strategy IS NULL
                         OR deposit_strategy IN ('hold','charge')),
  towing_ack           boolean NOT NULL DEFAULT false,
  license_ok           boolean NOT NULL DEFAULT false,
  contract_signed      boolean NOT NULL DEFAULT false,
  waiver_signed        boolean NOT NULL DEFAULT false,
  paid                 boolean NOT NULL DEFAULT false,
  legal_hold           boolean NOT NULL DEFAULT false,
  hold_reason          text,
  hold_set_by          uuid,
  hold_set_at          timestamptz,
  released_at          timestamptz,
  returned_at          timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rentals_date_order CHECK (end_date >= start_date)
);
CREATE INDEX IF NOT EXISTS idx_rentals_unit_dates ON rentals (unit_id, start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_rentals_status ON rentals (status);
CREATE INDEX IF NOT EXISTS idx_rentals_customer_id ON rentals (customer_id);
CREATE INDEX IF NOT EXISTS idx_rentals_dates ON rentals (start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_rentals_legal_hold ON rentals (legal_hold) WHERE legal_hold;

-- ---------- payments (F-007, F-008, F-027) ----------
CREATE TABLE IF NOT EXISTS payments (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rental_id                   uuid NOT NULL REFERENCES rentals (id) ON DELETE CASCADE,
  stripe_booking_fee_intent_id text UNIQUE,
  stripe_balance_intent_id    text,
  stripe_deposit_intent_id    text,
  booking_fee_charged         numeric(10,2) NOT NULL DEFAULT 0,
  balance_charged             numeric(10,2),
  deposit_state               text NOT NULL DEFAULT 'none'
                                CHECK (deposit_state IN
                                  ('none','held','charged','captured','released','refunded')),
  deposit_captured_amount     numeric(10,2),
  deposit_refund_amount       numeric(10,2),
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_payments_rental_id ON payments (rental_id);

-- ---------- processed_webhook_events (REV-004) ----------
CREATE TABLE IF NOT EXISTS processed_webhook_events (
  provider    text NOT NULL,
  event_id    text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, event_id)
);

-- ---------- license_uploads (F-013, F-014, §13) ----------
-- updated_at added per §2.2.1.
CREATE TABLE IF NOT EXISTS license_uploads (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id   uuid NOT NULL REFERENCES customers (id) ON DELETE CASCADE,
  storage_path  text NOT NULL,
  status        text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','approved','rejected')),
  reviewed_by   uuid,
  reviewed_at   timestamptz,
  reject_reason text,
  purge_after   date,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_license_status ON license_uploads (status);
CREATE INDEX IF NOT EXISTS idx_license_purge ON license_uploads (purge_after);

-- ---------- rental_documents (F-015, F-016, F-017, H-004) ----------
-- updated_at added per §2.2.1.
CREATE TABLE IF NOT EXISTS rental_documents (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rental_id            uuid NOT NULL REFERENCES rentals (id) ON DELETE CASCADE,
  doc_type             text NOT NULL CHECK (doc_type IN ('contract','waiver')),
  signwell_document_id text,
  status               text NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending','sent','completed','manual_override')),
  signed_pdf_path      text,
  override_by          uuid,
  last_polled_at       timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_docs_rental_id ON rental_documents (rental_id);
CREATE INDEX IF NOT EXISTS idx_docs_status ON rental_documents (status);

-- ---------- condition_photos (F-020, M-004) — append-only ----------
CREATE TABLE IF NOT EXISTS condition_photos (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rental_id    uuid NOT NULL REFERENCES rentals (id) ON DELETE CASCADE,
  phase        text NOT NULL CHECK (phase IN ('pickup','return')),
  storage_path text NOT NULL,
  taken_at     timestamptz NOT NULL DEFAULT now(),
  uploaded_by  uuid NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_photos_rental_id ON condition_photos (rental_id);

-- ---------- delivery_quotes (F-009, M-006) ----------
CREATE TABLE IF NOT EXISTS delivery_quotes (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rental_id      uuid REFERENCES rentals (id) ON DELETE SET NULL,
  address        text NOT NULL,
  distance_miles numeric(6,2) NOT NULL,
  quoted_fee     numeric(10,2) NOT NULL,
  in_radius      boolean NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- ---------- message_log (F-021, F-022, F-023) — append-only ----------
-- Unique guard (rental_id, template, channel) for notification idempotency
-- (REV-020). rental_id may be NULL (account-level messages) — those are not
-- de-duped by this guard.
CREATE TABLE IF NOT EXISTS message_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers (id) ON DELETE CASCADE,
  rental_id   uuid REFERENCES rentals (id) ON DELETE SET NULL,
  channel     text NOT NULL CHECK (channel IN ('email','sms')),
  template    text NOT NULL,
  status      text NOT NULL CHECK (status IN ('sent','failed','delivered')),
  provider_id text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_msg_customer_id ON message_log (customer_id);
CREATE INDEX IF NOT EXISTS idx_msg_rental_id ON message_log (rental_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_msg_idempotency
  ON message_log (rental_id, template, channel)
  WHERE rental_id IS NOT NULL;

-- ---------- towns / town_pages (F-024, M-003, L-001) ----------
-- SPEC-AMBIGUITY: §2.2 specifies towns loosely; columns chosen to satisfy F-024.
CREATE TABLE IF NOT EXISTS towns (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                     text NOT NULL,
  slug                     text NOT NULL UNIQUE,
  distance_from_yard_miles numeric(6,2),
  lat                      numeric(9,6),
  lng                      numeric(9,6),
  intro_copy               text,
  active                   boolean NOT NULL DEFAULT true,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS town_pages (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  town_id          uuid NOT NULL REFERENCES towns (id) ON DELETE CASCADE,
  slug             text NOT NULL UNIQUE,
  title            text NOT NULL,
  meta_description text,
  schema_json      jsonb,
  hero_copy        text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- ---------- config (singleton, REV-008) ----------
-- id boolean PK DEFAULT true CHECK (id) guarantees exactly one row.
-- All operational columns NOT NULL (fail-closed).
CREATE TABLE IF NOT EXISTS config (
  id                        boolean PRIMARY KEY DEFAULT true CHECK (id),
  sales_tax_rate            numeric(6,5) NOT NULL,
  card_service_fee_pct      numeric(6,5) NOT NULL,
  deposit_percent           numeric(6,5) NOT NULL,
  booking_fee_first_day_pct numeric(6,5) NOT NULL,
  booking_fee_per_extra_day numeric(10,2) NOT NULL,
  delivery_base_fee         numeric(10,2) NOT NULL,
  delivery_free_miles       int NOT NULL,
  delivery_per_mile         numeric(10,2) NOT NULL,
  delivery_max_radius_miles int NOT NULL,
  max_rental_days_default   int NOT NULL,
  deposit_hold_max_days     int NOT NULL,
  yard_hours_json           jsonb NOT NULL,
  license_retention_months  int NOT NULL,
  contract_retention_years  int NOT NULL,
  photo_retention_years     int NOT NULL,
  reservation_hold_ttl_min  int NOT NULL,
  updated_at                timestamptz NOT NULL DEFAULT now()
);

-- ---------- audit_log (F-026, C-002, §13) — append-only ----------
CREATE TABLE IF NOT EXISTS audit_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id    uuid,
  action      text NOT NULL,
  entity_type text NOT NULL,
  entity_id   uuid,
  detail_json jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log (entity_type, entity_id);

-- ---------- admin_users (REV-013 / V3-004) ----------
CREATE TABLE IF NOT EXISTS admin_users (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id uuid NOT NULL UNIQUE REFERENCES auth.users (id) ON DELETE CASCADE,
  role         text NOT NULL DEFAULT 'admin' CHECK (role IN ('admin')),
  granted_by   uuid,
  granted_at   timestamptz NOT NULL DEFAULT now(),
  revoked_at   timestamptz
);
CREATE INDEX IF NOT EXISTS idx_admin_users_active
  ON admin_users (auth_user_id) WHERE revoked_at IS NULL;
