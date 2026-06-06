# Phase 00: Environment & Theme Foundation
**Project:** Eastern Rentals
**Spec:** `eastern-rentals-spec.md`
**Build Plan:** `eastern-rentals-buildplan.md`
**Prerequisites:** None
**Implements:** Infrastructure + §4.5 design system
**Recommended:** `claude --max-turns 25`

---

## 1. Context

You are executing **Phase 00: Environment & Theme Foundation** of the Eastern Rentals build — an online heavy-equipment rental platform.

**Your scope is strictly this phase.** Do not implement features, database tables, auth, or business logic — those are later phases. This phase produces a clean, reproducible, themed shell that everything else builds on.

**Tech Stack (spec §1.2):** Next.js (App Router) + TypeScript + Tailwind CSS + Google Fonts (`next/font`); FastAPI (Python) backend; Supabase/PostgreSQL + Supabase Auth + Supabase Storage; Redis (locks/jobs); Docker; deployed on a Hetzner VPS behind Caddy/nginx.
**Working Directory:** project root (create it).
**Spec File:** `eastern-rentals-spec.md` — READ FIRST, especially §1.2 (stack), §1.3 (deployment/DR), §4.1 (structure), §4.4 (routing), **§4.5 (Visual Design System — the approved theme)**.

### What Already Exists
Nothing — this is the first phase. You are scaffolding from zero.

### What You're Building
A Dockerized monorepo (Next.js web + FastAPI api + Redis; Supabase is managed) that boots with `docker compose up`, plus the approved **industrial/heavy-equipment theme** wired into Tailwind and an app shell that renders the sticky black header with the **rotating gear** and the four brand fonts. No features yet — just the foundation and the look.

## Skills Reference (read before building UI)
- `view /mnt/skills/public/frontend-design/SKILL.md` — follow its design principles for the shell/theme.
- Then read spec **§4.5** — it defines the exact tokens, fonts, components, and motifs. §4.5 is authoritative; `frontend-design` is the quality bar.

---

## 2. Objective & Deliverables

### Objective
After this phase, `docker compose up` starts web + api + redis cleanly; the Next.js app renders a themed shell (industrial tokens, the four fonts loaded, the rotating-gear header, concrete-noise background) at the configured port; FastAPI answers `/health`; Supabase connectivity is verified; and no secrets live in the repo (Doppler-sourced).

### Deliverables
1. Monorepo scaffold per spec §4.1 (web/ + api/ or equivalent) — §4.1
2. `docker-compose.yml` (web, api, redis) + per-service Dockerfiles (multi-stage, non-root) — §1.2/1.3
3. `.env.example` documenting every required var; secrets sourced via **Doppler** (no secrets committed) — §1.2
4. Tailwind config with the `ind-*` color tokens, `font-*` families, and `shadow-heavy*` per §4.5
5. Global CSS component layer (`btn-primary/secondary/outline`, `card-ind`, `input-ind`, `hazard-stripes`, calendar classes, `powerOn`, custom scrollbar) per §4.5
6. Fonts via `next/font` (Black Ops One, Teko, Saira, Share Tech Mono) — §4.5
7. App shell: sticky black header w/ hazard top-edge + **rotating gear** + wordmark placeholder + nav + "Yard: ONLINE" pill; mobile fixed bottom nav; `max-w-7xl` content; themed footer — §4.5
8. FastAPI app with `GET /health` (200) and Supabase client wiring (read a public env var; no schema yet) — §1.2
9. `PHASE-00-PROGRESS.md`

---

## 3. Implementation Instructions

### Task 1: Repo scaffold & tooling
**Spec Reference:** §4.1, §1.2 · **Creates:** monorepo dirs, package manifests, lint/format config
Scaffold the Next.js (App Router, TS) web app and the FastAPI service in the structure of §4.1. Pin to the major versions in §1.2. Set up ESLint/Prettier (web) and ruff/black (api). No business code.

### Task 2: Docker Compose + Dockerfiles
**Spec Reference:** §1.2, §1.3 · **Creates:** `docker-compose.yml`, `web/Dockerfile`, `api/Dockerfile`
Compose services: `web` (Next.js), `api` (FastAPI/uvicorn), `redis`. Supabase is managed (not a compose service) — wire via env. Multi-stage builds, non-root users, healthchecks. `docker compose up` must boot all three with no errors.

### Task 3: Secrets via Doppler + `.env.example`
**Spec Reference:** §1.2, §7.3 · **Creates:** `.env.example`, Doppler wiring
Document every var (Supabase URL/anon/service keys, Redis URL, and placeholders for Stripe/Twilio/Resend/Google/SignWell to be filled in later phases). Secrets injected at runtime from Doppler; **nothing secret committed**. The repo must pass a "no secrets in source" check.

### Task 4: Tailwind theme tokens + component layer (§4.5)
**Spec Reference:** §4.5 · **Creates:** `tailwind.config.ts`, `app/globals.css`
Port §4.5 exactly: colors `ind-yellow #FFCC00`, `ind-black #111111`, `ind-concrete #D1D5DB`, `ind-steel #6B7280`, `ind-danger #DC2626`, `ind-white #F3F4F6`; fonts `font-stencil/heading/body/mono`; `shadow-heavy` (`6px 6px 0 #111`), `shadow-heavy-sm`, `shadow-heavy-active`. Build the component layer (`btn-*`, `card-ind`, `input-ind`, `hazard-stripes`/`-light`, `calendar-grid`/`cal-day` states, `powerOn` keyframe, custom scrollbar). Concrete-noise background on `body`.
Key notes:
- Load fonts with `next/font` (not CDN `<link>`) for production performance.
- These are tokens/components only — do not build feature pages.

### Task 5: App shell
**Spec Reference:** §4.5, §4.4 · **Creates:** `app/layout.tsx`, header/footer/bottom-nav components
Sticky black header: hazard top-edge, **rotating gear** (`animate-[spin_10s_linear_infinite]`, `ind-yellow`), wordmark **placeholder** (final logo asset pending — keep the gear + type lockup), nav ("Inventory"/"Active Jobs"), "Yard: ONLINE" status pill. Mobile fixed bottom nav (`pb-20 md:pb-0`). Footer. A placeholder home/catalog route that renders the shell with a "powered up" empty state.
Key notes:
- **Only the logo changes** later — keep the rotating gear and the industrial type lockup.
- Apply the §4.2/§4.5 a11y baseline even now: header nav is keyboard-operable, gear is decorative (`aria-hidden`), focus is visible.

### Task 6: FastAPI health + Supabase wiring
**Spec Reference:** §1.2 · **Creates:** `api/main.py`, health route
`GET /health` → `{ "status": "ok" }` (200). Initialize a Supabase client from env (no tables yet — just verify the client constructs and the URL is reachable). CORS configured for the web origin.

**Task ordering note:** 1 → 2/3 (parallel-ish) → 4 → 5 → 6. Theme (4) before shell (5).

---

## 4. Acceptance Criteria

### Automated
- [ ] `docker compose up` starts web, api, redis with no errors
- [ ] `web` builds: `npm run build` succeeds; lint clean
- [ ] `api` starts; `GET /health` returns 200 `{status:"ok"}`
- [ ] No secrets present in source (grep for keys returns nothing; `.env` git-ignored)

### Functional / Visual
- [ ] Web renders the themed shell at the configured port: black sticky header, hazard top-edge, **gear visibly rotating**, "Yard: ONLINE" pill
- [ ] All four fonts load (Black Ops One stencil wordmark, Teko headings, Saira body, Share Tech Mono labels) via `next/font`
- [ ] `ind-*` tokens and `shadow-heavy` resolve (a sample `btn-primary` shows yellow-on-black w/ offset shadow and presses on `:active`)
- [ ] Concrete-noise background visible; custom scrollbar styled
- [ ] Renders at 375 / 768 / 1440px; mobile shows the fixed bottom nav
- [ ] Keyboard focus visible on header nav; gear is `aria-hidden`

---

## 5. Constraints

### Hard (violation = phase failure)
- Stack exactly per §1.2 — no library substitutions.
- Theme tokens/fonts/components exactly per §4.5 — do not invent colors or fonts.
- **Do NOT** create database tables, auth, or any feature logic — that's Phase 01+.
- No secrets committed; Doppler-sourced runtime config only.

### Soft (document deviations)
- Follow §4.1 structure; if you add dirs, document why in the completion report.
- The prototype's mock numbers (8.625% tax, 10% discount, $500 deposit) are NOT used — ignore them; this phase has no pricing anyway.
- Mark spec gaps `// SPEC-AMBIGUITY: …`; blocked items `// BLOCKED: …`.

---

## 6. Completion Protocol

Provide: **Files Created** (table), **Files Modified** (table), **Acceptance Criteria Results** (table w/ evidence), **Spec Ambiguities**, **Blocked Items**, **Decisions Made** (e.g., package manager, dir layout), and **Warnings for Next Phase** (e.g., "Supabase project ref X; migrations go in `api/migrations/`; theme component classes available at …").

---

## 7. Execution & Orchestration

**Run:** `claude --max-turns 25`. If turn-limited, the human re-invokes `claude --continue`.
**Plan first:** read spec §1.2/1.3/4.1/4.4/4.5 and `frontend-design` SKILL → scaffold → docker → theme → shell → health.
**Resumption (--continue):** re-read this prompt; inspect the filesystem and `PHASE-00-PROGRESS.md`; resume at the first incomplete task; do not re-scaffold completed work.
**Decision authority:** spec defines → follow; silent → reasonable choice + `// SPEC-AMBIGUITY`; contradictory → `// ESCALATE` + skip.
**Progress:** after each task, update `PHASE-00-PROGRESS.md` in the project root.
