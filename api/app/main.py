import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("eastern-rentals-api")

settings = get_settings()

app = FastAPI(title="Eastern Rentals API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.web_origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _build_supabase_client():
    """Construct the Supabase client from env (Phase 00: verify wiring only —
    no tables or queries yet). Returns None if not configured so /health stays
    green in a bare local boot."""
    if not settings.supabase_url or not settings.supabase_service_role_key:
        logger.warning("Supabase env not set — skipping client construction (Phase 00 OK).")
        return None
    try:
        from supabase import create_client

        return create_client(settings.supabase_url, settings.supabase_service_role_key)
    except Exception as exc:  # pragma: no cover - wiring smoke only
        logger.error("Supabase client construction failed: %s", exc)
        return None


# Constructed at import time to surface wiring problems early.
supabase = _build_supabase_client()


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
