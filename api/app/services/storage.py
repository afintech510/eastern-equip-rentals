"""Private-bucket signed URLs (§7.3, REV-031). 300-second TTL, minted per view;
never embed long-lived URLs. Uses the service-role client."""

import logging

from app.supa import service_client

logger = logging.getLogger("eastern-rentals-api")
SIGNED_URL_TTL = 300  # seconds


def signed_url(bucket: str, path: str, ttl: int = SIGNED_URL_TTL) -> str | None:
    svc = service_client()
    if svc is None:
        return None
    try:
        res = svc.storage.from_(bucket).create_signed_url(path, ttl)
        # supabase-py returns {"signedURL": "..."} or {"signed_url": "..."}
        return res.get("signedURL") or res.get("signed_url")
    except Exception as exc:  # noqa: BLE001
        logger.warning("signed_url failed for %s/%s: %s", bucket, path, exc)
        return None
