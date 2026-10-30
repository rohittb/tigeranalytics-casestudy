from typing import Generic, TypeVar, List, Optional
from pydantic import BaseModel, Field

T = TypeVar("T")


class PaginatedResponse(BaseModel, Generic[T]):
    items: List[T]
    total: int
    page: int
    limit: int
    total_pages: int


class ErrorDetail(BaseModel):
    field: Optional[str] = None
    code: str
    message: str


class StandardResponse(BaseModel):
    success: bool = True
    message: str = "Operation completed successfully"
