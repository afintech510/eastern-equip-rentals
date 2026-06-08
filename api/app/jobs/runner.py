"""Job runner: exponential-backoff retry + dead-letter + run recording (REV-023).

Every scheduled job is executed through `run_with_retry`. Each attempt opens a
`job_runs` row (running → succeeded/failed) so the admin dashboard can see runs,
durations, and processed/skipped counts. When all attempts fail the job is
written to `dead_letter_jobs` for manual inspection/replay, and a final
`dead_lettered` run is recorded.

DB recording degrades to a no-op when Supabase isn't configured (local/test), so
the runner is exercisable without a database.
"""

import logging
import time
from datetime import UTC, datetime

from app.supa import service_client

logger = logging.getLogger("eastern-rentals-api.jobs")


def backoff_delay(attempt: int, base: float = 2.0) -> float:
    """Seconds to wait before `attempt` (1-indexed retry number). 2,4,8,16…
    Pure — unit-tested in Phase 07."""
    return base * (2 ** (attempt - 1))


def _start_run(svc, job_name: str, attempt: int) -> str | None:
    if svc is None:
        return None
    try:
        res = (
            svc.table("job_runs")
            .insert({"job_name": job_name, "status": "running", "attempt": attempt})
            .execute()
        )
        return res.data[0]["id"] if res.data else None
    except Exception as exc:  # noqa: BLE001 — recording must never break the job
        logger.warning("job_runs insert failed for %s: %s", job_name, exc)
        return None


def _finish_run(svc, run_id, status, t0, result, error=None):
    if svc is None or run_id is None:
        return
    result = result or {}
    try:
        svc.table("job_runs").update(
            {
                "status": status,
                "finished_at": datetime.now(UTC).isoformat(),
                "duration_ms": int((time.monotonic() - t0) * 1000),
                "processed": int(result.get("processed", 0)),
                "skipped": int(result.get("skipped", 0)),
                "error": (error or "")[:2000] or None,
                "detail_json": result.get("detail"),
            }
        ).eq("id", run_id).execute()
    except Exception as exc:  # noqa: BLE001
        logger.warning("job_runs update failed for %s: %s", run_id, exc)


def _dead_letter(svc, job_name, payload, attempts, error):
    logger.error("job %s dead-lettered after %d attempts: %s", job_name, attempts, error)
    if svc is None:
        return
    try:
        svc.table("dead_letter_jobs").insert(
            {
                "job_name": job_name,
                "payload_json": payload,
                "attempts": attempts,
                "error": (error or "")[:2000],
            }
        ).execute()
        svc.table("job_runs").insert(
            {"job_name": job_name, "status": "dead_lettered", "attempt": attempts, "error": error}
        ).execute()
    except Exception as exc:  # noqa: BLE001
        logger.warning("dead_letter insert failed for %s: %s", job_name, exc)


def run_with_retry(
    job_name: str,
    fn,
    *,
    max_attempts: int = 4,
    payload: dict | None = None,
    sleep=time.sleep,
    svc=None,
) -> dict | None:
    """Run `fn()` with backoff. `fn` returns a dict (processed/skipped/detail) or
    None. Returns the result dict on success, or None if dead-lettered.

    `sleep`/`svc` are injectable for tests."""
    svc = svc if svc is not None else service_client()
    last_err: Exception | None = None
    for attempt in range(1, max_attempts + 1):
        run_id = _start_run(svc, job_name, attempt)
        t0 = time.monotonic()
        try:
            result = fn() or {}
            _finish_run(svc, run_id, "succeeded", t0, result)
            if attempt > 1:
                logger.info("job %s succeeded on attempt %d", job_name, attempt)
            return result
        except Exception as exc:  # noqa: BLE001 — retry/dead-letter, never propagate
            last_err = exc
            _finish_run(svc, run_id, "failed", t0, {}, error=str(exc))
            logger.warning("job %s attempt %d/%d failed: %s", job_name, attempt, max_attempts, exc)
            if attempt < max_attempts:
                sleep(backoff_delay(attempt))
    _dead_letter(svc, job_name, payload, max_attempts, str(last_err))
    return None
