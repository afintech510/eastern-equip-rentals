"""Job scheduler (REV-023). Registers each background job on an interval, every
run wrapped in `run_with_retry` so failures retry with backoff and dead-letter.

Run by worker.py as a separate process so a slow/failed job never blocks API
request handling. Intervals are deliberately modest — these are reconciliation
safety nets, not hot paths.
"""

import logging

from apscheduler.schedulers.blocking import BlockingScheduler

from app.jobs.hold_expiry import expire_stale_holds
from app.jobs.runner import run_with_retry
from app.jobs.signwell_poll import poll_pending_documents
from app.services.retention import run_retention

logger = logging.getLogger("eastern-rentals-api.jobs")


def _hold_expiry():
    run_with_retry("hold_expiry", expire_stale_holds)


def _signwell_poll():
    run_with_retry("signwell_poll", poll_pending_documents)


def _retention_purge():
    run_with_retry("retention_purge", run_retention, max_attempts=3)


def build_scheduler() -> BlockingScheduler:
    sched = BlockingScheduler(timezone="UTC")
    # Reservation holds: tight loop so freed units reappear quickly.
    sched.add_job(_hold_expiry, "interval", minutes=5, id="hold_expiry", max_instances=1)
    # SignWell safety net for missed webhooks.
    sched.add_job(_signwell_poll, "interval", minutes=15, id="signwell_poll", max_instances=1)
    # Retention purge: once daily at 03:15 UTC (off-peak).
    sched.add_job(_retention_purge, "cron", hour=3, minute=15, id="retention_purge", max_instances=1)
    return sched


def main() -> None:  # pragma: no cover - process entrypoint
    logging.basicConfig(level=logging.INFO)
    logger.info("Starting Eastern Rentals job scheduler (hold-expiry, signwell-poll, retention)")
    build_scheduler().start()


if __name__ == "__main__":  # pragma: no cover
    main()
