# Statement of Work: Eastern Rentals

**Version:** 1.3
**Date:** June 6, 2026
**Prepared for:** Adam Larkin (Owner/Operator)
**Prepared by:** BenchworksAI
**Status:** LOCKED — signed (see §15)
**Changelog:**
- **v1.3** reconciles the SOW to the spec-v2.x payment-model redesign and Cycle-1–3 adversarial review: split-payment model (non-refundable booking fee at reservation, balance at pickup) replaces pay-full-at-reservation (F-007); deposit placed **at handover**, hold **≤5 days** / charge **>5 days** (F-008); cancellation = non-refundable booking fee, no refund window (F-019); **Dumpsters** carved into their own category + billing flow with a 30%-down booking fee (F-002/F-030); turnaround buffer = **none / next-day** (F-005); owner-defined parameters resolved with values (§14); approved industrial UI theme referenced (§6); column-scoped customer RLS, legal-hold, webhook idempotency, and handover ordering captured as build requirements. Sign-off executed (§15).
- v1.2 incorporated second external review (C-001 retention, C-002 concurrency, H-003 fraud, H-004 polling, H-005 WCAG, M-001 ELM consent, M-003 thin-content, M-004 photo chain, M-005 license notice, L-001 indexability, L-002 towable, §14 params). v1.1 incorporated first external review.

-----

## 1. Executive Summary

Eastern Rentals is an online equipment-rental platform for a small heavy-equipment fleet operated from a single yard in Center Moriches, NY. Local contractors and homeowners browse available machines, check day-level availability, **reserve with a non-refundable booking fee**, complete all legal paperwork (rental contract, liability waiver, driver's license upload) digitally, and **settle the balance and security deposit at pickup/handover**. The platform replaces phone-based booking with a self-service funnel that reduces no-shows, eliminates unsigned-waiver risk, and protects against equipment damage via a Stripe deposit placed at handover.

The defining constraint is a deliberate split: the **customer-facing experience must feel dead simple** while the **operational backend handles real complexity** — unit-level conflict resolution across identical machines, distance-based delivery pricing, deposit pre-authorization, and webhook-gated paperwork. Eastern Rentals is a sister operation to Eastern Landscape & Mason Supply (ELM) and reuses ELM's customer base, delivery-pricing pattern, and SMS infrastructure where possible. It deploys on the **same Hetzner/Docker architecture** as the owner's other builds. The data model is designed to absorb deferred v2 capabilities (damage waiver, automated ID verification, loyalty rules engine, maintenance scheduling, multi-location, full dumpster ops flow) without a rebuild.

## 2. Project Objectives

|ID   |Objective                                               |Success Metric                                                                            |Priority|
|-----|--------------------------------------------------------|------------------------------------------------------------------------------------------|--------|
|O-001|Enable 24/7 self-service reservation without phone calls |≥70% of new reservations completed online without staff contact within 90 days            |MUST    |
|O-002|Eliminate equipment release without completed paperwork  |100% of released rentals have signed contract + waiver + approved license on file          |MUST    |
|O-003|Protect against damage/theft loss                        |Every active rental has a valid deposit hold or captured deposit, placed at handover       |MUST    |
|O-004|Prevent double-booking of identical units                |Zero double-bookings of the same physical unit across overlapping spans (next-day model)   |MUST    |
|O-005|Capture local organic search demand                      |Per-town landing pages indexed and ranking for "[equipment] rental [town]" within 6 months |SHOULD  |
|O-006|Monetize delivery and longer rentals                     |Delivery attach rate tracked; delivery priced by distance; booking fee scales with rental  |SHOULD  |
|O-007|Reactivate existing ELM customer base                    |ELM customers importable and reachable via email/SMS for launch announcement (opt-in)      |COULD   |

## 3. Feature Set

### 3.1 Core Features (Must-Have)

- **F-001 Equipment catalog** — Public listing by category with photos, specs, daily rate, description; out-of-service units hidden.
- **F-002 Unit-level inventory model** — Each machine is a tracked unit under a product type; products carry config flags incl. `requires_towing_ack` and **`booking_fee_mode`** (`standard` vs `percent_down`). Available if ≥1 unit free for the full span. **Dumpsters are a distinct category** (F-030).
- **F-003 Day-level availability calendar** — Visual calendar reflecting real reservations; unavailable days clearly blocked; unit available the next calendar day after return.
- **F-004 Availability conflict engine** — Server-side prevention of overlapping reservations of the same unit. **Mechanism documented at architecture level (inclusive `daterange` exclusion constraint) and validated with a concurrent-request test.** Only one concurrent attempt on the last unit succeeds.
- **F-005 Turnaround model — next-day (no buffer)** — Daily rentals; a unit returned on its end date is bookable the next calendar day. (Replaces the v1.2 hours-aware buffer; resolved by the inclusive-range model.)
- **F-006 Advance reservation with date range** — Renter selects start/end and reserves a specific unit; held pending the booking fee.
- **F-007 Pay-to-reserve — non-refundable booking fee** — Reservation is confirmed by a **non-refundable booking fee** charged to card with a **3.5% card service fee** (cash/other carry no surcharge; surcharge does not credit toward total). The fee **credits toward** the tax-inclusive grand total. **Booking-fee formula by `booking_fee_mode`:** `standard` (equipment) = `min(round(0.30 × first_day_rate + 100 × (rental_days − 1), 2), grand_total)`; `percent_down` (dumpsters) = `round(0.30 × rental_subtotal, 2)`. Order total includes Suffolk County, NY sales tax (8.75%). Failed booking-fee payment releases the held unit (TTL-governed; transient failures are retryable).
- **F-007b Balance at pickup** — The balance (`grand_total − booking_fee`) is settled at handover by card (+3.5%), cash, or other.
- **F-008 Security deposit at handover (tiered)** — Deposit = **30% of pre-tax rental subtotal**, placed **at handover** (not booking): rentals **≤5 days** use a Stripe pre-auth **hold**; **>5 days** capture upfront and refund on clean return. Admin captures/releases/refunds on return. Extensions handled manually. (Dumpster deposit handling is part of the deferred dumpster billing flow, F-030.)
- **F-009 Delivery option + distance pricing** — Optional delivery priced from the Center Moriches yard via Google Distance Matrix: **$199 base ≤10 mi + $5/mi beyond**, **40 mi max radius**; pickup = $0. On API outage the reservation still completes on the (rental-based) booking fee; delivery is priced at pickup.
- **F-010 Multi-day discount** — Config-driven discounted rate over a threshold. **Disabled at launch** (no discount); schema-ready.
- **F-011 Loyalty discount (manual tier)** — Loyalty-tier flag applies a configured discount; default none. Admin-only (customers cannot self-set).
- **F-012 Customer accounts** — Supabase Auth email/password; profile, license, rentals, messages; idempotent provisioning.
- **F-013 Driver's license upload** — Photo stored in private Supabase Storage (owner/admin RLS, re-encoded/sanitized); status pending until admin approves.
- **F-014 Manual license/renter review** — Admin views/approves/rejects; **admin notified** when an upload is pending; rejection notifies customer; approval required before release.
- **F-015 Integrated rental contract (e-sign)** — Generated per reservation, sent post-(booking-fee)-payment via SignWell; webhook (idempotent) + polling fallback records completion; signed PDF stored.
- **F-016 Liability waiver (e-sign)** — Waiver e-signed via SignWell; completion recorded; signed PDF stored.
- **F-017 Paperwork-completion gate** — Handover permitted only when payment (booking fee) + approved license + signed contract + signed waiver are all complete; gate re-computed on every source change; formal status state machine.
- **F-018 "What's Next" confirmation page** — Post-payment status page listing remaining steps with live status and action links.
- **F-019 Cancellation policy** — The **booking fee is non-refundable**; cancelling forfeits it and frees the unit. No balance is collected before pickup, so there is nothing else to refund. (No cancellation window / refund-% parameter.)
- **F-020 Condition photos at pickup/return** — Admin-attached, timestamped, admin-only, linked to the rental for the evidentiary chain; retained per §13.
- **F-021 Transactional email** — Confirmation, contract/waiver links, receipts, reminders (idempotent).
- **F-022 Transactional SMS** — Confirmation, paperwork nudge, pickup/return reminders (Twilio); separate `transactional_sms` and `sms_marketing_opt_in` consent per A2P 10DLC; opt-out respected; idempotent.
- **F-023 Customer records + message log** — Lightweight CRM: profile, rental history, message log.
- **F-024 Per-town landing pages** — SSG/ISR SEO pages per town with unique localized copy, distance-from-yard, unique meta, LocalBusiness schema, catalog CTA; no near-duplicate pages.
- **F-025 Admin dispatch view** — Daily pickups, returns, deliveries with status.
- **F-026 Admin equipment & reservation management** — CRUD for products/units/rates/reservations/statuses; manual document override toggle (audit-logged) for SignWell sync failures.
- **F-027 Deposit capture/release on return** — Admin captures (full/partial) or releases/refunds the deposit on inspection; customer notified.
- **F-028 Towing/pickup acknowledgment** — Towable units in pickup mode require a checked acknowledgment before release; recorded on the rental.
- **F-029 Mid-rental unit swap** — Admin reassigns the unit on an active rental; system re-checks target-unit availability; a **single-field SignWell e-sign addendum** acknowledges the substitute serial; original signed docs and terms persist; both units' availability updates; before/after serials audit-logged.
- **F-030 Dumpster category & billing (MVP carve-out)** — Dumpsters are a distinct category with `booking_fee_mode='percent_down'` (30% down, no per-day fee). **Deferred for now:** the fuller dumpster billing flow (disposal/tonnage/overage; whether a card-hold deposit applies). MVP implements only the 30%-down booking fee for dumpsters.

### 3.2 Enhancement Features (Nice-to-Have) — deferred
F-050 damage waiver (v2); F-051 proof-of-insurance upload (v2); F-052 automated ID verification (v2); F-053 loyalty rules engine (v2); F-054 maintenance scheduling (v2); F-055 multi-location (future); F-056 accounting sync (future); **F-057 full dumpster ops/billing flow** (disposal/tonnage/overage, v2).

### 3.3 Explicitly Out of Scope
Automated insurance/ID at MVP; full custom CRM; loyalty automation; multi-location UI; telematics; native mobile apps (responsive web only); public self-service deposit disputes; in-app chat; payment plans/financing.

## 4. Users & Personas
- **Mike (Contractor)** — grabs a skid steer for a 3-day job without driving to the yard.
- **Sarah (Homeowner)** — rents a chipper/mixer/dumpster for a weekend with delivery; needs a simple guided process.
- **Adam (Owner/Operator)** — manages inventory, approvals, dispatch, handover (balance + deposit), returns, deposit settlement.

## 5. Competitive & Design References
Reservety, Quipli, RentMy, Anolla, Checkfront — emulate delivery-zone pricing, contractor booking UX, real-time availability, clean agreement flow; avoid templated/enterprise/marketplace bloat and per-transaction OTA fees.

## 6. Technical Constraints & Existing Infrastructure
**Stack:** Next.js + TypeScript (industrial theme, §6 design); FastAPI; Supabase/PostgreSQL; Supabase Auth + Storage; Docker on **Hetzner VPS (same architecture as owner's other builds)**; domain TBD.
**Integrations:** Stripe (booking-fee charge, balance charge, deposit hold ≤5d/charge >5d, capture/refund, Radar); Twilio (SMS, A2P 10DLC); Resend/Postmark (email); Google Distance Matrix (delivery); SignWell (contract + waiver e-sign + webhooks).
**Constraints:** runs on existing Hetzner VPS via Docker; minimal paid API cost; SignWell metered (send post-payment); Stripe pre-auth ~7-day expiry handled by **deposit-at-handover + ≤5-day boundary**; simple customer UX; **WCAG 2.1 AA** (ADA Title III); fraud — Stripe Radar + checkout rate limits + reservation-hold-abuse throttle.
**Approved UI theme (industrial / heavy-equipment):** locked look/feel/layout/type/motion/copy — CAT-yellow + steel-black tokens; Black Ops One / Teko / Saira / Share Tech Mono; hazard stripes; heavy offset shadows; **rotating gear** motif; dispatch copy voice. Only the brand logo changes. Built per the `frontend-design` skill; ports into Next.js + Tailwind on the existing stack.

## 7. Assets & Materials
Logo/brand kit (needed — gear motif retained, wordmark swapped); equipment + dumpster photos/specs (needed); contract + waiver text (attorney/insurance review recommended); **ELM customer data** (consent caveat — opt-in/unsubscribe; fresh A2P for SMS, M-001); delivery-pricing logic (reuse ELM); SMS infra (reuse Twilio); SignWell pattern (reuse Maningo); town list.

## 8. Delivery Phases
Phase 1 Foundation (catalog/inventory/availability/admin inventory + theme + schema/auth); Phase 2 Reservation & Payment (booking fee, delivery, quote, towing ack, non-refundable cancel); Phase 3 Accounts/Paperwork/Release Gate/**Handover** (license, e-sign, gate, balance + deposit at handover, deposit settlement); Phase 4 Comms/CRM/Ops (email/SMS, dispatch, condition photos, unit swap); Phase 5 Local SEO & Launch (town pages, ELM import). Each phase independently deployable/testable. (Implementation phasing detailed in the spec + BUILDPLAN.)

## 10. Assumptions & Dependencies
Stripe (holds + capture), Twilio + A2P, SignWell, Google Distance Matrix all provisioned before their phases; contract/waiver language finalized (attorney/insurance review before go-live); equipment/dumpster photos, specs, town list provided; domain registered; sales tax 8.75% (confirm taxability with accountant); release gate uses SignWell webhook + polling fallback (15-min up to 24 hr → admin override) + F-026 manual override; ELM list reused only with compliant opt-in/unsubscribe + fresh A2P (M-001).

## 11. Risks & Mitigations (residual)
Concurrency overbooking (inclusive-range exclusion + insert-retry + concurrency test, O-004); deposit hold insufficient for $20–50K machine damage (realistic deposit %, condition photos, v2 damage waiver — **accepted residual**); waiver enforceability (attorney review + SignWell audit trail); SignWell free-tier cap (post-payment only); paperwork abandonment (What's-Next + nudges); license-review bottleneck (admin notifications + SLA); delivery pricing errors (reuse ELM, cap/validate, 40 mi radius); UX complexity (frontend-design + Sarah persona); booking abuse (Radar + rate limits + hold throttle); ELM consent (opt-in + A2P); PII retention/deletion (§13 + legal-hold + admin deletion workflow); thin-content town pages (per-page differentiation).

## 13. Data Retention, Privacy & Deletion
Sensitive PII: license images, Stripe tokens (no raw card data), signed docs, condition photos. CCPA-style deletion for NY residents.
- License images: **12 months** post-rental, then purged (skipped while the owning customer is under legal hold).
- Signed contracts/waivers: **6 years** (NY contract/tort SOL).
- Condition photos: **6 years** (linked to rental; damage-dispute window).
- Deletion flow: documented admin-executed process honoring deletion requests except where records must be retained for legal/tax obligations; **`legal_hold` enforced in schema** (rentals + customers) and respected by the purge job; Storage object deleted before DB row.
- Confirm windows with attorney/accountant before launch.

## 14. Owner-Defined Parameters — RESOLVED

|Param|Value|
|-----|-----|
|Deposit|**30%** of pre-tax subtotal, uniform (placed at handover; hold ≤5d / charge >5d)|
|Booking fee|`standard`: 0.30×first_day + $100×extra days (clamped ≤ total); `percent_down` (dumpsters): 0.30×subtotal|
|Card service fee|**3.5%** on card payments only|
|Cancellation|Booking fee **non-refundable**; no window/refund-% param|
|Max rental duration|**30 days** (per product)|
|Delivery|**$199** base ≤10 mi, **+$5/mi** beyond, **40 mi** max radius|
|Multi-day discount|**None at launch** (schema-ready)|
|Turnaround buffer|**None** (next-day availability)|
|Yard hours|**Mon–Fri 07:00–17:00, Sat 07:00–15:00, Sun closed**|
|Sales tax|**8.75%** (Suffolk County, NY)|
|Retention|License **12 mo** / contracts+waivers **6 yr** / condition photos **6 yr**|

## 15. Sign-Off

By confirming this SOW, the stakeholder agrees that the scope, features, and phases described above accurately represent the intended project.

- [x] **SOW Confirmed** — **Adam Larkin** — **June 6, 2026** — *(authorized and executed at owner's instruction)*
