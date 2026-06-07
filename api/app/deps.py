"""Auth dependencies. Admin authority is re-checked against admin_users on
every /admin/* request (§3.1, §7.2 — never trust a JWT claim alone)."""

from fastapi import Depends, Header, HTTPException

from app.supa import anon_client, service_client


def _bearer(authorization: str | None) -> str:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(
            status_code=401, detail={"code": "AUTH_REQUIRED", "message": "Missing bearer token"}
        )
    return authorization.split(" ", 1)[1].strip()


def get_current_user_id(authorization: str | None = Header(default=None)) -> str:
    """Validate the Supabase JWT via GoTrue and return the auth user id."""
    token = _bearer(authorization)
    client = anon_client()
    if client is None:
        raise HTTPException(
            status_code=503, detail={"code": "AUTH_UNCONFIGURED", "message": "Auth not configured"}
        )
    try:
        resp = client.auth.get_user(token)
    except Exception as exc:  # invalid/expired token
        raise HTTPException(
            status_code=401, detail={"code": "AUTH_EXPIRED", "message": "Please log in again"}
        ) from exc
    user = getattr(resp, "user", None)
    if user is None or not getattr(user, "id", None):
        raise HTTPException(
            status_code=401, detail={"code": "AUTH_EXPIRED", "message": "Please log in again"}
        )
    return str(user.id)


def require_admin(user_id: str = Depends(get_current_user_id)) -> str:
    """403 unless the user is an active admin in admin_users."""
    svc = service_client()
    if svc is None:
        raise HTTPException(
            status_code=503, detail={"code": "DB_UNCONFIGURED", "message": "DB not configured"}
        )
    res = (
        svc.table("admin_users")
        .select("id")
        .eq("auth_user_id", user_id)
        .is_("revoked_at", "null")
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=403, detail={"code": "FORBIDDEN", "message": "Admin only"})
    return user_id
