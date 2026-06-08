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
| 04 | Comms, CRM, Ops & Unit Swap | ✅ | claude (2026-06-07) | — | Email (live)+SMS(gated) notifications, dispatch, condition photos, unit swap (addendum gated), CRM. Deployed |
| 05 | Local SEO & Launch | ✅ | claude (2026-06-07) | — | /rent/[town] SSR + LocalBusiness schema + sitemap/robots (live, 17 URLs). ELM import (M-001) deferred — needs source list + A2P + marketing table |
| 06 | Hardening, Retention & Jobs | ✅ | claude (2026-06-07) | — | Rate limiting + security headers + request-id logging + error taxonomy (§8.1); background-job framework (backoff+DLQ, `job_runs`/`dead_letter_jobs`), worker container; hold-expiry (TTL→expired), retention purge honoring legal_hold (V3-002, storage-before-row, report-only orphan sweep), SignWell poll + exhaustion alert; license re-encode (REV-022); admin job dashboard. Migration 0008. Worker not run on live daemon yet |
| 07 | Testing & Quality | ✅ | claude (2026-06-07) | — | pytest units: gate, deposit ≤5/>5, delivery, webhook idempotency (REV-004), retention legal-hold (V3-002), rate-limit window, runner backoff/DLQ, hold-expiry shield (43 pass total). Playwright E2E harness in `/e2e` (isolated): smoke+SEO specs + gated §9.3 journeys; manual `e2e.yml` CI. RLS-escalation + concurrency proofs remain in CI db job |
| 08 | Deployment & Operations | ⬜ | — | — | **Human gate before** (deploy) |
| 09 | Chrome UX Validation | ⬜ | — | — | Human-driven, optional |

## Per-Phase Acceptance Snapshot

(Builder fills the completion report; reviewer fills the verdict. Keep one line per phase as it lands.)

- **00** — ✅ web build+lint green / theme ported verbatim (§4.5) / fonts via next/font / `/health` 200 / no secrets / Docker compose authored (not run on a live daemon yet)
- **01** — 🔍 schema matches §2.2 / RLS escalation blocked (column-scoped) / exclusion constraint correct / illegal transition rejected / config check / auth flows built — all asserted in CI `db` job (PG15); live Supabase apply + end-to-end auth pending owner
- **02a** — ✅ catalog+detail+calendar (keyboard/aria) / availability mirrors §2.5 / admin CRUD is_admin-gated / DB concurrency proof in CI / live API smoke ALL PASS
- **02b** — 🔍 quote formula + clamp + dumpster flat-fee / reservation insert-retry / booking-fee PI + webhook → reserved (verified live, TEST Stripe) / delivery deferred (no Distance Matrix key)
- **03** — 🔍 license upload+review (live) / SignWell e-sign+webhook (override-safe, gated on templates) / release gate / handover V3-003 ordered deposit→balance→active + compensation + return + deposit settlement (verified live e2e, Stripe TEST) / save-card + admin POS
- **04** — ✅ reservation-confirmed email+SMS (consent + message_log idempotency) / dispatch (pickups/returns/deliveries) / condition photos (admin-only signed URLs) / unit swap (re-check + addendum gated) / CRM customer+message log
- **05** — ✅ unique per-town /rent/[town] (LocalBusiness JSON-LD) + /rent index + sitemap.xml (17 URLs) + robots.txt — verified live. ELM consented import deferred (needs source + A2P)
- **06** — 🔍 purge honors legal_hold (customer-scoped license incl. any held rental, V3-002) + storage-before-row + report-only orphan sweep / worker backoff→DLQ + `job_runs` dashboard / hold-expiry payment-shielded / rate-limit 429 + security headers / license re-encode — all import + unit-asserted; migration 0008 applies in CI db job (auto-globbed); worker not run on a live daemon
- **07** — 🔍 43 pytest units green (gate/deposit/delivery/webhook-idempotency/retention-hold/rate-limit/runner/hold-expiry) + existing pricing/availability; Playwright harness isolated in `/e2e` (smoke+SEO runnable now, §9.3 mutating journeys gated on `E2E_FULL`); viewport matrix 375/768/1440; RLS-escalation + last-unit concurrency remain the authoritative DB-level proofs in CI
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
| 2026-06-07 | P06: orphan-object sweep ships **report-only** (`delete=False`) | Mis-listing a private PII bucket is irreversible; windowed purges already cover the normal case. Flip to delete after the storage listing is validated in ops |
| 2026-06-07 | P06: background jobs run in a separate `worker` container (APScheduler) | Keeps retention/hold-expiry/SignWell-poll off the API request path; reuses the api image, command `python -m app.worker` |
| 2026-06-07 | P06: rate limiter fails **open** when Redis is down | Booking-flow availability beats strict throttling for this workload; logged. Redis is the prod source of truth, in-memory is the dev/test fallback |
| 2026-06-07 | P07: Playwright E2E lives in top-level `/e2e`, not `web/` | `web/tsconfig.json` globs `**/*.ts` into `next build`; isolating the harness keeps the web build + `npm ci`/`package-lock.json` untouched |

## Blocked Items

_(none yet — log `⏸️ BLOCKED` items here with the phase that must unblock them)_
