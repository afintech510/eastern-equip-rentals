# BUILD PROGRESS: Eastern Rentals

**Spec:** v2.1 (LOCKED) · **SOW:** v1.3 (signed) · **Started:** 2026-06-06
**Legend:** ⬜ NOT STARTED · 🔨 IN PROGRESS · 🔍 IN REVIEW · ✅ COMPLETE · ❌ FAILED · ⏸️ BLOCKED

## Phase Status

| Phase | Name | Status | Builder session | Review verdict | Notes |
|-------|------|--------|-----------------|----------------|-------|
| 00 | Environment & Theme Foundation | ✅ | claude (2026-06-06) | — | Theme §4.5 wired; web build green; Docker not run locally |
| 01 | Schema & Auth Foundation | 🔍 | claude (2026-06-06) | — | **Human gate after** (schema/RLS). Migrations+RLS+auth done; applied+asserted in CI (PG15); live Supabase apply pending |
| 02a | Catalog, Inventory & Availability | ⬜ | — | — | — |
| 02b | Reservation, Quote & Booking-Fee Payment | ⬜ | — | — | **Human gate after** (money) |
| 03 | Accounts, Paperwork, Gate & Handover | ⬜ | — | — | **Human gate after** (gate/handover) |
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
- **02a** — ⬜ catalog+calendar / concurrency test passes
- **02b** — ⬜ quote formula + clamp + dumpster mode / booking-fee flow / delivery radius
- **03** — ⬜ gate enforced / handover ordering / webhook idempotent
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

## Blocked Items

_(none yet — log `⏸️ BLOCKED` items here with the phase that must unblock them)_
