"""Admin job-status dashboard + manual controls (§8.3, REV-023).

Surfaces background-job health so silent accumulation can't hide: recent runs
with durations/counts, and the unresolved dead-letter backlog. Admins can also
trigger a job on demand and dismiss a dead-letter entry once handled. All routes
are re-checked against admin_users by require_admin (§7.2).
"""

import logging
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException

from app.deps import require_admin
from app.jobs.hold_expiry import expire_stale_holds
from app.jobs.runner import run_with_retry
from app.jobs.signwell_poll import poll_pending_documents
from app.services.retention import run_retention
from app.supa import service_client

logger = logging.getLogger("eastern-rentals-api")
router = APIRouter(prefix="/api/v1/admin/jobs", tags=["admin-jobs"])

# Jobs an admin may trigger on demand → their executor.
RUNNABLE = {
    "hold_expiry": expire_stale_holds,
    "signwell_poll": poll_pending_documents,
    "retention_purge": run_retention,
}


def _svc():
    svc = service_client()
    if svc is None:
        raise HTTPException(
            status_code=503, detail={"code": "DB_UNCONFIGURED", "message": "DB not configured"}
        )
    return svc


@router.get("/runs")
def recent_runs(limit: int = 50, job_name: str | None = None, _: str = Depends(require_admin)):
    svc = _svc()
    q = svc.table("job_runs").select("*").order("started_at", desc=True).limit(min(limit, 200))
    if job_name:
        q = q.eq("job_name", job_name)
    return q.execute().data or []


@router.get("/dead-letter")
def dead_letter(unresolved_only: bool = True, _: str = Depends(require_admin)):
    svc = _svc()
    q = svc.table("dead_letter_jobs").select("*").order("created_at", desc=True).limit(200)
    if unresolved_only:
        q = q.is_("resolved_at", "null")
    return q.execute().data or []


@router.get("/summary")
def summary(_: str = Depends(require_admin)):
    """Per-job last-run snapshot + open dead-letter count for the dashboard."""
    svc = _svc()
    out = {}
    for name in RUNNABLE:
        last = (
            svc.table("job_runs")
            .select("status,started_at,finished_at,processed,skipped,error")
            .eq("job_name", name)
            .order("started_at", desc=True)
            .limit(1)
            .execute()
            .data
        )
        out[name] = last[0] if last else None
    dlq = (
        svc.table("dead_letter_jobs")
        .select("id", count="exact")
        .is_("resolved_at", "null")
        .execute()
    )
    return {"jobs": out, "dead_letter_open": getattr(dlq, "count", None) or len(dlq.data or [])}


@router.post("/{name}/run")
def run_now(name: str, _: str = Depends(require_admin)):
    if name not in RUNNABLE:
        raise HTTPException(
            status_code=404, detail={"code": "UNKNOWN_JOB", "message": f"No such job: {name}"}
        )
    result = run_with_retry(name, RUNNABLE[name])
    return {"job": name, "result": result}


@router.post("/dead-letter/{dlq_id}/resolve")
def resolve_dead_letter(dlq_id: str, admin_id: str = Depends(require_admin)):
    svc = _svc()
    svc.table("dead_letter_jobs").update(
        {"resolved_at": datetime.now(UTC).isoformat(), "resolved_by": admin_id}
    ).eq("id", dlq_id).execute()
    return {"status": "resolved", "id": dlq_id}
