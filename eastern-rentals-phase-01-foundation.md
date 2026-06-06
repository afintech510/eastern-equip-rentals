# Phase 01: Schema & Auth Foundation
**Project:** Eastern Rentals
**Spec:** `eastern-rentals-spec.md`
**Build Plan:** `eastern-rentals-buildplan.md`
**Prerequisites:** Phase 00
**Implements:** F-002, F-012, F-030 (schema); foundation for all later features
**Recommended:** `claude --max-turns 75`

---

## 1. Context

You are executing **Phase 01: Schema & Auth Foundation** of the Eastern Rentals build.

**Your scope is strictly this phase.** Build the complete database schema, constraints, RLS, the availability exclusion constraint, the config singleton, seed data, and Supabase Auth with provisioning. **Do NOT** build feature endpoints, the quote/reservation flow, payments, SignWell, or UI pages — those are Phases 02a+. Migrations and auth only.

**Tech Stack (§1.2):** Supabase/PostgreSQL, Supabase Auth, FastAPI; Next.js for the auth UI surface only (login/register/reset).
**Working Directory:** project root from Phase 00.
**Spec File:** `eastern-rentals-spec.md` — READ FIRST: **§2 (all — ERD, every table, §2.2.1 constraints, §2.4 seed, §2.5 exclusion engine), §7 (all — auth, RLS, storage), §3.1 (API conventions).**

### What Already Exists (Phase 00)
- Dockerized monorepo (web Next.js, api FastAPI, redis); Supabase project wired via Doppler env.
- Industrial theme tokens + component layer + app shell (§4.5). Reuse `input-ind`, `btn-*`, `card-ind` for auth screens.
- `GET /health`. No tables, no auth yet.

### What You're Building
Every table in §2.2 with exact columns/types/constraints/indexes; ENUM/CHECK per §2.2.1; `updated_at` triggers; the inclusive-`daterange` exclusion constraint (§2.5); RLS for every table incl. the **column-scoped `customers`** policy and the `is_admin()` helper; the `config` singleton + completeness healthcheck; the `rental_status` ENUM + transition trigger + `recompute_gate()`; seed data (§2.4); and Supabase Auth (register/login/reset/logout) with **idempotent `customers` provisioning**.

---

## 2. Objective & Deliverables

### Objective
After this phase, the data model supports every Eastern Rentals feature, the availability constraint enforces "next-day" booking natively, a customer **cannot** escalate their own privileges, admin authority is server-side, the app refuses to boot with incomplete config, and users can register/log in/reset/log out.

### Deliverables
1. Migrations creating all §2.2 tables: `customers`, `products`, `units`, `product_rates`, `rentals`, `payments`, `rental_documents`, `license_uploads`, `condition_photos`, `message_log`, `config`, `audit_log`, `admin_users`, `processed_webhook_events`, `delivery_quotes` (and any others in §2.2) — §2.2
2. All indexes, FKs (match §2.1 ERD), ENUM types + CHECK constraints (§2.2.1), `updated_at` triggers on every mutable table — §2.2/§2.2.1
3. The `occupied daterange` generated column + `btree_gist` `no_unit_overlap` exclusion constraint with status predicate — §2.5
4. `rental_status` ENUM + BEFORE UPDATE transition trigger + `recompute_gate(rental_id)` — §2.2
5. RLS policies for every table; **column-scoped `customers` UPDATE** + protected-column trigger; `is_admin()` SECURITY DEFINER helper backing all admin policies — §2.2/§7.2
6. `config` singleton (`CHECK(id)`), NOT-NULL with the §2.2 values (incl. `deposit_percent=0.30000`, `sales_tax_rate=0.08750`, delivery params, yard hours, retention), + a startup completeness healthcheck — §2.2
7. Seed data §2.4 (admin into `admin_users`; fleet incl. **Dumpsters category w/ `booking_fee_mode='percent_down'`**, others `standard`; town list) — §2.4
8. Supabase Auth flows + idempotent provisioning trigger on `auth.users` + `ensure_customer` backstop + reconciliation query — §7.1
9. Auth UI (register/login/reset/logout) on the Phase-00 theme — §7.1, §4.5
10. `PHASE-01-PROGRESS.md`

---

## 3. Implementation Instructions

### Task 1: Core tables + types + constraints
**Spec Reference:** §2.2, §2.2.1 · **Creates:** migrations
Create every table in §2.2 with columns/types/defaults/constraints **exactly** as written. Apply §2.2.1: ENUM or `CHECK (... IN (...))` on every controlled-value field (statuses, `deposit_state`, `loyalty_tier`, `license_status`, `balance_paid_method`, `fulfillment`, `booking_fee_mode`, `doc_type`, `phase`, `channel`, etc.), and `updated_at timestamptz NOT NULL DEFAULT now()` + a shared `BEFORE UPDATE` trigger on every mutable table (explicitly incl. `license_uploads`, `rental_documents`, `units`). Add all indexes and FKs; verify FKs match the §2.1 ERD.
Note: `rentals` includes the money snapshot columns, the gate booleans, `payment_attempted_at`, the deposit fields, and the `legal_hold/hold_*` columns; `customers` also carries `legal_hold/hold_*` (§2.2).

### Task 2: Availability exclusion engine
**Spec Reference:** §2.5 · **Creates:** migration
`CREATE EXTENSION IF NOT EXISTS btree_gist;` add the generated `occupied daterange ... daterange(start_date,end_date,'[]')` column and the `no_unit_overlap EXCLUDE USING gist (unit_id WITH =, occupied WITH &&) WHERE (status NOT IN ('cancelled','expired'))` constraint exactly as in §2.5.
**Verify:** `[Jun1,Jun3]` and `[Jun4,Jun6]` coexist (next-day OK); a row starting Jun3 conflicts with `[Jun1,Jun3]` (no same-day rebook); `cancelled`/`expired` rows don't block.

### Task 3: Status state machine + gate
**Spec Reference:** §2.2 · **Creates:** migration, functions
`rental_status` ENUM (`pending_fee→reserved→ready_for_pickup→active→returned→closed`; `cancelled`/`expired` pre-`active` only). BEFORE UPDATE trigger rejecting illegal transitions. `recompute_gate(rental_id)` recomputing the four gate booleans from source state. (Endpoints that call these come later — define the DB objects now.)

### Task 4: RLS + admin authority (**CRITICAL**)
**Spec Reference:** §2.2, §7.2 · **Creates:** policies, `is_admin()`
**CAUTION — REV-029 (was CRITICAL):** the `customers` UPDATE policy must be **column-scoped** — grant UPDATE only on the safe columns (`full_name`, `phone`, `transactional_sms`, `sms_marketing_opt_in`, `email_marketing_opt_in`) to `authenticated`, and add a `BEFORE UPDATE` trigger that rejects non-admin changes to `license_status` and `loyalty_tier`. A customer hitting PostgREST directly must NOT be able to self-approve their license or self-upgrade loyalty.
**CAUTION — V3-004/REV-013:** admin access uses the `is_admin()` SECURITY DEFINER helper reading `admin_users` (not a self-settable JWT claim). Every "admin full access" policy uses `is_admin()`. Apply per-table RLS exactly per §2.2/§7.2 (customer-owned tables scoped to `auth.uid()`; payments/units/photos/license admin-only or owner-scoped per spec).

### Task 5: Config singleton + completeness healthcheck
**Spec Reference:** §2.2 · **Creates:** migration, healthcheck
`config` with `id boolean PRIMARY KEY DEFAULT true CHECK (id)`, all columns NOT NULL with the §2.2 values. Add a startup/health assertion that fails (blocks prod boot) if any required value is null or invalid-zero.

### Task 6: Seed data
**Spec Reference:** §2.4 · **Creates:** seed script
Seed the admin into `admin_users`; `config` row with §2.2 values (`deposit_percent=0.30`); categories incl. **Dumpsters (`percent_down`)**, others `standard`; fleet (3 skid steers, chipper, mixer, trailer(s), dumpsters) + units; town list. Seed must be idempotent/re-runnable.

### Task 7: Auth + provisioning
**Spec Reference:** §7.1 · **Creates:** auth UI + provisioning trigger
Supabase Auth register/login/password-reset/logout. **Idempotent provisioning:** `AFTER INSERT` trigger on `auth.users` inserting the `customers` row `ON CONFLICT DO NOTHING`; an `ensure_customer` backstop on first authenticated request; a reconciliation query for auth users lacking a `customers` row. Auth screens use the Phase-00 theme (`input-ind`, `btn-primary`).

**Task ordering:** 1 → 2 → 3 → 4 → 5 → 6 → 7. Schema before constraints before RLS before seed before auth.

---

## 4. Acceptance Criteria

### Automated
- [ ] Migrations run cleanly from empty DB; re-run is safe
- [ ] Seed loads without errors (incl. dumpster `percent_down`)
- [ ] App/api build; lint clean
- [ ] Config completeness healthcheck **fails** when a required `config` value is nulled (test it), passes when seeded

### Functional / Data integrity
- [ ] Every §2.2 table exists with exact columns/types/constraints/indexes; FKs match §2.1 ERD
- [ ] Controlled-value fields reject out-of-set values (ENUM/CHECK); `updated_at` auto-updates on UPDATE
- [ ] Exclusion constraint: next-day booking allowed; same-day rebook blocked; cancelled/expired don't block (write the 3 SQL assertions)
- [ ] **RLS escalation blocked:** as a normal authenticated user via PostgREST, `UPDATE customers SET license_status='approved'` and `SET loyalty_tier='gold'` both **fail**; updating `phone` succeeds
- [ ] Admin policies resolve via `is_admin()`/`admin_users`; a non-admin cannot read payments/other customers' rows
- [ ] `rental_status` illegal transition (e.g., `pending_fee→active`) is rejected by the trigger
- [ ] Register/login/reset/logout work; registering creates exactly one `customers` row (idempotent); reconciliation query returns none after a normal signup

---

## 5. Constraints

### Hard (violation = phase failure)
- Column names, types, constraints, indexes MUST match §2.2 **exactly**.
- The exclusion constraint, RLS column-scoping, `is_admin()`, and config singleton MUST match §2.2/§2.5/§7.2 exactly — these carry CRITICAL findings.
- **Do NOT** build feature endpoints, quote/reservation/payment logic, SignWell, comms, or non-auth UI.
- No hardcoded credentials; admin comes from `admin_users` seed.

### Soft (document deviations)
- Use the migration tooling chosen in Phase 00; keep migrations reversible.
- Reuse Phase-00 theme components for auth screens.
- The Stripe-cents helper, money formula, etc. are Phase 02b — don't build them here.
- Mark `// SPEC-AMBIGUITY:` / `// BLOCKED:` as needed.

---

## 6. Completion Protocol

Provide: **Files Created**, **Files Modified**, **Acceptance Criteria Results** (table — include the RLS-escalation and exclusion-constraint test evidence explicitly), **Spec Ambiguities**, **Blocked Items**, **Decisions Made** (migration tool, trigger naming, `is_admin()` implementation), and **Warnings for Next Phase** (e.g., table/relationship notes 02a needs, the `recompute_gate` signature, how to read `config`).

---

## 7. Execution & Orchestration

**Run:** `claude --max-turns 75` (plan for 1 `--continue`).
**Plan first:** read §2 (all), §7 (all), §3.1 → migrations → constraints → RLS → config → seed → auth.
**Resumption (--continue):** re-read this prompt; inspect existing migrations + `PHASE-01-PROGRESS.md`; resume at the first incomplete task; never drop/recreate already-applied tables unless a migration explicitly does so.
**Decision authority:** spec defines → follow exactly (this phase is mostly exact); silent → `// SPEC-AMBIGUITY`; contradictory → `// ESCALATE` + skip.
**Progress:** update `PHASE-01-PROGRESS.md` after each task.
**Reminder:** this is the phase whose errors cascade — bias toward exactness over cleverness, and prove the RLS-escalation and exclusion-constraint criteria with explicit checks in your report.
