# Phase 02b: Reservation, Quote & Booking-Fee Payment
**Project:** Eastern Rentals
**Spec:** `eastern-rentals-spec.md`
**Build Plan:** `eastern-rentals-buildplan.md`
**Prerequisites:** Phase 02a
**Implements:** F-006, F-007, F-009, F-010, F-011, F-019, F-028, F-030
**Recommended:** `claude --max-turns 100`

---

## 1. Context

You are executing **Phase 02b: Reservation, Quote & Booking-Fee Payment** — the money phase. A renter quotes a rental, reserves a unit, and pays the **non-refundable booking fee** to confirm. This phase moves real money and has the highest concentration of CRITICAL/HIGH review findings in the build. Read the cautions.

**Your scope is strictly this phase.** Build: the authoritative quote engine, the reservation create flow (unit lock via insert-retry), the Stripe **booking-fee** PaymentIntent + its webhook, delivery pricing, towing ack, and non-refundable cancellation. **Do NOT** build the balance/deposit handover, license/e-sign/gate, SignWell, or comms — those are Phase 03/04. Booking fee only; balance + deposit happen at handover (Phase 03).

**Tech Stack (§1.2):** FastAPI, Stripe, Google Distance Matrix, Supabase/Postgres, Next.js (industrial theme), Redis (hold/locks).
**Working Directory:** project root.
**Spec File:** `eastern-rentals-spec.md` — READ FIRST: **§0 (payment model + booking-fee formula), §3.2 (quote + reservations + cancel), §5.1 (Stripe), §5.5 (delivery), §2.5 (concurrency), §2.2 (rentals/payments/config), §4.5 (checkout UI), §3.1 (rate limiting).**

### What Already Exists
- **Phase 00:** theme/shell/docker. **Phase 01:** schema (rentals money + `payment_attempted_at` + gate cols; payments; `processed_webhook_events`; `config` with `deposit_percent`, `sales_tax_rate=0.0875`, `card_service_fee_pct=0.035`, `booking_fee_*`, `delivery_*`, `reservation_hold_ttl_min`); `rental_status` ENUM + transition trigger; RLS; auth; `is_admin()`. **Phase 02a:** catalog/detail/calendar, availability read service, admin inventory, the DB-level exclusion-constraint concurrency proof.

### What You're Building
The server-authoritative quote, the reservation write path with concurrency safety, and the Stripe booking-fee charge that confirms a reservation — plus delivery pricing and non-refundable cancellation.

## Skills Reference
- `view /mnt/skills/public/frontend-design/SKILL.md` + spec **§4.5** for the checkout UI (two-column details + black `font-mono` invoice rail per §4.5).

---

## 2. Objective & Deliverables

### Objective
After this phase, a renter can get an accurate server-computed quote (with the correct booking fee for the product's `booking_fee_mode`), reserve a specific unit, and pay the non-refundable booking fee to move the rental to `reserved`. Concurrent attempts on the last unit resolve to exactly one winner (others get another free unit or a clean 409). Delivery is priced; cancellation forfeits the fee.

### Deliverables
1. Quote engine + `POST /quote` (public) — **server recomputes everything; client figures ignored** — §3.2, §0, §5.5 (F-007/009/010/011/028/030)
2. Reservation create `POST /reservations` with **insert-retry unit lock** + booking-fee PaymentIntent — §2.5, §3.2, §5.1 (F-006/007)
3. Stripe **booking-fee** webhook (`payment_intent.succeeded` / `payment_failed`) — idempotent via `processed_webhook_events` — §3.3, §5.1 (REV-004/033)
4. Hold-TTL expiry job honoring `payment_attempted_at` shield — §2.5 (REV-003/V3-006)
5. Delivery pricing via Distance Matrix + 40-mi reject + outage fallback — §5.5 (F-009)
6. Towing-ack enforcement; non-refundable cancel `POST /reservations/{id}/cancel` — §3.2 (F-028/019)
7. Checkout UI (booking fee, invoice rail, fulfillment toggle, towing ack) — §4.5 (F-007/018-precursor)
8. Rate limiting + Stripe Radar on reservation/payment — §3.1 (H-003)
9. Stripe **integer-cents** money utility — §5.1 (REV-030)
10. `PHASE-02b-PROGRESS.md`

---

## 3. Implementation Instructions

### Task 1: Money utility + quote engine (**CRITICAL math**)
**Spec Reference:** §0, §3.2, §5.5 · **Creates:** pricing module, `POST /quote`
Implement the **authoritative** money formula from §3.2 using `Decimal` (never float), `round_half_up` to 2 dp:
`tax = 0.0875 × (subtotal − discount + delivery)`; `total = subtotal − discount + delivery + tax`; deposit and the 3.5% card surcharge are **not** taxed.
**CAUTION — V3-001 (CRITICAL):** booking fee depends on `products.booking_fee_mode`:
- `standard` (equipment): `booking_fee = min(round(0.30 × first_day_rate + 100 × (rental_days − 1), 2), total)` — the **clamp is mandatory** so a non-refundable fee can never exceed the rental.
- `percent_down` (dumpsters): `booking_fee = round(0.30 × subtotal, 2)`.
Always `balance_due = max(0, total − booking_fee)`.
**CAUTION — REV-011:** `/quote` (and `/reservations`) **recompute server-side from `products`/`product_rates`/`config`/customer loyalty**; never trust client-sent amounts. Discount/loyalty are schema-wired but **disabled at launch** (discount = 0).
Stripe money helper: `round(amount * 100)` as integer minor units before any Stripe call (REV-030).

### Task 2: Reservation create + concurrency (**CRITICAL concurrency**)
**Spec Reference:** §2.5, §3.2, §5.1 · **Creates:** `POST /reservations` + booking-fee PI
**CAUTION — REV-003:** pick a free unit (via the 02a availability service) and attempt the INSERT; on exclusion/unique violation, **catch and retry with the next free unit**; return `409 UNIT_UNAVAILABLE` only when no unit succeeds (don't reject when other units are free). Create the rental at `pending_fee`, set `payment_attempted_at` when the booking-fee PaymentIntent is created, and return `{rental_id, booking_fee_amount, card_service_fee, booking_fee_client_secret, hold_expires_at}`. Server recomputes the booking fee (Task 1). Enforce `towing_ack` for towable products in pickup mode (F-028).

### Task 3: Booking-fee webhook + hold lifecycle
**Spec Reference:** §3.3, §5.1, §2.5 · **Creates:** `POST /webhooks/stripe` (booking-fee scope), hold-TTL job
Verify signature; **idempotency-guard via `processed_webhook_events` (insert-first)**. `payment_intent.succeeded` (booking fee) → re-verify the unit is still held (re-acquire via insert-retry if freed, else auto-refund + notify), then set `reserved`, `paid=true`, `booking_fee_paid_at`, clear `payment_attempted_at`. **CAUTION — REV-033:** `payment_failed` does **NOT** hard-release; let the hold-TTL govern. Hold-TTL job expires `pending_fee` rentals older than `config.reservation_hold_ttl_min`, **excluding** rows with a recent `payment_attempted_at` (V3-006 shield).
(Deposit, `charge.refunded`, and SignWell webhooks are Phase 03 — leave hooks/notes, don't build them.)

### Task 4: Delivery pricing (F-009)
**Spec Reference:** §5.5 · **Creates:** delivery quote logic + `delivery_quotes`
`fee = delivery_base_fee + delivery_per_mile × max(0, miles − delivery_free_miles)` ($199 + $5/mi beyond 10). Reject `miles > 40` (`delivery_max_radius_miles`) → "delivery not available, contact us." **Outage fallback:** on Distance Matrix error the reservation still proceeds on the (rental-based) booking fee; mark `delivery_quote_pending`; delivery priced at pickup. Cache repeat addresses.

### Task 5: Cancellation + checkout UI + rate limiting
**Spec Reference:** §3.2, §4.5, §3.1 · **Creates:** cancel endpoint, checkout page, limits
`POST /reservations/{id}/cancel` — releases the unit; **booking fee non-refundable** (F-019); audit-log. Checkout UI per §4.5 (two-column: fulfillment toggle + towing ack + delivery zone; black `font-mono` invoice rail showing subtotal/delivery/tax/**total**/booking-fee/balance-due). Wire the booking-fee Stripe confirmation. Apply rate limits + Stripe Radar on reservation/payment (H-003).

**Task ordering:** 1 → 2 → 3 → 4 → 5. Money correctness (1) gates everything.

---

## 4. Acceptance Criteria

### Automated
- [ ] Build + lint clean
- [ ] **Money unit-test matrix:** for `standard` items across $40–$400/day × 1–30 days, assert `booking_fee ≤ total` and `balance_due ≥ 0`; for a `percent_down` (dumpster) product assert `booking_fee = 0.30 × subtotal`; assert tax = 8.75% of (subtotal−discount+delivery), deposit/surcharge untaxed, all `round_half_up` (REV-009/V3-001)
- [ ] Stripe amounts are integer cents via the Decimal helper (no float drift) (REV-030)
- [ ] **Endpoint concurrency test:** N concurrent `POST /reservations` on the last unit → exactly one `reserved`; with M free units, M concurrent requests all succeed on distinct units; 409 only when none free (REV-003)
- [ ] Webhook idempotency: a duplicate `payment_intent.succeeded` is a no-op (REV-004)

### Functional
- [ ] `/quote` recomputes server-side; tampered client amounts are ignored (REV-011)
- [ ] Successful booking-fee payment → `reserved`/`paid`; `payment_failed` does NOT release the unit (TTL governs) (REV-033)
- [ ] Hold-TTL job expires stale `pending_fee` but skips rows with recent `payment_attempted_at` (V3-006)
- [ ] Delivery: $199 ≤10 mi, +$5/mi beyond; >40 mi rejected; Distance-Matrix outage still lets the reservation complete on the fee (F-009/REV-034)
- [ ] Towing ack required for towable pickup; cancel forfeits the non-refundable fee (F-028/019)
- [ ] 3.5% surcharge on card only; surcharge not credited toward total, not taxed

### Visual
- [ ] Checkout renders on the industrial theme (invoice rail) at 375/768/1440; totals match the server quote

---

## 5. Constraints

### Hard
- The §3.2 money formula, the V3-001 clamp, and the `percent_down` carve-out MUST be implemented exactly; **never** charge a booking fee above `total`.
- Server is authoritative on price (REV-011); Stripe amounts in integer cents (REV-030).
- Reservation uses insert-retry over free units (REV-003); `payment_failed` never hard-releases (REV-033); webhook idempotent (REV-004).
- **Do NOT** build the handover (balance/deposit), license/e-sign/gate, SignWell, or comms — Phase 03/04.

### Soft
- Reuse the 02a availability service for free-unit selection; reuse Phase-00 theme.
- Discount/loyalty present but disabled (0) at launch — don't delete the code paths.
- Mark `// SPEC-AMBIGUITY:` / `// BLOCKED:`.

---

## 6. Completion Protocol

Provide **Files Created/Modified**, **Acceptance Criteria Results** (include the money-matrix table evidence and the endpoint-concurrency result explicitly), **Spec Ambiguities**, **Blocked Items**, **Decisions Made** (Stripe SDK patterns, idempotency-key strategy, Decimal handling), and **Warnings for Next Phase** (especially: the reserved-rental shape Phase 03 picks up at handover, the Stripe webhook module Phase 03 extends for deposit/`charge.refunded`, and how `delivery_quote_pending` should be resolved at handover).

---

## 7. Execution & Orchestration

**Run:** `claude --max-turns 100` (plan for 1–2 `--continue`).
**Plan first:** read §0, §3.2, §5.1, §5.5, §2.5, §3.1, §4.5 → money util + quote → reservation insert-retry → webhook + hold job → delivery → cancel + UI + limits.
**Resumption (--continue):** re-read this prompt; inspect filesystem + `PHASE-02b-PROGRESS.md`; resume at first incomplete task; never double-charge — reuse existing PaymentIntents/idempotency keys.
**Decision authority:** spec defines → follow exactly (money is exact); silent → `// SPEC-AMBIGUITY`; contradictory → `// ESCALATE` + skip.
**Progress:** update `PHASE-02b-PROGRESS.md` after each task.
**Reminder:** this phase moves money and carries V3-001/REV-009/REV-011/REV-030/REV-003 — prove the money matrix and the endpoint-concurrency result with explicit evidence in your report, and never let `booking_fee > total`.
