"""Background jobs (Phase 06, REV-023). Each job is a plain callable run through
`runner.run_with_retry`, which records a job_runs row, retries with exponential
backoff, and dead-letters on exhaustion. The scheduler (scheduler.py) registers
them on intervals; worker.py is the process entrypoint."""
