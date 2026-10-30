from datetime import datetime
from decimal import Decimal
from sqlalchemy import (
    String,
    Integer,
    Numeric,
    Boolean,
    DateTime,
    ForeignKey,
    CheckConstraint,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base


class StorePricing(Base):
    __tablename__ = "store_pricing"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    store_id: Mapped[int] = mapped_column(
        ForeignKey("stores.id", ondelete="CASCADE"), nullable=False, index=True
    )
    product_id: Mapped[int] = mapped_column(
        ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True
    )
    country_code: Mapped[str] = mapped_column(String(10), nullable=False, index=True)
    currency_code: Mapped[str] = mapped_column(String(10), nullable=False)
    price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
    updated_by: Mapped[str] = mapped_column(String(100), default="dev-analyst-01", nullable=False)

    store = relationship("Store", back_populates="pricing_records")
    product = relationship("Product", back_populates="pricing_records")

    @property
    def is_active(self) -> bool:
        """
        Hierarchical / Inherited State (O(1)):
        A price point is active if and only if both the parent Store and Product are active.
        Eliminates expensive cascading writes across millions of child rows.
        """
        store_active = self.store.active if self.store is not None else True
        product_active = self.product.active if self.product is not None else True
        return store_active and product_active

    __table_args__ = (
        CheckConstraint("price >= 0", name="ck_store_pricing_price_non_negative"),
        UniqueConstraint(
            "store_id",
            "product_id",
            "country_code",
            "currency_code",
            name="uq_store_product_country_currency",
        ),
    )
