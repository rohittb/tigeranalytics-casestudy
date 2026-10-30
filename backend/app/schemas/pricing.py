from datetime import datetime
from decimal import Decimal
from typing import Optional, List, Any, Dict
from pydantic import BaseModel, Field, field_validator, ConfigDict


class PricingBase(BaseModel):
    country_code: str
    currency_code: str
    price: Decimal = Field(..., ge=0, description="Price must be non-negative")

    @field_validator("price")
    @classmethod
    def validate_price_precision(cls, v: Decimal) -> Decimal:
        if v.as_tuple().exponent < -2:
            raise ValueError("Price cannot exceed 2 decimal places")
        if v < 0:
            raise ValueError("Price cannot be negative")
        return v


class PricingUpdate(BaseModel):
    price: Decimal = Field(..., ge=0, description="New price")
    expected_version: int = Field(..., description="Optimistic concurrency version token")

    @field_validator("price")
    @classmethod
    def validate_price_precision(cls, v: Decimal) -> Decimal:
        if v.as_tuple().exponent < -2:
            raise ValueError("Price cannot exceed 2 decimal places")
        if v < 0:
            raise ValueError("Price cannot be negative")
        return v


class PricingResponse(BaseModel):
    id: int
    store_id: int
    store_code: str
    store_name: str
    product_id: int
    product_sku: str
    product_name: str
    country_code: str
    currency_code: str
    price: Decimal
    version: int
    active: bool = True
    updated_at: datetime
    updated_by: str

    model_config = ConfigDict(from_attributes=True)


class AuditRecordResponse(BaseModel):
    id: int
    actor_id: str
    action: str
    entity_key: str
    before_value: Optional[Dict[str, Any]] = None
    after_value: Optional[Dict[str, Any]] = None
    source: str
    correlation_id: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class PricingDetailResponse(PricingResponse):
    recent_audits: List[AuditRecordResponse] = []
