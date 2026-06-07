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
