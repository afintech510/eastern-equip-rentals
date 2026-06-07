# PHASE-02b PROGRESS — Reservation, Quote & Booking-Fee Payment

**Status:** ✅ COMPLETE (pending human review gate — money) · **Date:** 2026-06-07 · **Spec:** v2.1
**Implements:** F-006, F-007, F-009 (partial), F-010/F-011 (disabled), F-019, F-028, F-030

> ⚠ **Human review gate after this phase** (money/payment). The full flow is verified
> **end-to-end against the live system in Stripe TEST mode**. Do NOT switch to live Stripe keys
> until the pre-launch review.

## Files Created / Modified

### Backend
| Path | Purpose |
|------|---------|
| `api/app/services/pricing.py` | §3.2 money engine — Decimal/round_half_up; **V3-001 booking-fee clamp**; dumpster **flat-fee** percent_down; tax; deposit (hold ≤5d / charge >5d); `to_cents` |
| `api/app/routers/quote.py` | `POST /quote` — server-authoritative (REV-011); pickup priced; delivery → 422 until Distance Matrix key |
| `api/app/routers/reservations.py` | `POST /reservations` (insert-retry REV-003 + booking-fee PaymentIntent + towing_ack F-028), `GET /reservations/{id}` (gate), `POST /reservations/{id}/cancel` (non-refundable F-019) |
| `api/app/routers/webhooks.py` | `POST /webhooks/stripe` — signature verify + insert-first idempotency (REV-004); `payment_intent.succeeded` → reserved/paid + recompute_gate; failed → no hard release (REV-033) |
| `api/app/stripe_client.py` | Stripe key config |
| `api/tests/test_pricing.py` | 6 pricing tests (clamp, dumpster flat, tax, deposit strategy) |

### Frontend
| Path | Purpose |
|------|---------|
| `web/src/components/catalog/{ReservePanel,QuoteSummary}.tsx` | calendar range → live `/quote` breakdown; Reserve CTA → checkout |
| `web/src/app/reserve/[productId]/page.tsx` + `components/reserve/CheckoutClient.tsx` | auth gate → order summary → towing-ack → create reservation → **Stripe PaymentElement** → confirmPayment |
| `web/src/app/reserve/confirmation/[rentalId]/page.tsx` + `ConfirmationClient.tsx` | polls gate → "What's Next" checklist (F-018 seed) |
| `web/src/lib/{stripe.ts,api.ts}` | Stripe.js loader + reservation API helpers |

## Acceptance Criteria

| Criterion | Result | Evidence |
|-----------|--------|----------|
| Quote matches §3.2 incl. `booking_fee ≤ total` + dumpster mode | ✅ | 6 unit tests; live quote (Skid 5d=$1903.13; dumpster flat $850) |
| Failed fee doesn't hard-release | ✅ | webhook `payment_failed` logs only (REV-033) |
| Success → `reserved` | ✅ | **live e2e**: PI confirm → webhook → status `reserved`, paid=true |
| Delivery rejects (no key yet) | ✅ | `/quote` + `/reservations` delivery → 422 DELIVERY_UNAVAILABLE |
| 3.5% on card only | ✅ | card_service_fee = 3.5% × booking fee; PI = (fee+surcharge) cents |
| Insert-retry / 409 when no unit | ✅ | `free_unit_ids` + catch exclusion → next unit → 409; concurrency proof (02a CI) |
| Webhook idempotent + signature-verified | ✅ | `processed_webhook_events` insert-first; bad sig → 400 (live) |
| Reservation requires auth | ✅ | live: no token → 401 |

**Live end-to-end (test mode):** reservation `201` (booking fee $305 + card $10.68) → `PaymentIntent.confirm(pm_card_visa)` → `succeeded` ($315.68) → webhook → gate `reserved/paid=true`, balance $836.88 → cancel frees unit.

## Decisions
- **Booking fee paid by card always** (online), so a 3.5% card surcharge applies and is added to the PI (not part of `total`; tracked in `rentals.service_fee_total`).
- **Hold model:** the `pending_fee` rental row itself holds the unit (occupies the exclusion constraint); no separate lock. TTL expiry of abandoned holds is **Phase 06** (not built) — until then an unpaid hold persists; cancel frees it.
- Reservations are **pickup-only** until the Google Distance Matrix key lands (delivery → 422).
- Stripe webhook endpoint `we_…` registered (test mode) → `https://rentals.benchworksai.com/api/v1/webhooks/stripe`.

## Blocked / Deferred
- **Live Stripe keys** — currently TEST. Switch at pre-launch only (human gate).
- **Delivery pricing (F-009)** — needs `GOOGLE_DISTANCE_MATRIX_API_KEY`.
- **Hold-expiry TTL job (REV-003/V3-006)** + rate limiting (H-003) → Phase 06.

## Warnings for Next Phase (03 — Accounts, Paperwork, Gate & Handover)
- Gate flags are recomputed by `recompute_gate(rental_id)`; license/contract/waiver still false after reservation (expected). Phase 03 wires license upload + SignWell + the handover transaction (deposit→balance→active, V3-003).
- `payments` row exists per reservation with `stripe_booking_fee_intent_id`; deposit/balance intents are Phase 03.
- The confirmation page already renders the "What's Next" checklist from the gate.
