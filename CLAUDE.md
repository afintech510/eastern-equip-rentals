# Eastern Rentals — Agent Guide

Online heavy-equipment rental platform. Reserve iron online: catalog → availability
calendar → reserve with a non-refundable booking fee → paperwork gate → handover.

## Source of truth (read before building)
- `eastern-rentals-spec-v2.1.md` — master spec, **LOCKED**. Authoritative for schema, API, theme, money rules.
- `eastern-rentals-sow-v1.3.md` — signed SOW (features F-001…F-030).
- `eastern-rentals-buildplan.md` — phase sequencing, traceability, risk register.
- `eastern-rentals-phase-NN-*.md` — per-phase operator prompts. Build ONE phase per session.
- `eastern-rentals-progress.md` — live phase status + decision log. Update as phases land.

## Stack
- **web/** — Next.js 14 (App Router, TS) + Tailwind + `next/font` (Google Fonts). `output: 'standalone'`.
- **api/** — FastAPI (Python 3.11), uvicorn.
- **Supabase** (managed) — Postgres + Auth + Storage (RLS). Not a compose service.
- **Redis** — locks / rate limiting / jobs.
- **Docker Compose** on a Hetzner VPS behind the shared `hampton_nginx` reverse proxy.
- **Doppler** — runtime secrets. Never commit secrets; `.env` is git-ignored.

## Layout
```
web/   Next.js app (src/app, src/components, src/lib)
api/   FastAPI app (app/main.py = /health; app/config.py = settings)
docker-compose.yml          local stack (web :3009, api :8009, redis)
docker-compose.prod.yml     VPS override (joins hampton_nginx proxy net)
.github/workflows/          ci.yml (lint+build), deploy.yml (SSH deploy)
```

## Local dev
- Web: `cd web && npm install && npm run dev` (http://localhost:3000)
- API: `cd api && pip install -r requirements.txt && uvicorn app.main:app --reload`
- Full stack: copy `.env.example` → `.env`, then `docker compose up --build` (web on :3009).

## Conventions
- **Theme is LOCKED** (spec §4.5, "industrial / heavy-equipment"). `ind-*` color tokens,
  four fonts (Black Ops One / Teko / Saira / Share Tech Mono), `shadow-heavy`, hazard stripes,
  the rotating-gear header. Only the brand logo changes later. Don't invent colors/fonts.
- Money/business rules come from spec §3.2 — the prototype's numbers are MOCK, ignore them.
- Web: ESLint (`next/core-web-vitals`) + Prettier (single quotes, trailing commas, width 100).
- API: ruff + black, line length 100.
- Import alias `@/*` → `web/src/*`.

## Deploy
- Port convention: **3009** (3003 maningo / 3005 benchworks / 3007 os-adam already taken).
- `deploy.yml` runs on push to `main`: build/test gate → SSH to VPS → `docker compose -f
  docker-compose.yml -f docker-compose.prod.yml up -d --build`. The SSH step is gated on the
  `SSH_*` repo secrets existing (no-op until the VPS target is provisioned).

## Phase model
Build sequentially: 00 → 01 → 02a → 02b → 03 → 04 (05 parallel after 02a) → 06 → 07 → 08.
Human review gates after 01 (schema/RLS), 02b (money), 03 (gate/handover), and before 08 (deploy).
Current state: **Phase 00 complete** (foundation + theme). Phase 01 (schema & auth) is next.
