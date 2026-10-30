from typing import List, Optional
from fastapi import APIRouter, Depends, Query, status, Header
from sqlalchemy.orm import Session
from sqlalchemy import select, update, func
from app.db.session import get_db
from app.models.store import Store
from app.models.product import Product
from app.models.pricing import StorePricing
from app.models.audit import AuditEvent, AuditAction, AuditSource
from app.schemas.stores import StoreResponse, StoreCreate, StoreUpdate, ProductResponse
from app.services.audit_service import record_audit
from app.core.errors import NotFoundError, AppException

router = APIRouter(tags=["Stores & Products"])


@router.get("/stores", response_model=List[StoreResponse], summary="List all stores with optional inactive filter")
def list_stores(
    include_inactive: bool = Query(True, description="Whether to include deactivated stores"),
    db: Session = Depends(get_db),
):
    stmt = select(Store)
    if not include_inactive:
        stmt = stmt.where(Store.active == True)
    stmt = stmt.order_by(Store.store_code.asc())
    stores = db.scalars(stmt).all()

    # Pre-fetch pricing counts per store
    counts_query = (
        select(StorePricing.store_id, func.count(StorePricing.id))
        .group_by(StorePricing.store_id)
    )
    counts_map = dict(db.execute(counts_query).all())

    result = []
    for s in stores:
        result.append(
            StoreResponse(
                id=s.id,
                store_code=s.store_code,
                name=s.name,
                country_code=s.country_code,
                active=s.active,
                pricing_count=counts_map.get(s.id, 0),
                created_at=s.created_at,
            )
        )
    return result


@router.post("/stores", response_model=StoreResponse, status_code=status.HTTP_201_CREATED, summary="Create a new retail store")
def create_store(
    payload: StoreCreate,
    x_actor_id: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    actor = x_actor_id or "system-admin"
    clean_code = payload.store_code.strip().upper()

    existing = db.scalar(select(Store).where(Store.store_code == clean_code))
    if existing:
        raise AppException(
            message=f"Store with code '{clean_code}' already exists.",
            code="STORE_ALREADY_EXISTS",
            status_code=status.HTTP_409_CONFLICT,
        )

    store = Store(
        store_code=clean_code,
        name=payload.name.strip(),
        country_code=payload.country_code.strip().upper(),
        active=payload.active,
    )
    db.add(store)
    db.flush()

    record_audit(
        db=db,
        actor_id=actor,
        action=AuditAction.STORE_CREATE,
        entity_key=f"store:{store.store_code}",
        before_value=None,
        after_value={
            "store_code": store.store_code,
            "name": store.name,
            "country_code": store.country_code,
            "active": store.active,
        },
        source=AuditSource.MANUAL,
        commit=False,
    )
    db.commit()
    db.refresh(store)

    return StoreResponse(
        id=store.id,
        store_code=store.store_code,
        name=store.name,
        country_code=store.country_code,
        active=store.active,
        pricing_count=0,
        created_at=store.created_at,
    )


@router.patch("/stores/{store_id}", response_model=StoreResponse, summary="Update store configuration and toggle active/inactive status")
def update_store(
    store_id: int,
    payload: StoreUpdate,
    x_actor_id: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    actor = x_actor_id or "system-admin"
    store = db.scalar(select(Store).where(Store.id == store_id))
    if not store:
        raise NotFoundError(f"Store with ID {store_id} not found")

    before_snapshot = {
        "name": store.name,
        "country_code": store.country_code,
        "active": store.active,
    }

    if payload.name is not None:
        store.name = payload.name.strip()
    if payload.country_code is not None:
        store.country_code = payload.country_code.strip().upper()

    # Handle activation / deactivation using Hierarchical / Inherited State (O(1))
    if payload.active is not None and payload.active != store.active:
        store.active = payload.active

        # Product pricing inherits active state from store.active automatically
        pricing_count = db.scalar(
            select(func.count(StorePricing.id)).where(StorePricing.store_id == store.id)
        ) or 0

        action = AuditAction.STORE_ACTIVATE if payload.active else AuditAction.STORE_DEACTIVATE
        record_audit(
            db=db,
            actor_id=actor,
            action=action,
            entity_key=f"store:{store.store_code}",
            before_value=before_snapshot,
            after_value={
                "active": store.active,
                "strategy": "inherited_state_o1",
                "affected_pricing_count": pricing_count,
            },
            source=AuditSource.MANUAL,
            commit=False,
        )

    db.commit()
    db.refresh(store)

    pricing_count = db.scalar(
        select(func.count(StorePricing.id)).where(StorePricing.store_id == store.id)
    ) or 0

    return StoreResponse(
        id=store.id,
        store_code=store.store_code,
        name=store.name,
        country_code=store.country_code,
        active=store.active,
        pricing_count=pricing_count,
        created_at=store.created_at,
    )


@router.get("/products", response_model=List[ProductResponse], summary="List all active products")
def list_products(db: Session = Depends(get_db)):
    products = db.scalars(select(Product).where(Product.active == True).order_by(Product.sku.asc())).all()
    return products
