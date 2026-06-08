-- ============================================================
-- Phase 06 · Migration 0008 — Background jobs, DLQ & retention support
-- Backs the worker reliability story (REV-023): every job run is recorded in
-- job_runs (for the admin dashboard so silent accumulation surfaces), and a run
-- that exhausts its retries is dead-lettered into dead_letter_jobs for manual
-- inspection/replay. license_uploads.purge_after is backfilled so the retention
-- purge (V3-002) has a window to act on.
-- Both tables are service/admin-only — the worker writes via service role
-- (bypasses RLS); admins read through the backend. Manual rollback:
--   DROP TABLE dead_letter_jobs, job_runs CASCADE;
-- ============================================================

-- ---------- job_runs (REV-023 — observability) ----------
CREATE TABLE IF NOT EXISTS job_runs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name     text NOT NULL,
  status       text NOT NULL DEFAULT 'running'
                 CHECK (status IN ('running','succeeded','failed','dead_lettered')),
  attempt      int NOT NULL DEFAULT 1,
  started_at   timestamptz NOT NULL DEFAULT now(),
  finished_at  timestamptz,
  duration_ms  int,
  processed    int NOT NULL DEFAULT 0,
  skipped      int NOT NULL DEFAULT 0,
  error        text,
  detail_json  jsonb
);
CREATE INDEX IF NOT EXISTS idx_job_runs_name_started ON job_runs (job_name, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_job_runs_status ON job_runs (status);

-- ---------- dead_letter_jobs (REV-023 — DLQ) ----------
-- A job that fails every retry lands here. resolved_at is set when an admin
-- replays or dismisses it, so the dashboard can show an actionable backlog.
CREATE TABLE IF NOT EXISTS dead_letter_jobs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name     text NOT NULL,
  payload_json jsonb,
  attempts     int NOT NULL,
  error        text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  resolved_at  timestamptz,
  resolved_by  uuid
);
CREATE INDEX IF NOT EXISTS idx_dlq_unresolved ON dead_letter_jobs (created_at DESC)
  WHERE resolved_at IS NULL;

-- ---------- updated_at parity not needed (append-mostly) ----------

-- ---------- Backfill license purge windows (V3-002) ----------
-- Any license already on file without a purge_after gets one computed from
-- config.license_retention_months relative to its upload date. The retention
-- job still re-checks legal_hold at purge time; this only sets the window.
UPDATE public.license_uploads lu
SET purge_after = (lu.created_at::date
                   + (SELECT (license_retention_months || ' months')::interval
                      FROM public.config WHERE id = true))::date
WHERE lu.purge_after IS NULL;

-- ---------- RLS: jobs tables are admin-only ----------
ALTER TABLE public.job_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dead_letter_jobs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.job_runs FROM anon, authenticated;
REVOKE ALL ON public.dead_letter_jobs FROM anon, authenticated;

DROP POLICY IF EXISTS job_runs_admin_all ON public.job_runs;
CREATE POLICY job_runs_admin_all ON public.job_runs
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS dlq_admin_all ON public.dead_letter_jobs;
CREATE POLICY dlq_admin_all ON public.dead_letter_jobs
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
