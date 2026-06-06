# PHASE-00 PROGRESS — Environment & Theme Foundation

**Status:** ✅ COMPLETE · **Date:** 2026-06-06 · **Spec:** v2.1 (LOCKED)

## Files Created

| Path | Purpose |
|------|---------|
| `docker-compose.yml` | Local stack: `web` (:3009→3000), `api` (:8009→8000), `redis` 7 |
| `docker-compose.prod.yml` | VPS override — joins shared `hampton_nginx` proxy network |
| `.env.example` | Every env var documented; secrets via Doppler (none committed) |
| `.gitignore` | Node/Next, Python, Docker, secrets |
| `README.md`, `CLAUDE.md` | Human + agent project guides |
| `web/package.json` … `web/tsconfig.json` | Next.js 14 + TS toolchain |
| `web/tailwind.config.ts` | `ind-*` tokens, `font-*` families, `shadow-heavy*`, `powerOn` (§4.5) |
| `web/postcss.config.mjs`, `web/.eslintrc.json`, `web/.prettierrc` | Build/lint/format |
| `web/Dockerfile`, `web/.dockerignore` | Multi-stage, non-root, standalone, healthcheck |
| `web/src/lib/fonts.ts` | Black Ops One / Teko / Saira / Share Tech Mono via `next/font` |
| `web/src/lib/supabase/client.ts` | Browser client wiring (construction only) |
| `web/src/app/globals.css` | §4.5 component layer (btn-*, card-ind, input-ind, hazard, calendar, scrollbar, noise) |
| `web/src/app/layout.tsx` | Root shell: fonts, header, footer, mobile nav |
| `web/src/app/page.tsx` | Placeholder "powered up" catalog empty state |
| `web/src/components/layout/{Header,Footer,MobileNav}.tsx` | Sticky black header w/ rotating gear, "Yard: ONLINE" pill, mobile bottom nav |
| `api/requirements.txt`, `api/pyproject.toml` | FastAPI deps + ruff/black config |
| `api/Dockerfile`, `api/.dockerignore` | Multi-stage, non-root, healthcheck |
| `api/app/main.py` | `GET /health` 200 + CORS + Supabase client wiring |
| `api/app/config.py` | pydantic-settings (env-sourced) |
| `.github/workflows/ci.yml`, `deploy.yml` | CI gate + SSH deploy (spec §1.3) |

## Acceptance Criteria

| Criterion | Result | Evidence |
|-----------|--------|----------|
| `web` builds; lint clean | ✅ | `npm run lint` → no warnings/errors; `npm run build` → compiled, 4 static pages, standalone output |
| Theme tokens/fonts/components resolve | ✅ | Tailwind config + globals.css ported verbatim from approved prototype v1; `next/font` fetched all 4 families at build |
| Themed shell renders (gear, pill, hazard edge) | ✅ | Header/Footer/MobileNav components; rotating gear `animate-[spin_10s_linear_infinite]` |
| Responsive + mobile bottom nav | ✅ | `pb-20 md:pb-0`, `MobileNav` is `md:hidden fixed bottom-0` |
| a11y baseline | ✅ | gear `aria-hidden`, focus-visible outline, labeled nav, `aria-current` |
| API `/health` 200 | ✅ (code) | `GET /health` → `{"status":"ok"}`; `py_compile` + import smoke pass |
| No secrets in source | ✅ | `.env` git-ignored; `.env.example` placeholders only; pre-commit scan clean |
| `docker compose up` boots all 3 | ⚠ not run locally | Docker Desktop daemon down on build host; images build in CI. Compose structure mirrors proven maningo/benchworks stacks |

## Decisions Made
- **Package manager:** npm (matches sibling builds; `package-lock.json` committed).
- **Layout:** monorepo `web/` + `api/`; Next.js `src/app/*` per spec §4.1.
- **Port:** `3009` (3003/3005/3007 already taken by maningo/benchworks/os-adam).
- **Local vs prod compose split:** base compose runs standalone locally; `docker-compose.prod.yml` adds the external `hampton_nginx` network so local boot doesn't require the VPS proxy net.
- **Fonts:** `next/font` with CSS variables wired to Tailwind `fontFamily` tokens (not CDN `<link>`).

## Spec Ambiguities
- `// SPEC-AMBIGUITY:` §1.3 says "local (port 3007)" but 3007 is taken by os-adam on the shared VPS. Used **3009** to avoid collision; flag for owner confirmation at Phase 08.

## Blocked Items
- None.

## Warnings for Next Phase (01 — Schema & Auth)
- Theme component classes available globally: `btn-primary/secondary/outline`, `card-ind`, `input-ind`, `hazard-stripes(-light)`, `calendar-grid`/`cal-day` states, `animate-powerOn`.
- Supabase project ref not yet set — populate `SUPABASE_URL`/keys via Doppler before Phase 01 migrations.
- `web/src/lib/supabase/client.ts` exists (browser client). Phase 01 adds the SSR/server client + middleware.
- Migrations location TBD — suggest `supabase/migrations/` at repo root (sibling convention).
- Docker images not yet built/run on a live daemon — validate `docker compose up` on a host with Docker before relying on the full stack.
