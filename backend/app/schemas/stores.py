from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict, Field


class StoreCreate(BaseModel):
    store_code: str = Field(..., min_length=2, max_length=50, description="Unique store code (e.g. STR-US-005)")
    name: str = Field(..., min_length=2, max_length=255, description="Store name")
    country_code: str = Field(..., min_length=2, max_length=10, description="ISO country code (US, GB, CA, DE)")
    active: bool = True


class StoreUpdate(BaseModel):
    name: Optional[str] = None
    country_code: Optional[str] = None
    active: Optional[bool] = None


class StoreResponse(BaseModel):
    id: int
    store_code: str
    name: str
    country_code: str
    active: bool
    pricing_count: int = 0
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ProductResponse(BaseModel):
    id: int
    sku: str
    name: str
    category: str = "General"
    active: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
