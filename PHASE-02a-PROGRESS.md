# PHASE-02a PROGRESS — Catalog, Inventory & Availability

**Status:** ✅ COMPLETE · **Date:** 2026-06-07 · **Spec:** v2.1 (LOCKED)
**Implements:** F-001, F-002, F-003, F-004, F-005, F-026

## Files Created

### Backend (FastAPI)
| Path | Purpose |
|------|---------|
| `api/app/supa.py` | service-role + anon Supabase client factories |
| `api/app/deps.py` | `get_current_user_id` (validate JWT via GoTrue) + `require_admin` (re-check `admin_users`, §3.1/§7.2) |
| `api/app/schemas.py` | Pydantic models (product/availability/calendar + admin CRUD inputs) |
| `api/app/services/availability.py` | availability engine — **pure** overlap/calendar logic + DB wrappers; mirrors the §2.5 inclusive exclusion rule exactly |
| `api/app/routers/catalog.py` | `GET /products`, `/products/{id}`, `/products/{id}/availability`, `/products/{id}/calendar` (public) |
| `api/app/routers/admin_inventory.py` | products/units/rates CRUD (`require_admin`); `active` blocked unless `config.deposit_percent` set |
| `api/tests/test_availability.py` | unit tests for next-day/same-day/multi-unit/calendar logic |

### Frontend (Next.js)
| Path | Purpose |
|------|---------|
| `web/src/lib/api.ts` | typed API client (server/browser base resolution) |
| `web/src/lib/admin-api.ts` | admin fetch helper (attaches session bearer) |
| `web/src/app/equipment/page.tsx` | catalog grid + category filters (active only) |
| `web/src/components/catalog/ProductCard.tsx` | fleet card |
| `web/src/app/equipment/[productId]/page.tsx` | detail (specs/rate/photo) + calendar |
| `web/src/components/catalog/AvailabilityCalendar.tsx` | `cal-day` states, keyboard grid (arrows/Enter), `aria-live` range announcements; reserve action stubbed → 02b |
| `web/src/app/admin/layout.tsx` | guards `/admin/*` via `is_admin()` RPC |
| `web/src/app/admin/inventory/page.tsx` + `web/src/components/admin/InventoryManager.tsx` | product/unit/rate CRUD UI |

### Files Modified
- `api/app/main.py` — include catalog + admin routers.
- `api/app/config.py` — anon key via `AliasChoices` (reads `NEXT_PUBLIC_SUPABASE_ANON_KEY`).
- `web/src/app/account/page.tsx` — admin-only "Open Yard Office" link.
- `.github/workflows/ci.yml` — api job runs `pytest`; db job runs the concurrency proof.
- `supabase/tests/concurrency_test.sh` — F-004 parallel-insert proof.

## Acceptance Criteria

| Criterion | Result | Evidence |
|-----------|--------|----------|
| Build + lint clean; no schema change | ✅ | `npm run lint`/`build` green (13 routes); no migrations added |
| Concurrency: N overlapping inserts on one unit → exactly one wins; two free units → both succeed | ✅ | `concurrency_test.sh` in CI `db` job |
| Catalog shows only active; filters work | ✅ | `/products` filters `active=true`; category param |
| Detail shows specs/rate/photo + calendar | ✅ | `/equipment/[productId]` |
| availability & calendar correct; next-day bookable, same-day blocked | ✅ | `test_availability.py` (pure logic) + live smoke |
| Calendar never shows a day the constraint would reject | ✅ | read uses identical inclusive-overlap rule + identical blocking-status set as the constraint |
| Admin CRUD works and is `is_admin()`-gated (401/403 without admin) | ✅ | live smoke: `/admin/products` no token → 401; layout guards via `is_admin()` |
| Theme at 375/768/1440; calendar keyboard + announcements | ✅ | industrial theme classes; roving-tabindex grid + `aria-live` |

**Live integration smoke (PG against the real Supabase project), ALL PASS:**
`GET /products`→7; availability→`{available:true}`; calendar→31 days; over-max span→400; admin no-token→401.

## Decisions Made
- **Availability is server-side (FastAPI + service role)** because `units`/`rentals` are admin-only at RLS — the public can't read them directly. Read rule mirrors the constraint (inclusive overlap + same non-cancelled/expired status set) so calendar and DB never disagree.
- **Pure/IO split** in `availability.py` so the next-day logic is unit-tested without a DB.
- API base resolves to `API_INTERNAL_URL` server-side (docker) and `NEXT_PUBLIC_API_URL` in the browser.
- `_smoke_phase02a.py` kept as a dev aid (runs endpoints vs live; not in CI).

## Spec Ambiguities
- `// SPEC-AMBIGUITY:` calendar "day map" shape unspecified — returns `{month,total_units,days:[{date,available,units_free}]}`.

## Blocked Items
- None. (Doppler mirroring of creds still pending for CI/prod — carried from Phase 01.)

## Warnings for Next Phase (02b — Reservation, Quote & Booking-Fee Payment)
- **Reservation insert-retry (REV-003):** pick a free unit via `units_free_for_span`/`_available_unit_ids`, attempt INSERT; on `exclusion_violation` (Postgres `23P01`) retry next free unit; `409 UNIT_UNAVAILABLE` only when none succeed. The DB guarantee is proven by `concurrency_test.sh`.
- Availability service entry points for 02b: `app.services.availability.units_free_for_span(svc, product_id, start, end)` and `_available_unit_ids`.
- The calendar surfaces a selected range via `onRangeChange({start,end})` — wire this into the 02b checkout (`/reserve/[productId]`).
- Quote endpoint (`POST /quote`) + reservation (`POST /reservations`) + Stripe booking fee are 02b; money formula incl. clamp + dumpster `percent_down` per §3.2.
- `require_admin` dependency is ready for all future `/admin/*` endpoints.
