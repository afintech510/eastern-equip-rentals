"""Worker process entrypoint (Phase 06).

Runs the background-job scheduler in its own container (see the `worker` service
in docker-compose.yml) so retention/hold-expiry/signwell polling run off the API
request path. Start locally with:  python -m app.worker
"""

from app.jobs.scheduler import main

if __name__ == "__main__":
    main()
