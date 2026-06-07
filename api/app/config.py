from functools import lru_cache

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime config. Values are injected as env vars via Doppler (no secrets
    committed)."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # App
    environment: str = "development"
    web_origin: str = "http://localhost:3009"

    # Supabase (managed)
    supabase_url: str = Field(
        default="",
        validation_alias=AliasChoices("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"),
    )
    supabase_service_role_key: str = ""
    supabase_anon_key: str = Field(
        default="",
        validation_alias=AliasChoices("SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    )

    # Redis (locks / jobs)
    redis_url: str = "redis://redis:6379/0"

    # Integrations (wired in later phases — empty until keys provided)
    google_distance_matrix_api_key: str = ""
    stripe_secret_key: str = ""
    stripe_webhook_secret: str = ""

    # SignWell (Phase 03) — e-sign contract + waiver
    signwell_api_key: str = ""
    signwell_webhook_secret: str = ""
    signwell_contract_template_id: str = ""
    signwell_waiver_template_id: str = ""

    # Email (Resend, Phase 03/04)
    resend_api_key: str = ""
    resend_from_email: str = "Eastern Rentals <noreply@rentals.benchworksai.com>"
    admin_notify_email: str = ""

    # Twilio SMS (Phase 04) — gated until keys provided
    twilio_account_sid: str = ""
    twilio_auth_token: str = ""
    twilio_from_number: str = ""

    # Public app base URL (for signing redirect links, emails)
    app_base_url: str = Field(
        default="https://rentals.benchworksai.com",
        validation_alias=AliasChoices("APP_BASE_URL", "NEXT_PUBLIC_BASE_URL"),
    )

    # Delivery origin (the yard) for Distance Matrix (§5.5)
    yard_origin: str = "Center Moriches, NY 11934"


@lru_cache
def get_settings() -> Settings:
    return Settings()
