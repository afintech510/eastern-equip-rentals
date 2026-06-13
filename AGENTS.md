# Eastern Rentals — Agent / Operator Guide

Online heavy-equipment rental platform: catalog → availability calendar → reserve with a non-refundable booking fee → paperwork gate → handover.

## What this is

A Next.js web storefront + FastAPI backend for renting heavy equipment online. Supabase (managed) provides Postgres/Auth/Storage; Redis backs locks/rate-limiting/jobs; a separate worker process runs scheduled reconciliation jobs. Authoritative design docs live in the repo: `eastern-rentals-spec-v2.1.md` (LOCKED master spec), `eastern-rentals-sow-v1.3.md`, `eastern-rentals-buildplan.md`, and `eastern-rentals-progress.md`. Read those before changing schema, money rules, or theme.

## Stack

- **web/** — Next.js 14.2.5 (App Router, TypeScript) + Tailwind 3.4 + `next-intl`. `output: 'standalone'`. Supabase SSR client + Stripe.js. Import alias `@/*` → `web/src/*`.
- **api/** — FastAPI (Python 3.11), uvicorn (`app.main:app`). APScheduler for the worker.
- **worker** — same image as api, runs `python -m app.worker` (the APScheduler `BlockingScheduler`).
- **Supabase** (managed cloud) — Postgres + Auth + Storage with RLS. NOT a compose service.
- **Redis** 7-alpine — locks / rate limiting / job retry state.
- **Docker Compose** on a single Hetzner VPS behind a shared nginx reverse proxy.
- **Doppler** — runtime secrets; injected into a host `.env`. Secrets are never committed (`.env` is git-ignored).

## Where it runs

- **Host:** one Hetzner VPS — IP `5.161.88.134`, SSH alias `hampton-vps` (user `root`, key `~/.ssh/id_ed25519_headless`). Cloudflare sits in front.
- **App directory on VPS:** defaults to `/opt/eastern-rentals` (override via the `VPS_APP_DIR` repo secret). Each project on the box lives under `/opt/<name>`.
- **Public domain:** https://rentals.benchworksai.com
- **Proxy / network:** a shared nginx container `hampton_nginx` (owned by host-hampton-ops at `/opt/hosthampton`) terminates TLS. The prod override attaches `web` and `api` to that proxy's external docker network, declared as `hampton_nginx` → real name `hosthampton_hampton_net` (`external: true`). nginx resolves the app by container name.
- **Local ports:** web `3009` (container `:3000`), api `8009` (container `:8000`). Owner port convention reserves 3009 for this project (3003 maningo / 3005 benchworks / 3007 os-adam are taken).

## Run locally

Full stack with Docker (matches prod ports):

```bash
cp .env.example .env        # fill placeholders, or let Doppler inject
docker compose up --build
# web → http://localhost:3009
# api → http://localhost:8009/health
```

Run services directly (faster iteration):

```bash
# Web (dev server on :3000)
cd web && npm install && npm run dev

# API (reload)
cd api && pip install -r requirements.txt && uvicorn app.main:app --reload
```

Note: `.env.example` sets `NEXT_PUBLIC_BASE_URL=http://localhost:3009`; the compose web container always publishes on `3009`, while a bare `npm run dev` uses Next's default `3000`.

## Deploy

Production runs both compose files together (this is exactly what the deploy workflow runs on the VPS):

```bash
# On the VPS, from $VPS_APP_DIR (default /opt/eastern-rentals)
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

### GitHub Actions pipeline (`.github/workflows/`)

- **ci.yml** (name: `CI`) — runs on every push and PR. Three parallel jobs:
  - `web`: `npm ci`, `npm run lint`, `npm run format:check`, `npm run build` (with placeholder `NEXT_PUBLIC_*` env so the build is deterministic).
  - `api`: install `requirements.txt` + `ruff` + `pytest`; `ruff check app`; import smoke (`from app.main import app`); `python -m pytest -q`.
  - `db`: spins up `postgres:15`, bootstraps Supabase stubs (`supabase/ci/00_bootstrap_stub.sql`), applies every `supabase/migrations/*.sql` in order via psql, runs `supabase/seed.sql` twice (idempotency check), then `supabase/tests/phase01_acceptance.sql` and `supabase/tests/concurrency_test.sh`.
- **deploy.yml** (name: `Deploy`) — runs on push to `main` and `workflow_dispatch`. Job `build-test` re-runs the web lint+build and api ruff+import smoke (no pytest/db here), then job `deploy` (environment `production`):
  - **Gated:** checks that `SSH_HOST` and `SSH_PRIVATE_KEY` secrets are non-empty. If unset, it logs a notice and skips the SSH steps — runs green as a no-op so it never blocks merges before the VPS is provisioned.
  - When ready: SSH to the VPS (`appleboy/ssh-action`), `cd $VPS_APP_DIR`, `git fetch --all --prune`, `git reset --hard origin/main`, `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build`, `docker image prune -f`, `docker compose ps`.
  - Then a smoke test: `curl` `http://localhost:3009/` on the VPS with retries.
- **e2e.yml** (name: `E2E (Playwright)`) — `workflow_dispatch` only (pre-deploy, not on every push). Inputs: `base_url` (default `http://localhost:3009`) and `full`. Installs Playwright in `e2e/`, installs chromium, runs `npm test` against `E2E_BASE_URL`. Mutating journeys require `full=true` plus `E2E_TEST_USER_EMAIL` / `E2E_TEST_USER_PASSWORD` secrets. Uploads the Playwright report artifact.

## Database

- **Supabase managed cloud.** The project URL is in env as `SUPABASE_URL` (e.g. `https://<ref>.supabase.co`). The project ref is NOT hardcoded anywhere — `scripts/apply_remote_sql.py` derives it from `SUPABASE_URL` (the subdomain). Do not paste a ref into source.
- **Migrations:** `supabase/migrations/*.sql`, applied in filename order:
  - `0001_init_types` → `0002_tables` → `0003_exclusion_constraint` → `0004_functions_triggers` → `0005_rls` → `0006_config_and_storage` → `0007_stripe_customer` → `0008_jobs_and_retention` → `0009_product_photos_bucket`.
- **Apply migrations:**
  - Against live Supabase (uses `SUPABASE_PAT` + `SUPABASE_URL` from `.env`, via the Supabase Management API; values never echoed):
    ```bash
    python scripts/apply_remote_sql.py supabase/migrations/0001_init_types.sql
    python scripts/apply_remote_sql.py --query "select version();"
    ```
  - In CI: applied to an ephemeral `postgres:15` via psql (see `ci.yml` `db` job).
- **Seed:** `supabase/seed.sql` (idempotent — CI runs it twice).
- **Key tables** (`0002_tables.sql`): `customers`, `products`, `units`, `product_rates`, `rentals`, `payments`, `processed_webhook_events`, `license_uploads`, `rental_documents`, `condition_photos`, `delivery_quotes`, `message_log`, `towns`, `town_pages`, `config`, `audit_log`, `admin_users`.

## Environment & secrets

Secrets are sourced at runtime from **Doppler** and land in a git-ignored `.env` (locally and on the host). `.env.example` is the template — copy and fill. Never commit real values; never print secret values.

Required / used variable **names** (no values):

- **App:** `NODE_ENV`, `ENVIRONMENT`, `NEXT_PUBLIC_BASE_URL`, `NEXT_PUBLIC_API_URL`, `WEB_ORIGIN`
- **Supabase:** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`. (`scripts/apply_remote_sql.py` additionally reads `SUPABASE_PAT`; the `--create-user` path uses `SUPABASE_SERVICE_ROLE_KEY`.)
- **Redis:** `REDIS_URL`
- **Stripe (Phase 02b):** `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- **SignWell (Phase 03):** `SIGNWELL_API_KEY`, `SIGNWELL_WEBHOOK_SECRET`, `SIGNWELL_CONTRACT_TEMPLATE_ID`, `SIGNWELL_WAIVER_TEMPLATE_ID`
- **Email / Resend (Phase 03/04):** `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `ADMIN_NOTIFY_EMAIL`
- **Twilio SMS (Phase 04):** `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`
- **Delivery pricing:** `GOOGLE_DISTANCE_MATRIX_API_KEY` (api config also has a `YARD_ORIGIN` default), `APP_BASE_URL`

The api `Settings` (`api/app/config.py`) accepts alias pairs — e.g. `SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_URL`, `APP_BASE_URL` or `NEXT_PUBLIC_BASE_URL`. Integration vars default to empty and stay dormant until keys are provided.

### GitHub repo secrets used by CI/CD

- **Deploy (`deploy.yml`):** `SSH_HOST`, `SSH_PRIVATE_KEY` (gate), plus `SSH_USER`, and optionally `SSH_PORT` (default 22) and `VPS_APP_DIR` (default `/opt/eastern-rentals`).
- **E2E (`e2e.yml`):** `E2E_TEST_USER_EMAIL`, `E2E_TEST_USER_PASSWORD` (only needed for the mutating `full` run).
- **CI (`ci.yml`):** none — uses placeholder public env values inline.

## Cron / scheduled jobs

Run by the `worker` container (`app/jobs/scheduler.py`, APScheduler `BlockingScheduler`, UTC). Each run is wrapped in `run_with_retry` (backoff + dead-letter):

- **hold_expiry** — every **5 min**: release stale reservation holds so freed units reappear.
- **signwell_poll** — every **15 min**: safety net for missed SignWell webhooks (polls pending documents).
- **retention_purge** — daily **cron at 03:15 UTC**: data retention purge.

There is no host crontab; scheduling lives entirely in the worker process.

## Day-to-day cheat sheet

```bash
# Local full stack
docker compose up --build                       # web :3009, api :8009, redis, worker

# API health (locally)
curl http://localhost:8009/health

# Lint/format/build the web app (what CI checks)
cd web && npm run lint && npm run format:check && npm run build

# Lint + test the api (what CI checks)
cd api && ruff check app && python -m pytest -q

# Run the worker/scheduler standalone
cd api && python -m app.worker

# Apply a migration to live Supabase (reads .env, never echoes secrets)
python scripts/apply_remote_sql.py supabase/migrations/0009_product_photos_bucket.sql

# SSH to the box and check running containers
ssh hampton-vps "cd /opt/eastern-rentals && docker compose -f docker-compose.yml -f docker-compose.prod.yml ps"
```

## Key files

- `docker-compose.yml` — local stack (web, api, worker, redis) + `eastern_net` bridge net.
- `docker-compose.prod.yml` — VPS override; bakes `NEXT_PUBLIC_BASE_URL=https://rentals.benchworksai.com` into the web build and joins the external `hampton_nginx` proxy net.
- `.github/workflows/ci.yml` / `deploy.yml` / `e2e.yml` — CI, SSH deploy, Playwright E2E.
- `api/app/main.py` — FastAPI app; `/health`; config-completeness boot gate (refuses to boot in production if the Supabase `config` singleton is incomplete).
- `api/app/config.py` — `Settings` (env var names + alias choices).
- `api/app/jobs/scheduler.py` / `api/app/worker.py` — scheduled jobs + worker entrypoint.
- `supabase/migrations/` — schema (apply in order); `supabase/seed.sql`; `supabase/tests/` (acceptance + concurrency); `supabase/ci/00_bootstrap_stub.sql` (CI-only Supabase stubs).
- `scripts/apply_remote_sql.py` — apply SQL / run queries / create admin users against live Supabase via the Management + Auth Admin APIs.
- `.env.example` — env template. `CLAUDE.md` / `README.md` — quick guides; `eastern-rentals-spec-v2.1.md` — LOCKED master spec.

## Gotchas / operational rules

- **Never commit or print secrets.** `.env` is git-ignored and Doppler-sourced. `apply_remote_sql.py` deliberately never echoes the PAT, service-role key, or created-user passwords — keep it that way.
- **Theme is LOCKED** (spec §4.5, industrial/heavy-equipment): `ind-*` tokens, four fonts (Black Ops One / Teko / Saira / Share Tech Mono), `shadow-heavy`, hazard stripes, rotating-gear header. Don't invent colors/fonts. Only the brand logo changes later.
- **Money/business rules come from spec §3.2** — prototype HTML numbers (`eastern_rentals_prototype_v*.html`) are MOCK; ignore them.
- **Production boot gate:** when `ENVIRONMENT=production`, the api refuses to start unless Supabase is configured and the DB `config` singleton is complete (`config_is_complete()` RPC). Make sure the `config` row is seeded before deploying.
- **Migrations must be ordered + idempotent.** CI applies all `*.sql` in filename order and seeds twice — preserve the numeric prefix scheme and `IF NOT EXISTS` style.
- **Deploy is `git reset --hard origin/main`** on the VPS — anything uncommitted on the host is wiped. Don't hand-edit files in `/opt/eastern-rentals`.
- **Deploy's build-test gate skips pytest and the DB job** (only `ci.yml` runs those). Don't assume a green deploy implies tests passed — rely on the push/PR CI run.
- **Prod requires the external proxy net.** `hosthampton_hampton_net` must already exist (created by the host-hampton-ops stack) or the prod compose up fails. The shared `hampton_nginx` container, not this stack, terminates TLS.
- **Redis is ephemeral** (`--save "" --appendonly no`) — do not rely on it for durable state; it's locks/rate-limiting/job-retry only.
- **Default branch is `main`** (remote `origin` → `github.com/afintech510/eastern-equip-rentals`). Push to `main` triggers CI + deploy.
