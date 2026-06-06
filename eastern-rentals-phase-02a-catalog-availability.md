# Phase 02a: Catalog, Inventory & Availability
**Project:** Eastern Rentals
**Spec:** `eastern-rentals-spec.md`
**Build Plan:** `eastern-rentals-buildplan.md`
**Prerequisites:** Phase 01
**Implements:** F-001, F-002, F-003, F-004, F-005, F-026
**Recommended:** `claude --max-turns 75`

---

## 1. Context

You are executing **Phase 02a: Catalog, Inventory & Availability** of the Eastern Rentals build.

**Your scope is strictly this phase.** Build the public catalog, product detail, the day-level availability calendar, the availability read service, and admin inventory CRUD. **Do NOT** build the reservation write path, the quote/pricing engine, payments, or checkout — those are Phase 02b. You produce browsing + availability + admin inventory management, nothing that takes money.

**Tech Stack (§1.2):** Next.js (App Router) + TS + Tailwind (industrial theme §4.5); FastAPI; Supabase/Postgres.
**Working Directory:** project root.
**Spec File:** `eastern-rentals-spec.md` — READ FIRST: **§2.5 (availability/conflict engine), §3.2 (catalog/availability/calendar endpoints), §4.2 (components), §4.5 (theme), §2.2 (products/units/product_rates).**

### What Already Exists
- **Phase 00:** Dockerized monorepo, industrial theme tokens + component layer + app shell (gear header). Reuse `card-ind`, `btn-*`, `calendar-grid`/`cal-day`, `input-ind`.
- **Phase 01:** full schema; the `no_unit_overlap` inclusive-`daterange` exclusion constraint (§2.5); `rental_status` ENUM + gate; RLS (incl. `is_admin()`); `config` singleton (read `delivery_*`, `max_rental_days_default`, etc.); seed (fleet incl. **Dumpsters `percent_down`**, others `standard`); Auth.

### What You're Building
Public catalog + product detail, a day-level availability calendar that reflects real reservations under the **next-day** model, a server-side availability read service, and admin CRUD for products/units/rates. The availability mechanism's DB guarantee (the exclusion constraint) gets a concurrency test here; the reservation *endpoint* concurrency test is Phase 02b.

## Skills Reference (read before building UI)
- `view /mnt/skills/public/frontend-design/SKILL.md`, then spec **§4.5** (authoritative tokens/components). All catalog/detail/calendar UI uses the industrial theme; the calendar must meet the §4.2/§4.5 a11y baseline (keyboard grid, aria).

---

## 2. Objective & Deliverables

### Objective
After this phase, a visitor can browse the active fleet, open a product, and see accurate day-level availability (a unit returned on its end date is bookable the next calendar day; no same-day rebook). An admin can manage products, units, and rates. No money moves and nothing is reserved yet.

### Deliverables
1. Catalog page + category filters (active products only) — F-001, §3.2, §4.5
2. Product detail page (specs, rate, photos) — F-001, §4.5
3. Availability read service + `GET /products/{id}/availability` and `GET /products/{id}/calendar?month=` — F-003/F-004, §2.5, §3.2
4. `AvailabilityCalendar` component with `cal-day` states (available/booked/selected/in-range/past) + keyboard/aria — F-003, §4.5, §4.2
5. Admin inventory CRUD: products, units, rates (`is_admin()` gated) — F-026, §3.2
6. DB-level concurrency test proving the exclusion constraint (concurrent inserts on the same unit/overlap → exactly one succeeds) — F-004, §2.5
7. `PHASE-02a-PROGRESS.md`

---

## 3. Implementation Instructions

### Task 1: Availability read service
**Spec Reference:** §2.5, §3.2 · **Creates:** availability service + GET endpoints
Compute availability from `rentals` using the same semantics as the `no_unit_overlap` constraint: a product is available for `[start,end]` if ≥1 unit has no overlapping non-`cancelled`/`expired` rental (inclusive bounds → next-day). Expose `units_free`. `GET /products/{id}/availability?start=&end=` → `{available, units_free}`; `GET /products/{id}/calendar?month=` → day map for the calendar. Respect `config.max_rental_days_default`.
Key notes:
- Read-only here — no INSERT/lock. The write path (insert-retry) is Phase 02b.
- "Next-day": a unit returned on `end_date` is free `end_date + 1`. Mirror the inclusive-range logic exactly so the calendar never disagrees with the constraint.

### Task 2: Catalog + detail (F-001)
**Spec Reference:** §3.2, §4.2, §4.5 · **Creates:** catalog + detail pages, public product endpoints
Catalog lists active products by category with photo/rate/specs; category filters; hides inactive. Detail page shows specs, rate, photos, and embeds the availability calendar. Industrial theme; responsive 375/768/1440. Empty state (no active products) per §4.5 voice.

### Task 3: AvailabilityCalendar (F-003)
**Spec Reference:** §4.5, §4.2 · **Creates:** `AvailabilityCalendar` component
7-col grid on black gridlines; `cal-day` states per §4.5 (booked = light hazard stripes/not-allowed; selected-start/end; in-range; past = grey). **Keyboard-navigable grid + aria** (date-range announcements) per §4.2. Selecting a range is allowed but does NOT reserve (reservation is 02b) — wire the "select dates" interaction and surface the chosen range; the reserve action is stubbed/disabled with a note pointing to 02b.

### Task 4: Admin inventory CRUD (F-026)
**Spec Reference:** §3.2 · **Creates:** admin product/unit/rate endpoints + admin UI
CRUD for products (incl. `booking_fee_mode`, `category`, `daily_rate`, `requires_towing_ack`, `max_rental_days`, `active`), units, and `product_rates`. `is_admin()`-gated (server re-check on every `/admin/*`). A product cannot be set `active=true` unless `config.deposit_percent` is set (it is, from Phase 01 seed) — enforce/verify.

### Task 5: Concurrency proof (F-004, DB level)
**Spec Reference:** §2.5 · **Creates:** concurrency test
Write a test that fires N concurrent INSERTs of overlapping rentals on the **same** unit and asserts exactly one succeeds (the others raise the exclusion violation). Also assert two **different** free units both succeed. This proves the DB guarantee that 02b's reservation endpoint will rely on.

**Task ordering:** 1 → 2/3 → 4 → 5.

---

## 4. Acceptance Criteria

### Automated
- [ ] Build + lint clean; migrations unchanged (this phase adds no schema)
- [ ] Concurrency test: concurrent overlapping inserts on one unit → exactly one succeeds; two different free units → both succeed (F-004)

### Functional
- [ ] Catalog shows only `active` products; filters work; inactive hidden (F-001)
- [ ] Detail shows specs/rate/photos + calendar
- [ ] `GET availability` and `GET calendar` return correct free/blocked days; a unit returned on `end_date` shows bookable `end_date+1`, blocked same-day (F-003/F-005)
- [ ] Calendar never shows a day available that the exclusion constraint would reject (read matches write rule)
- [ ] Admin CRUD works and is `is_admin()`-gated (401/403 without admin); non-admin cannot mutate inventory (F-026)

### Visual / a11y
- [ ] Catalog/detail/calendar render on the industrial theme at 375/768/1440
- [ ] Calendar is keyboard-operable with range announcements; empty states present

---

## 5. Constraints

### Hard
- Availability read semantics MUST mirror the §2.5 exclusion constraint exactly (no drift between calendar and constraint).
- Endpoint shapes match §3.2; theme matches §4.5; admin gated via `is_admin()`.
- **Do NOT** implement reservation create, pricing/quote, Stripe, or checkout — Phase 02b. The calendar's reserve action is a stub.

### Soft
- Reuse Phase-00 components and Phase-01 services; document new patterns.
- Mark `// SPEC-AMBIGUITY:` / `// BLOCKED:` as needed.

---

## 6. Completion Protocol

Provide **Files Created/Modified**, **Acceptance Criteria Results** (incl. concurrency-test evidence and a calendar-vs-constraint agreement check), **Spec Ambiguities**, **Blocked Items**, **Decisions Made**, and **Warnings for Next Phase** (especially: the availability service signature 02b's reservation insert-retry will call, and the selected-range hand-off from the calendar to checkout).

---

## 7. Execution & Orchestration

**Run:** `claude --max-turns 75`.
**Plan first:** read §2.5, §3.2, §4.2, §4.5 + `frontend-design` → availability service → catalog/detail/calendar → admin CRUD → concurrency test.
**Resumption (--continue):** re-read this prompt; inspect filesystem + `PHASE-02a-PROGRESS.md`; resume at first incomplete task.
**Decision authority:** spec defines → follow; silent → `// SPEC-AMBIGUITY`; contradictory → `// ESCALATE` + skip.
**Progress:** update `PHASE-02a-PROGRESS.md` after each task.
