from datetime import datetime
from decimal import Decimal
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, ConfigDict


class ImportJobResponse(BaseModel):
    id: str
    original_filename: str
    storage_key: str
    status: str
    created_by: str
    total_rows: int
    valid_rows: int
    invalid_rows: int
    applied_rows: int
    conflicted_rows: int
    failure_summary: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    confirmed_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class ImportRowResponse(BaseModel):
    id: int
    import_job_id: str
    row_number: int
    store_code: Optional[str] = None
    product_sku: Optional[str] = None
    country_code: Optional[str] = None
    currency_code: Optional[str] = None
    price: Optional[Decimal] = None
    raw_data: Dict[str, Any]
    status: str
    errors: Optional[List[Dict[str, Any]]] = None
    expected_version: Optional[int] = None
    applied_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class ConfirmImportRequest(BaseModel):
    selected_row_ids: Optional[List[int]] = None


class ConfirmImportResponse(BaseModel):
    job_id: str
    status: str
    message: str
    selected_rows_count: Optional[int] = None


class CancelImportResponse(BaseModel):
    job_id: str
    status: str
    message: str
