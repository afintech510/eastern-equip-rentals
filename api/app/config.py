from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime config. Values are injected as env vars via Doppler (no secrets
    committed). Phase 00 only needs Supabase + Redis + CORS origin."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # App
    environment: str = "development"
    web_origin: str = "http://localhost:3009"

    # Supabase (managed) — client construction only in Phase 00
    supabase_url: str = ""
    supabase_service_role_key: str = ""

    # Redis (locks / jobs)
    redis_url: str = "redis://redis:6379/0"


@lru_cache
def get_settings() -> Settings:
    return Settings()
