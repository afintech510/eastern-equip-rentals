"""Supabase client factories.

- service client: service-role key, bypasses RLS. Used for availability
  (units/rentals are admin-only at RLS) and admin writes.
- anon client: validates a user JWT via GoTrue (auth.get_user).
"""

from functools import lru_cache

from supabase import Client, create_client

from app.config import get_settings

settings = get_settings()


@lru_cache
def service_client() -> Client | None:
    if not settings.supabase_url or not settings.supabase_service_role_key:
        return None
    return create_client(settings.supabase_url, settings.supabase_service_role_key)


@lru_cache
def anon_client() -> Client | None:
    if not settings.supabase_url or not settings.supabase_anon_key:
        return None
    return create_client(settings.supabase_url, settings.supabase_anon_key)
