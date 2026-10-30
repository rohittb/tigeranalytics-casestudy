from decimal import Decimal
from typing import Optional
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.schemas.pricing import (
    PricingResponse,
    PricingDetailResponse,
    PricingUpdate,
)
from app.schemas.common import PaginatedResponse
from app.services import pricing_service
from app.core.config import settings

router = APIRouter(prefix="/pricing", tags=["Pricing"])


@router.get("", response_model=PaginatedResponse[PricingResponse], summary="Search and filter store pricing")
def list_pricing(
    q: Optional[str] = Query(None, description="Free text search on store code, name, SKU, or product name"),
    store_code: Optional[str] = Query(None, description="Filter by store code"),
    sku: Optional[str] = Query(None, description="Filter by product SKU"),
    country_code: Optional[str] = Query(None, description="Filter by country code (e.g. US, CA, GB, DE)"),
    min_price: Optional[Decimal] = Query(None, ge=0, description="Minimum price filter"),
    max_price: Optional[Decimal] = Query(None, ge=0, description="Maximum price filter"),
    page: int = Query(1, ge=1, description="Page number"),
    limit: int = Query(20, ge=1, le=100, description="Items per page"),
    db: Session = Depends(get_db),
):
    items, total = pricing_service.search_pricing(
        db=db,
        query=q,
        store_code=store_code,
        sku=sku,
        country_code=country_code,
        min_price=min_price,
        max_price=max_price,
        page=page,
        limit=limit,
    )
    total_pages = (total + limit - 1) // limit if total > 0 else 1

    return PaginatedResponse(
        items=items,
        total=total,
        page=page,
        limit=limit,
        total_pages=total_pages,
    )


@router.get("/{pricing_id}", response_model=PricingDetailResponse, summary="Get pricing record details and audit history")
def get_pricing(pricing_id: int, db: Session = Depends(get_db)):
    return pricing_service.get_pricing_by_id(db=db, pricing_id=pricing_id)


@router.patch("/{pricing_id}", response_model=PricingDetailResponse, summary="Edit price with optimistic concurrency version control")
def update_pricing(
    pricing_id: int,
    payload: PricingUpdate,
    db: Session = Depends(get_db),
):
    """
    Atomically updates a pricing record if payload.expected_version matches the current version in DB.
    If the record was modified by another process in the meantime, returns HTTP 409 Conflict.
    """
    updated = pricing_service.update_pricing_atomic(
        db=db,
        pricing_id=pricing_id,
        new_price=payload.price,
        expected_version=payload.expected_version,
        actor_id=settings.DEV_ACTOR_ID,
    )
    return updated
