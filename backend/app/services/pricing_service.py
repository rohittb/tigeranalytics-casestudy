from decimal import Decimal
from typing import Optional, Tuple, List, Dict, Any
from sqlalchemy import select, update, func, or_
from sqlalchemy.orm import Session, joinedload
from app.models.pricing import StorePricing
from app.models.store import Store
from app.models.product import Product
from app.models.audit import AuditEvent, AuditAction, AuditSource
from app.services.audit_service import record_audit
from app.core.errors import NotFoundError, ConcurrencyConflictError


def search_pricing(
    db: Session,
    query: Optional[str] = None,
    store_code: Optional[str] = None,
    sku: Optional[str] = None,
    country_code: Optional[str] = None,
    min_price: Optional[Decimal] = None,
    max_price: Optional[Decimal] = None,
    page: int = 1,
    limit: int = 20,
) -> Tuple[List[Dict[str, Any]], int]:
    stmt = (
        select(StorePricing)
        .join(Store, StorePricing.store_id == Store.id)
        .join(Product, StorePricing.product_id == Product.id)
        .options(joinedload(StorePricing.store), joinedload(StorePricing.product))
    )

    if query:
        q = f"%{query.strip()}%"
        stmt = stmt.where(
            or_(
                Store.store_code.ilike(q),
                Store.name.ilike(q),
                Product.sku.ilike(q),
                Product.name.ilike(q),
            )
        )

    if store_code:
        stmt = stmt.where(Store.store_code.ilike(f"%{store_code.strip()}%"))

    if sku:
        stmt = stmt.where(Product.sku.ilike(f"%{sku.strip()}%"))

    if country_code:
        stmt = stmt.where(StorePricing.country_code == country_code.strip().upper())

    if min_price is not None:
        stmt = stmt.where(StorePricing.price >= min_price)

    if max_price is not None:
        stmt = stmt.where(StorePricing.price <= max_price)

    # Count total
    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = db.scalar(count_stmt) or 0

    # Paginate with stable sort
    offset = (page - 1) * limit
    paged_stmt = stmt.order_by(Store.store_code.asc(), Product.sku.asc()).offset(offset).limit(limit)
    rows = db.scalars(paged_stmt).all()

    items = []
    for r in rows:
        items.append({
            "id": r.id,
            "store_id": r.store_id,
            "store_code": r.store.store_code,
            "store_name": r.store.name,
            "product_id": r.product_id,
            "product_sku": r.product.sku,
            "product_name": r.product.name,
            "country_code": r.country_code,
            "currency_code": r.currency_code,
            "price": r.price,
            "version": r.version,
            "active": (r.store.active if r.store is not None else True) and (r.product.active if r.product is not None else True),
            "updated_at": r.updated_at,
            "updated_by": r.updated_by,
        })

    return items, total


def get_pricing_by_id(db: Session, pricing_id: int) -> Dict[str, Any]:
    stmt = (
        select(StorePricing)
        .options(joinedload(StorePricing.store), joinedload(StorePricing.product))
        .where(StorePricing.id == pricing_id)
    )
    pricing = db.scalar(stmt)
    if not pricing:
        raise NotFoundError(f"Pricing record {pricing_id} not found")

    entity_key = f"store:{pricing.store.store_code}|sku:{pricing.product.sku}|{pricing.country_code}|{pricing.currency_code}"
    
    # Fetch recent audits
    audit_stmt = (
        select(AuditEvent)
        .where(AuditEvent.entity_key == entity_key)
        .order_by(AuditEvent.created_at.desc())
        .limit(10)
    )
    audits = db.scalars(audit_stmt).all()

    effective_active = (pricing.store.active if pricing.store is not None else True) and (pricing.product.active if pricing.product is not None else True)

    return {
        "id": pricing.id,
        "store_id": pricing.store_id,
        "store_code": pricing.store.store_code,
        "store_name": pricing.store.name,
        "product_id": pricing.product_id,
        "product_sku": pricing.product.sku,
        "product_name": pricing.product.name,
        "country_code": pricing.country_code,
        "currency_code": pricing.currency_code,
        "price": pricing.price,
        "version": pricing.version,
        "active": effective_active,
        "updated_at": pricing.updated_at,
        "updated_by": pricing.updated_by,
        "recent_audits": audits,
    }


def update_pricing_atomic(
    db: Session,
    pricing_id: int,
    new_price: Decimal,
    expected_version: int,
    actor_id: str = "dev-analyst-01",
) -> Dict[str, Any]:
    # Check if record exists
    existing = db.scalar(
        select(StorePricing)
        .options(joinedload(StorePricing.store), joinedload(StorePricing.product))
        .where(StorePricing.id == pricing_id)
    )
    if not existing:
        raise NotFoundError(f"Pricing record {pricing_id} not found")

    # Check optimistic version
    if existing.version != expected_version:
        raise ConcurrencyConflictError(
            message=(
                f"Conflict detected for {existing.store.store_code} / {existing.product.sku}. "
                f"The record has been updated to version {existing.version} with price {existing.price} "
                f"by {existing.updated_by} since you loaded version {expected_version}. "
                "Please review the latest record and submit again."
            ),
            current_data={
                "id": existing.id,
                "current_price": str(existing.price),
                "current_version": existing.version,
                "updated_at": existing.updated_at.isoformat() if existing.updated_at else None,
                "updated_by": existing.updated_by,
            },
        )

    before_value = {
        "price": str(existing.price),
        "version": existing.version,
    }

    # Execute atomic version increment update
    update_stmt = (
        update(StorePricing)
        .where(
            StorePricing.id == pricing_id,
            StorePricing.version == expected_version,
        )
        .values(
            price=new_price,
            version=StorePricing.version + 1,
            updated_by=actor_id,
            updated_at=func.now(),
        )
        .returning(StorePricing.version, StorePricing.price, StorePricing.updated_at)
    )

    result = db.execute(update_stmt).first()
    if not result:
        # Race condition between check and update
        db.refresh(existing)
        raise ConcurrencyConflictError(
            message="Optimistic lock conflict: record was modified concurrently.",
            current_data={
                "id": existing.id,
                "current_price": str(existing.price),
                "current_version": existing.version,
            },
        )

    new_version, final_price, updated_at = result

    after_value = {
        "price": str(final_price),
        "version": new_version,
    }

    entity_key = f"store:{existing.store.store_code}|sku:{existing.product.sku}|{existing.country_code}|{existing.currency_code}"
    record_audit(
        db=db,
        actor_id=actor_id,
        action=AuditAction.UPDATE,
        entity_key=entity_key,
        before_value=before_value,
        after_value=after_value,
        source=AuditSource.MANUAL,
        commit=False,
    )

    db.commit()

    return get_pricing_by_id(db, pricing_id)
