-- ============================================================
-- Phase 01 · Seed (§2.4) — idempotent / re-runnable
-- config singleton (deposit_percent=0.30), owner admin, fleet (dumpsters =
-- percent_down, all else standard) + units, town list. Run after migrations:
--   psql "$SUPABASE_DB_URL" -f supabase/seed.sql
-- ============================================================

-- ---------- config singleton (§2.2 values) ----------
INSERT INTO public.config (
  id, sales_tax_rate, card_service_fee_pct, deposit_percent,
  booking_fee_first_day_pct, booking_fee_per_extra_day,
  delivery_base_fee, delivery_free_miles, delivery_per_mile, delivery_max_radius_miles,
  max_rental_days_default, deposit_hold_max_days, yard_hours_json,
  license_retention_months, contract_retention_years, photo_retention_years,
  reservation_hold_ttl_min
) VALUES (
  true, 0.08750, 0.03500, 0.30000,
  0.30000, 100.00,
  199.00, 10, 5.00, 40,
  30, 5,
  '{"mon":["07:00","17:00"],"tue":["07:00","17:00"],"wed":["07:00","17:00"],"thu":["07:00","17:00"],"fri":["07:00","17:00"],"sat":["07:00","15:00"],"sun":null}'::jsonb,
  12, 6, 6,
  15
)
ON CONFLICT (id) DO UPDATE SET
  sales_tax_rate            = EXCLUDED.sales_tax_rate,
  card_service_fee_pct      = EXCLUDED.card_service_fee_pct,
  deposit_percent           = EXCLUDED.deposit_percent,
  booking_fee_first_day_pct = EXCLUDED.booking_fee_first_day_pct,
  booking_fee_per_extra_day = EXCLUDED.booking_fee_per_extra_day,
  delivery_base_fee         = EXCLUDED.delivery_base_fee,
  delivery_free_miles       = EXCLUDED.delivery_free_miles,
  delivery_per_mile         = EXCLUDED.delivery_per_mile,
  delivery_max_radius_miles = EXCLUDED.delivery_max_radius_miles,
  max_rental_days_default   = EXCLUDED.max_rental_days_default,
  deposit_hold_max_days     = EXCLUDED.deposit_hold_max_days,
  yard_hours_json           = EXCLUDED.yard_hours_json,
  license_retention_months  = EXCLUDED.license_retention_months,
  contract_retention_years  = EXCLUDED.contract_retention_years,
  photo_retention_years     = EXCLUDED.photo_retention_years,
  reservation_hold_ttl_min  = EXCLUDED.reservation_hold_ttl_min;

-- ---------- products (idempotent by name) ----------
INSERT INTO public.products
  (name, category, description, daily_rate, booking_fee_mode, requires_towing_ack, max_rental_days, active)
SELECT v.name, v.category, v.description, v.daily_rate, v.booking_fee_mode, v.requires_towing_ack, v.max_rental_days, true
FROM (VALUES
  ('Skid Steer',        'earthmoving', 'Compact track loader for grading, digging, and material handling.', 350.00, 'standard',     true,  30),
  ('Mini Excavator',    'earthmoving', 'Tight-access digging and trenching.',                                 425.00, 'standard',     true,  30),
  ('Wood Chipper',      'landscaping', 'Tow-behind chipper for brush and limbs up to 6".',                    275.00, 'standard',     true,  30),
  ('Concrete Mixer',    'concrete',    'Towable concrete/mortar mixer.',                                       95.00,  'standard',     true,  30),
  ('Equipment Trailer', 'hauling',     'Heavy-duty equipment transport trailer.',                              120.00, 'standard',     true,  30),
  ('10-Yard Dumpster',  'dumpster',    'Roll-off dumpster, delivered and picked up.',                          0.00,   'percent_down', false, 30),
  ('20-Yard Dumpster',  'dumpster',    'Roll-off dumpster, delivered and picked up.',                          0.00,   'percent_down', false, 30)
) AS v(name, category, description, daily_rate, booking_fee_mode, requires_towing_ack, max_rental_days)
WHERE NOT EXISTS (SELECT 1 FROM public.products p WHERE p.name = v.name);

-- ---------- units (idempotent by label) ----------
INSERT INTO public.units (product_id, label, status)
SELECT p.id, u.label, 'available'
FROM (VALUES
  ('Skid Steer',        'Skid Steer #1'),
  ('Skid Steer',        'Skid Steer #2'),
  ('Skid Steer',        'Skid Steer #3'),
  ('Mini Excavator',    'Mini Excavator #1'),
  ('Wood Chipper',      'Wood Chipper #1'),
  ('Concrete Mixer',    'Concrete Mixer #1'),
  ('Equipment Trailer', 'Equipment Trailer #1'),
  ('Equipment Trailer', 'Equipment Trailer #2'),
  ('10-Yard Dumpster',  '10-Yard Dumpster #1'),
  ('10-Yard Dumpster',  '10-Yard Dumpster #2'),
  ('20-Yard Dumpster',  '20-Yard Dumpster #1')
) AS u(product_name, label)
JOIN public.products p ON p.name = u.product_name
WHERE NOT EXISTS (SELECT 1 FROM public.units x WHERE x.label = u.label);

-- ---------- towns (idempotent by slug) ----------
INSERT INTO public.towns (name, slug, active)
SELECT v.name, v.slug, true
FROM (VALUES
  ('Center Moriches', 'center-moriches'),
  ('Mastic',          'mastic'),
  ('Mastic Beach',    'mastic-beach'),
  ('East Moriches',   'east-moriches'),
  ('Manorville',      'manorville'),
  ('Eastport',        'eastport'),
  ('Shirley',         'shirley'),
  ('Moriches',        'moriches')
) AS v(name, slug)
WHERE NOT EXISTS (SELECT 1 FROM public.towns t WHERE t.slug = v.slug);

-- ---------- owner admin (idempotent; links once the owner auth user exists) ----------
-- The owner must exist in auth.users (sign up / invite) before this links them.
-- Re-run the seed after first signup if needed. Match case-insensitively since
-- GoTrue stores emails lowercased.
INSERT INTO public.admin_users (auth_user_id, role)
SELECT u.id, 'admin'
FROM auth.users u
WHERE lower(u.email) = lower('easternProRentals@gmail.com')
ON CONFLICT (auth_user_id) DO NOTHING;

-- ---------- completeness assertion (fails loudly if config is incomplete) ----------
SELECT public.assert_config_complete();
