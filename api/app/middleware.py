"""Cross-cutting HTTP middleware (§7.3, §8.2).

- RequestContextMiddleware: assigns an X-Request-ID, emits one structured JSON
  access log per request (method, path, status, latency_ms, request_id) with no
  PII (§8.2), and surfaces the id on the response for support correlation.
- SecurityHeadersMiddleware: defense-in-depth response headers. TLS itself is
  terminated at the reverse proxy (§7.3); HSTS is only asserted on https so
  local http dev isn't pinned.
"""

import json
import logging
import time
import uuid

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

logger = logging.getLogger("eastern-rentals-api.access")


class RequestContextMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        request_id = request.headers.get("x-request-id") or uuid.uuid4().hex
        request.state.request_id = request_id
        start = time.perf_counter()
        status = 500
        try:
            response: Response = await call_next(request)
            status = response.status_code
            return response
        finally:
            elapsed_ms = round((time.perf_counter() - start) * 1000, 1)
            # Structured JSON; no query string / body / auth headers => no PII.
            logger.info(
                json.dumps(
                    {
                        "request_id": request_id,
                        "method": request.method,
                        "path": request.url.path,
                        "status": status,
                        "latency_ms": elapsed_ms,
                    }
                )
            )
            try:
                response.headers["X-Request-ID"] = request_id
            except (UnboundLocalError, NameError):  # pragma: no cover - exception path
                pass


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response: Response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "no-referrer")
        response.headers.setdefault("X-Permitted-Cross-Domain-Policies", "none")
        response.headers.setdefault("Cross-Origin-Resource-Policy", "same-site")
        # The API serves JSON only; don't let intermediaries cache responses.
        response.headers.setdefault("Cache-Control", "no-store")
        if request.url.scheme == "https":
            response.headers.setdefault(
                "Strict-Transport-Security", "max-age=63072000; includeSubDomains"
            )
        return response
