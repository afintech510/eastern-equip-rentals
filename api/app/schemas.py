from datetime import date

from pydantic import BaseModel, Field


# ---- Public catalog ----
class ProductOut(BaseModel):
    id: str
    name: str
    category: str
    description: str | None = None
    photo_url: str | None = None
    daily_rate: float
    booking_fee_mode: str
    requires_towing_ack: bool
    max_rental_days: int
    active: bool


class AvailabilityOut(BaseModel):
    available: bool
    units_free: int


# ---- Quote (§3.2) ----
class QuoteIn(BaseModel):
    product_id: str
    start_date: date
    end_date: date
    fulfillment: str = Field(default="pickup", pattern="^(pickup|delivery)$")
    delivery_address: str | None = None


class LicenseIn(BaseModel):
    # Client uploads to the private 'licenses' bucket (owner RLS), then registers
    # the path here. Path convention: licenses/{auth_user_id}/<file>.
    storage_path: str


class LicenseDecisionIn(BaseModel):
    decision: str = Field(pattern="^(approved|rejected)$")
    reason: str | None = None


class HandoverIn(BaseModel):
    # Balance settlement at pickup. Deposit is always card (hold ≤5d / charge >5d)
    # on the card on file. "manual" entry = attach a new card via setup-card first.
    balance_method: str = Field(default="card_on_file", pattern="^(card_on_file|cash|other)$")


class DepositActionIn(BaseModel):
    action: str = Field(pattern="^(capture|release|refund)$")
    amount: float | None = None  # partial; defaults to full


class PhotoIn(BaseModel):
    storage_path: str
    phase: str = Field(pattern="^(pickup|return)$")


class SwapUnitIn(BaseModel):
    unit_id: str


class ProfileUpdate(BaseModel):
    full_name: str | None = None
    phone: str | None = None
    transactional_sms: bool | None = None
    sms_marketing_opt_in: bool | None = None
    email_marketing_opt_in: bool | None = None


class ReservationIn(BaseModel):
    product_id: str
    start_date: date
    end_date: date
    fulfillment: str = Field(default="pickup", pattern="^(pickup|delivery)$")
    delivery_address: str | None = None
    towing_ack: bool = False


class ReservationOut(BaseModel):
    rental_id: str
    booking_fee_amount: float
    card_service_fee: float
    booking_fee_client_secret: str | None
    hold_expires_at: str


class GateOut(BaseModel):
    rental_id: str
    status: str
    paid: bool
    license_ok: bool
    contract_signed: bool
    waiver_signed: bool
    booking_fee_amount: float
    balance_due: float
    total: float
    start_date: str
    end_date: str
    product_name: str | None = None


class DeliveryQuoteIn(BaseModel):
    address: str


class DeliveryQuoteOut(BaseModel):
    distance_miles: float | None
    fee: float
    in_radius: bool
    pending: bool


class QuoteOut(BaseModel):
    rental_subtotal: float
    discount_amount: float
    delivery_fee: float
    delivery_in_radius: bool
    tax_amount: float
    total: float
    booking_fee_amount: float
    balance_due: float
    card_service_fee_pct: float
    deposit_amount: float
    deposit_strategy: str
    requires_towing_ack: bool
    available: bool
    rental_days: int


class CalendarDay(BaseModel):
    date: date
    available: bool
    units_free: int


class CalendarOut(BaseModel):
    month: str  # YYYY-MM
    total_units: int
    days: list[CalendarDay]


# ---- Admin inventory CRUD ----
class ProductIn(BaseModel):
    name: str
    category: str
    description: str | None = None
    photo_url: str | None = None
    daily_rate: float = Field(ge=0)
    booking_fee_mode: str = Field(pattern="^(standard|percent_down)$")
    requires_towing_ack: bool = False
    max_rental_days: int = Field(default=30, ge=1)
    active: bool = True


class ProductUpdate(BaseModel):
    name: str | None = None
    category: str | None = None
    description: str | None = None
    photo_url: str | None = None
    daily_rate: float | None = Field(default=None, ge=0)
    booking_fee_mode: str | None = Field(default=None, pattern="^(standard|percent_down)$")
    requires_towing_ack: bool | None = None
    max_rental_days: int | None = Field(default=None, ge=1)
    active: bool | None = None


class UnitIn(BaseModel):
    product_id: str
    label: str
    serial_number: str | None = None
    status: str = Field(default="available", pattern="^(available|maintenance|retired)$")


class UnitUpdate(BaseModel):
    label: str | None = None
    serial_number: str | None = None
    status: str | None = Field(default=None, pattern="^(available|maintenance|retired)$")


class RateIn(BaseModel):
    product_id: str
    min_days: int = Field(ge=1)
    rate_type: str = Field(default="percent_off", pattern="^(percent_off|flat_daily|weekly)$")
    value: float = Field(ge=0)
