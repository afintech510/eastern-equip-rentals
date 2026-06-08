# Eastern Rentals — E2E (Playwright)

Browser end-to-end tests for the §9.3 critical journeys. Kept **outside** `web/`
so the `@playwright/test` dependency can't perturb the Next.js type-check/build or
`web/package-lock.json`.

## Layout

- `smoke.spec.ts` — theme shell + catalog reachability + security headers. No data
  or auth required. Runs against any live deployment.
- `town-seo.spec.ts` — a town page emits `LocalBusiness` JSON-LD; sitemap/robots
  served (F-024).
- `critical-journeys.spec.ts` — the MUST/SHOULD journeys (reserve→pay, handover,
  license/e-sign/gate, concurrency, delivery reject). Mutating + auth'd, so gated
  behind `E2E_FULL=1` and test credentials.

## Run

```bash
cd e2e
npm install
npm run install:browsers        # one-time: chromium + deps

# Smoke + SEO only, against a running stack (web on :3009):
E2E_BASE_URL=http://localhost:3009 npm test

# Full journeys (seeded test user, Stripe TEST keys, SignWell sandbox):
E2E_FULL=1 \
E2E_BASE_URL=https://staging.example \
TEST_USER_EMAIL=... TEST_USER_PASSWORD=... \
npm test
```

Viewport matrix (375 / 768 / 1440) is configured as three projects, per §9.3.

The authoritative **last-unit concurrency proof (C-002)** is the DB-level test
`supabase/tests/concurrency_test.sh`, which runs in CI; the UI journey here is the
echo, not the source of truth.
