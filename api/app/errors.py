"""Canonical error taxonomy (§8.1).

The wire shape is preserved as FastAPI's default HTTPException body —
``{"detail": {"code": ..., "message": ...}}`` — because the web client reads
``detail.code`` / ``detail.message`` (web/src/lib/api.ts). This module just gives
routes a single source of truth for the codes/HTTP statuses/user messages in the
§8.1 table so they stop being retyped inline.
"""

from fastapi import HTTPException

# code -> (http status, default user-facing message). Mirrors §8.1 exactly.
ERROR_TAXONOMY: dict[str, tuple[int, str]] = {
    "AUTH_EXPIRED": (401, "Please log in again"),
    "AUTH_REQUIRED": (401, "Please log in again"),
    "FORBIDDEN": (403, "You don't have access to that"),
    "UNIT_UNAVAILABLE": (409, "That unit was just booked — please pick new dates"),
    "DELIVERY_OUT_OF_RANGE": (422, "Delivery isn't available to that address"),
    "MAX_DURATION": (400, "Rentals are limited to the maximum number of days"),
    "TOWING_ACK_REQUIRED": (422, "Please confirm towing requirements"),
    "RATE_LIMITED": (429, "Too many attempts — try again shortly"),
    "PAYMENT_FAILED": (402, "Payment didn't go through"),
}


def api_error(code: str, message: str | None = None, *, status: int | None = None) -> HTTPException:
    """Build an HTTPException carrying a taxonomy code (§8.1).

    Falls back to the taxonomy's default status/message when not given, so a
    caller can write ``raise api_error("RATE_LIMITED")`` and get the right 429 +
    copy. Unknown codes default to HTTP 400.
    """
    default_status, default_message = ERROR_TAXONOMY.get(code, (status or 400, message or code))
    return HTTPException(
        status_code=status or default_status,
        detail={"code": code, "message": message or default_message},
    )
