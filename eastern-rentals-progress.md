# BUILD PROGRESS: Eastern Rentals

**Spec:** v2.1 (LOCKED) · **SOW:** v1.3 (signed) · **Started:** 2026-06-06
**Legend:** ⬜ NOT STARTED · 🔨 IN PROGRESS · 🔍 IN REVIEW · ✅ COMPLETE · ❌ FAILED · ⏸️ BLOCKED

## Phase Status

| Phase | Name | Status | Builder session | Review verdict | Notes |
|-------|------|--------|-----------------|----------------|-------|
| 00 | Environment & Theme Foundation | ✅ | claude (2026-06-06) | — | Theme §4.5 wired; web build green; Docker not run locally |
| 01 | Schema & Auth Foundation | 🔍 | claude (2026-06-06) | — | **Human gate after** (schema/RLS). Applied+asserted in CI (PG15) AND applied+verified on live Supabase (PG17.6, 2026-06-07). Pending: owner admin signup + review sign-off |
| 02a | Catalog, Inventory & Availability | ✅ | claude (2026-06-07) | — | Catalog/detail/calendar + availability API + admin CRUD; web build green; live API smoke ALL PASS; concurrency proof in CI |
| 02b | Reservation, Quote & Booking-Fee Payment | 🔍 | claude (2026-06-07) | — | **Human gate after** (money). Quote + reservation insert-retry + Stripe booking-fee PI + signature-verified webhook → reserved. **Verified live end-to-end (Stripe TEST mode)**. Delivery + TTL job deferred. Switch to live Stripe keys only at pre-launch |
| 03 | Accounts, Paperwork, Gate & Handover | 🔍 | claude (2026-06-07) | — | **Human gate after**. DONE: account+license (live), SignWell e-sign+webhook (gated on templates), release gate, handover transaction (V3-003 deposit→balance→active, saved-card/manual/cash) + return + deposit settlement + admin POS. Handover verified live e2e (Stripe TEST). SignWell templates pending for live e-sign |
| 04 | Comms, CRM, Ops & Unit Swap | ⬜ | — | — | — |
| 05 | Local SEO & Launch | ⬜ | — | — | Parallel w/ 02b–04 after 02a |
| 06 | Hardening, Retention & Jobs | ⬜ | — | — | — |
| 07 | Testing & Quality | ⬜ | — | — | — |
| 08 | Deployment & Operations | ⬜ | — | — | **Human gate before** (deploy) |
| 09 | Chrome UX Validation | ⬜ | — | — | Human-driven, optional |

## Per-Phase Acceptance Snapshot

(Builder fills the completion report; reviewer fills the verdict. Keep one line per phase as it lands.)

- **00** — ✅ web build+lint green / theme ported verbatim (§4.5) / fonts via next/font / `/health` 200 / no secrets / Docker compose authored (not run on a live daemon yet)
- **01** — 🔍 schema matches §2.2 / RLS escalation blocked (column-scoped) / exclusion constraint correct / illegal transition rejected / config check / auth flows built — all asserted in CI `db` job (PG15); live Supabase apply + end-to-end auth pending owner
- **02a** — ✅ catalog+detail+calendar (keyboard/aria) / availability mirrors §2.5 / admin CRUD is_admin-gated / DB concurrency proof in CI / live API smoke ALL PASS
- **02b** — 🔍 quote formula + clamp + dumpster flat-fee / reservation insert-retry / booking-fee PI + webhook → reserved (verified live, TEST Stripe) / delivery deferred (no Distance Matrix key)
- **03** — 🔍 license upload+review (live) / SignWell e-sign+webhook (override-safe, gated on templates) / release gate / handover V3-003 ordered deposit→balance→active + compensation + return + deposit settlement (verified live e2e, Stripe TEST) / save-card + admin POS
- **04** — ⬜ comms idempotent / swap addendum / photo RLS
- **05** — ⬜ town pages indexable / import consented
- **06** — ⬜ purge honors legal_hold / worker DLQ
- **07** — ⬜ E2E + unit pass across viewports
- **08** — ⬜ prod TLS + DR + smoke

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-06-06 | Booking fee: clamp ≤ total (equipment) + dumpster `percent_down` | Resolve V3-001 overcharge; owner carve-out |
| 2026-06-06 | Deposit at handover, ≤5d hold / >5d charge, 30% | Resolve REV-002 pre-auth expiry |
| 2026-06-06 | Single VPS retained; DR documented | Owner decision (REV-014) |
| 2026-06-06 | Spec LOCKED v2.1 against SOW v1.3 (signed) | Cycle-3 fixes applied |
| 2026-06-06 | Synced to GitHub (afintech510/eastern-equip-rentals); CI/CD via GitHub Actions | Repo created; deploy mirrors maningo/benchworks (Docker Compose + shared nginx + Doppler) |
| 2026-06-06 | VPS port = 3009 | 3003/3005/3007 taken (maningo/benchworks/os-adam); spec §1.3 "3007" superseded — confirm at Phase 08 |
| 2026-06-07 | Phase 01 applied to live Supabase (ref wibwvqbzgvgvzrmeyrxj, PG17.6) | Migrations+seed via Management API + PAT; all live checks pass; auth redirect URLs set for localhost:3009 |

## Blocked Items

_(none yet — log `⏸️ BLOCKED` items here with the phase that must unblock them)_
