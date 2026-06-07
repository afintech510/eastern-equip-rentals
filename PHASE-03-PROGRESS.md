# PHASE-03 PROGRESS — Accounts, Paperwork, Release Gate & Handover

**Status:** 🔨 PART 1 COMPLETE (paperwork) · **Date:** 2026-06-07 · **Spec:** v2.1
**Implements (part 1):** F-012, F-013, F-014, F-015, F-016, F-017, F-018, H-004, M-005

> Phase 03 is split: **Part 1 (this round)** = accounts + license + e-sign + release gate.
> **Part 2 (next round)** = handover transaction (V3-003) + deposit settlement (F-007b/008/027).
> Human review gate after the full phase.

## Part 1 — built & status

### Backend
- `account.py` — `GET/PATCH /me` (safe profile cols), `POST /license` (Storage path → `license_uploads` + `license_status=pending` + admin notify), `GET /me/rentals`.
- `documents.py` — `send_rental_documents()` (post-payment, idempotent; fired from the Stripe success webhook) + `GET /rentals/{id}/documents` (fresh signing URLs).
- `admin_ops.py` — `GET /admin/licenses`, `POST /admin/licenses/{id}/decision` (sets `license_status`, recomputes the gate for the customer's rentals, notifies), `POST /admin/documents/{id}/override`.
- `webhooks.py` — `POST /webhooks/signwell` (HMAC verify + re-fetch defense + idempotency + `document.completed` → flags, **completed-after-override safe**).
- `services/gate.py` — `recompute_and_advance` (reserved → ready_for_pickup when paid+license+contract+waiver), `recompute_for_customer`.
- `services/storage.py` — 300s signed URLs (§7.3). `signwell.py` (maningo port). `email.py` (Resend REST + `message_log` idempotency REV-020).

### Frontend
- `/account` — profile edit, **license upload** to the private bucket, my-rentals list.
- `/admin/licenses` — review queue with signed-URL image view + approve/reject.
- What's Next (confirmation) — contract/waiver **Sign Now** links + license prompt. EN/ES throughout.

### Verified LIVE (production)
- **License flow e2e:** upload (owner Storage RLS) → register → admin queue (signed view URL) → approve → `license_status=approved` + gate recomputed → cleanup. ✅
- api ruff + 11 tests + import (30 routes); web lint + build green.

## Owner setup still needed for e-sign / email

| Item | Where | Status |
|------|-------|--------|
| `SIGNWELL_API_KEY` | local + VPS `.env` | ✅ added |
| `SIGNWELL_CONTRACT_TEMPLATE_ID` | create a **Contract** template in SignWell → add id | ⏳ needed |
| `SIGNWELL_WAIVER_TEMPLATE_ID` | create a **Waiver** template in SignWell → add id | ⏳ needed |
| SignWell template merge field `unit_serial` (api_id) | on both templates (renter + serial merge) | ⏳ needed |
| SignWell webhook | dashboard → `https://rentals.benchworksai.com/api/v1/webhooks/signwell`; set `SIGNWELL_WEBHOOK_SECRET` | ⏳ needed |
| `RESEND_API_KEY` (+ `RESEND_FROM_EMAIL`, `ADMIN_NOTIFY_EMAIL`) | local + VPS `.env` | ⏳ owner adding |

Until templates exist, document creation is a logged no-op (flow never blocks). Until Resend is set, emails are logged no-ops. `test_mode: true` is set on SignWell doc creation — flip to false at pre-launch.

## Part 2 — COMPLETE (2026-06-07) — handover (V3-003)

Owner chose **save card at booking + manual entry**, unified via the saved card.

- **migration 0007**: `customers.stripe_customer_id`.
- **Reservation** now saves the card (`setup_future_usage=off_session` + Stripe Customer).
- `POST /admin/rentals/{id}/handover` — gate-enforced; **ordered deposit → balance → active** (V3-003): deposit hold (≤5d, manual-capture auth) / charge (>5d) FIRST; balance card-on-file(+3.5%)/cash/other; **active flip is the last committed write**; **compensation** releases the deposit if a card balance fails.
- `POST /admin/rentals/{id}/setup-card` (SetupIntent → tablet PaymentElement = "manual entry" / different card), `…/return`, `…/deposit` (capture/release/refund, F-027). Webhook `charge.refunded` sync (REV-032).
- **Admin POS UI**: `/admin/rentals` dispatch list + `/admin/rentals/[id]` (gate checklist, card-on-file + add/replace card, balance method, Complete Handover, Mark Returned, deposit capture/release/refund).

**Verified live e2e (Stripe TEST):** reserve (card saved) → pay → gate → handover → `active` (deposit $315 **held**, balance charged off-session) → return → deposit **released**.

> Note: in the live test the contract/waiver gate flags were simulated (SignWell templates not yet configured). In production those are set by real SignWell signing once templates + webhook are added (see part-1 table). Human review gate now applies to the full phase.
