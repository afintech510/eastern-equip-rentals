# PHASE-01 PROGRESS — Schema & Auth Foundation

**Status:** ✅ COMPLETE (pending human review gate) · **Date:** 2026-06-06 · **Spec:** v2.1 (LOCKED)

> ⚠ This phase has a **human review gate** (schema/RLS errors cascade). SQL is authored,
> reviewed, and **applied + asserted against Postgres 15 in CI** (the `db` job). It has NOT yet
> been applied to the live Supabase project (no project connected from this machine).

## Files Created

| Path | Purpose |
|------|---------|
| `supabase/migrations/0001_init_types.sql` | `pgcrypto`+`btree_gist`; `rental_status` ENUM; `set_updated_at()` |
| `supabase/migrations/0002_tables.sql` | All §2.2 tables, exact columns/types/CHECKs/indexes/FKs; updated_at on units/license_uploads/rental_documents (§2.2.1); `message_log` idempotency unique index (REV-020) |
| `supabase/migrations/0003_exclusion_constraint.sql` | `occupied` generated inclusive daterange + `no_unit_overlap` GiST exclude with status predicate (§2.5) |
| `supabase/migrations/0004_functions_triggers.sql` | `is_admin()`; updated_at triggers; status transition trigger + release gate; `recompute_gate()`; `protect_customer_columns()` (REV-029); auth provisioning trigger + `ensure_customer()` + reconciliation |
| `supabase/migrations/0005_rls.sql` | RLS on all tables; **column-scoped `customers` UPDATE** (REVOKE + GRANT safe cols); `is_admin()`-backed admin policies; owner-scoped customer tables |
| `supabase/migrations/0006_config_and_storage.sql` | `config_is_complete()`/`assert_config_complete()` (REV-008); private buckets + Storage RLS (§7.3, REV-031) |
| `supabase/seed.sql` | Idempotent: config singleton (`deposit_percent=0.30`), fleet (dumpsters `percent_down`, rest `standard`) + units, towns, owner admin link |
| `supabase/tests/phase01_acceptance.sql` | Runnable assertions: exclusion (next-day/same-day/cancelled), illegal transition, config completeness, RLS column-scoping |
| `supabase/ci/00_bootstrap_stub.sql` | CI-only stubs for `auth`/`storage`/roles so migrations apply on vanilla PG15 |
| `web/src/lib/supabase/{server,middleware,client}.ts`, `web/src/middleware.ts` | SSR + browser Supabase clients; session-refresh middleware |
| `web/src/app/(auth)/{login,register,forgot-password,reset-password}/page.tsx` + `web/src/components/auth/*` | Auth screens on the Phase-00 theme |
| `web/src/app/auth/callback/route.ts`, `web/src/app/auth/signout/route.ts` | Code exchange (confirm/reset) + logout |
| `web/src/app/account/page.tsx` | Auth-gated landing; calls `ensure_customer()` backstop; logout |

## Files Modified
- `api/app/main.py` — config-completeness startup gate (REV-008) via `config_is_complete()` RPC; `/health` reports it.
- `.github/workflows/ci.yml` — added `db` job (PG15 service): bootstrap → migrations → seed×2 → acceptance.
- `web/src/components/layout/{Header,MobileNav}.tsx` — point nav at existing routes.

## Acceptance Criteria

| Criterion | Result | Evidence |
|-----------|--------|----------|
| Migrations run from empty DB; re-run safe | ✅ CI `db` job | `IF NOT EXISTS`/`OR REPLACE`/`DROP…IF EXISTS` throughout; CI applies in order |
| Seed loads (incl. dumpster `percent_down`); idempotent | ✅ CI | seed run **twice** in CI; NOT-EXISTS guards + `ON CONFLICT` |
| Config healthcheck fails on invalid, passes when seeded | ✅ CI (test E) | `config_is_complete()` true after seed, false when `deposit_percent=0` |
| Exclusion: next-day OK / same-day blocked / cancelled doesn't block | ✅ CI (tests A/B/C) | 3 assertions in `phase01_acceptance.sql` |
| **RLS escalation blocked** (license_status/loyalty_tier) | ✅ CI (tests F/G/H) | column-scoped GRANT → `UPDATE license_status`/`loyalty_tier` denied to `authenticated`; `phone` permitted |
| Illegal `rental_status` transition rejected | ✅ CI (test D) | `pending_fee→active` raises `check_violation` |
| Admin authority via `is_admin()`/`admin_users` | ✅ review | every admin policy uses `public.is_admin()` (SECURITY DEFINER, reads `admin_users`) |
| Register/login/reset/logout; one customers row; reconciliation none | ⚠ live-only | flows built + web build green; requires live Supabase Auth to exercise end-to-end |
| web/api build; lint clean | ✅ | `npm run lint`/`format:check`/`build` green; `ruff` + import smoke in CI |

## Decisions Made
- **Migration tool:** versioned SQL in `supabase/migrations/` (spec §2.3, sibling convention); applied via `psql`/CI.
- **Protected-column writes:** admin mutations of `customers.license_status`/`loyalty_tier`/`legal_hold` go through the **service-role backend** (auth.uid() NULL → trigger allows; column GRANT withholds these from `authenticated`). Admins-via-PostgREST-JWT are intentionally blocked at the column level — defense in depth matching §7.2 "never trust client."
- **`is_admin()` / all SECURITY DEFINER fns:** `SET search_path = ''` + fully schema-qualified (anti-hijack).
- **`recompute_gate()` sources:** `paid`=`booking_fee_paid_at IS NOT NULL`; `license_ok`=customer `license_status='approved'`; contract/waiver = a `rental_documents` row `completed`/`manual_override`.
- **Storage license path convention:** `licenses/{auth_user_id}/<file>` so owner RLS matches `auth.uid()`.

## Spec Ambiguities
- `// SPEC-AMBIGUITY:` `towns`/`town_pages` columns underspecified in §2.2 — chose a reasonable F-024 set (slug unique, distance, lat/lng, copy, active).
- `// SPEC-AMBIGUITY:` config completeness "nulled value" — columns are NOT NULL so nulling isn't reachable; the check instead fails on missing row / zero-where-invalid (test E zeroes `deposit_percent`).

## Live apply (2026-06-07) — DONE & verified
Applied to the live Supabase project `wibwvqbzgvgvzrmeyrxj` (PostgreSQL 17.6) via the Management
API (`scripts/apply_remote_sql.py`, reads PAT from `.env`):
- Migrations 0001–0006 applied; `seed.sql` run twice (idempotent).
- Verified live: 17/17 spec tables; RLS enabled on all 17; 12/12 functions; `no_unit_overlap`
  exclusion constraint present; `config_is_complete()` = true; 7 products (2 dumpster
  `percent_down`), 11 units, 8 towns, 3 private Storage buckets; `count_missing_customers()` = 0.
- **REV-029 proven live:** `authenticated` has `SELECT,UPDATE` on `customers.phone` but only
  `SELECT` on `license_status` — self-approval impossible.
- Auth config set: `site_url=http://localhost:3009`, `uri_allow_list` includes `/auth/callback`,
  signup enabled, email confirmation on (default).

## Blocked Items
- **Owner admin link:** `admin_users` has 0 rows until `adam@easternbuilding.supply` exists in
  `auth.users`. Create the owner (sign up via `/register` once the app runs, or Auth Admin API),
  then re-run `supabase/seed.sql` to link them as admin.
- **Doppler:** creds currently in local `.env`; mirror to Doppler for CI/prod before Phase 08.

## Warnings for Next Phase (02a — Catalog, Inventory & Availability)
- Availability is the GiST exclusion constraint (`rentals.occupied`); the reservation handler must use the **insert-retry** path (catch `exclusion_violation` 23P01, try next free unit, else `409 UNIT_UNAVAILABLE`) — REV-003. Units are **admin-only at RLS**; expose availability via API, never direct unit reads.
- `recompute_gate(rental_id uuid)` exists — call it after any license/document/payment change.
- Read pricing params from the `config` singleton (`SELECT … FROM config WHERE id`). It's public-readable.
- `current_customer_id()` helper maps `auth.uid()` → `customers.id` for owner-scoped queries.
- Status writes must respect the transition trigger; `ready_for_pickup→active` requires all four gate flags.
