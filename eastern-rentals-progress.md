# BUILD PROGRESS: Eastern Rentals

**Spec:** v2.1 (LOCKED) · **SOW:** v1.3 (signed) · **Started:** _not yet_
**Legend:** ⬜ NOT STARTED · 🔨 IN PROGRESS · 🔍 IN REVIEW · ✅ COMPLETE · ❌ FAILED · ⏸️ BLOCKED

## Phase Status

| Phase | Name | Status | Builder session | Review verdict | Notes |
|-------|------|--------|-----------------|----------------|-------|
| 00 | Environment & Theme Foundation | ⬜ | — | — | Theme §4.5 wired here |
| 01 | Schema & Auth Foundation | ⬜ | — | — | **Human gate after** (schema/RLS) |
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

- **00** — ⬜ boot clean / theme renders / health green
- **01** — ⬜ schema matches §2.2 / RLS escalation blocked / exclusion constraint correct / auth works
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

## Blocked Items

_(none yet — log `⏸️ BLOCKED` items here with the phase that must unblock them)_
