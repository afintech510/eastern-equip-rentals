# Eastern Rentals

Online heavy-equipment rental platform — reserve iron online (catalog → availability →
booking fee → paperwork gate → handover).

**Stack:** Next.js 14 (web) · FastAPI (api) · Supabase (Postgres/Auth/Storage) · Redis ·
Docker Compose on a Hetzner VPS behind nginx · Doppler for secrets.

## Quick start (local)

```bash
cp .env.example .env        # fill placeholders (or let Doppler inject)
docker compose up --build   # web → http://localhost:3009 · api → http://localhost:8009/health
```

Or run services directly:

```bash
cd web && npm install && npm run dev      # http://localhost:3000
cd api && pip install -r requirements.txt && uvicorn app.main:app --reload
```

## Repo layout

| Path | Purpose |
|------|---------|
| `web/` | Next.js 14 App Router app (industrial theme, spec §4.5) |
| `api/` | FastAPI service (`/health`, Supabase wiring) |
| `docker-compose.yml` | Local stack (web `:3009`, api `:8009`, redis) |
| `docker-compose.prod.yml` | VPS override — joins shared `hampton_nginx` proxy net |
| `.github/workflows/` | `ci.yml` (lint + build), `deploy.yml` (SSH deploy to Hetzner) |
| `eastern-rentals-*.md` | Spec (LOCKED), SOW, build plan, phase prompts, progress |

## Build status

Phase 00 (environment + theme foundation) complete. See `eastern-rentals-progress.md`.

## Deployment

`deploy.yml` runs on push to `main`. Configure these repo secrets to activate the SSH deploy:
`SSH_HOST`, `SSH_USER`, `SSH_PRIVATE_KEY`, and optionally `SSH_PORT`, `VPS_APP_DIR`
(default `/opt/eastern-rentals`). App secrets are sourced from a Doppler-synced `.env` on the host.
