import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("eastern-rentals-api")

settings = get_settings()


def _build_supabase_client():
    """Construct the Supabase client from env (service role). Returns None if
    not configured so local/dev boots stay green."""
    if not settings.supabase_url or not settings.supabase_service_role_key:
        logger.warning("Supabase env not set — skipping client construction.")
        return None
    try:
        from supabase import create_client

        return create_client(settings.supabase_url, settings.supabase_service_role_key)
    except Exception as exc:  # pragma: no cover - wiring smoke only
        logger.error("Supabase client construction failed: %s", exc)
        return None


supabase = _build_supabase_client()


def check_config_complete() -> bool | None:
    """Returns the DB-side config completeness verdict (REV-008), or None if the
    check can't be run (no client). Calls the config_is_complete() RPC."""
    if supabase is None:
        return None
    try:
        resp = supabase.rpc("config_is_complete").execute()
        return bool(resp.data)
    except Exception as exc:  # pragma: no cover
        logger.error("config_is_complete RPC failed: %s", exc)
        return False


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Config completeness gate (REV-008): in production, refuse to boot if the
    # config singleton is missing or has invalid/zero required values.
    verdict = check_config_complete()
    if settings.environment == "production":
        if verdict is None:
            raise RuntimeError(
                "Config gate: Supabase not configured in production — refusing to boot."
            )
        if verdict is False:
            raise RuntimeError(
                "Config gate FAILED: config singleton incomplete — refusing to boot."
            )
        logger.info("Config completeness gate passed.")
    else:
        logger.info("Config completeness verdict (non-prod, advisory): %s", verdict)
    yield


app = FastAPI(title="Eastern Rentals API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.web_origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, object]:
    return {"status": "ok", "config_complete": check_config_complete()}
