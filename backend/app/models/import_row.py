from datetime import datetime
from decimal import Decimal
from typing import Optional, Any, Dict, List
from sqlalchemy import (
    String,
    Integer,
    Numeric,
    DateTime,
    ForeignKey,
    JSON,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base


class ImportRowStatus:
    PENDING = "PENDING"
    VALID = "VALID"
    INVALID = "INVALID"
    APPLIED = "APPLIED"
    CONFLICT = "CONFLICT"
    SKIPPED = "SKIPPED"


class ImportRow(Base):
    __tablename__ = "import_rows"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    import_job_id: Mapped[str] = mapped_column(
        ForeignKey("import_jobs.id", ondelete="CASCADE"), nullable=False, index=True
    )
    row_number: Mapped[int] = mapped_column(Integer, nullable=False)
    
    # Staged normalized values
    store_code: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    product_sku: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    country_code: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    currency_code: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    price: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 2), nullable=True)
    
    raw_data: Mapped[Dict[str, Any]] = mapped_column(JSON, nullable=False)
    status: Mapped[str] = mapped_column(
        String(50), default=ImportRowStatus.PENDING, nullable=False, index=True
    )
    errors: Mapped[Optional[List[Dict[str, Any]]]] = mapped_column(JSON, nullable=True)
    
    # Version captured during staging for existing records
    expected_version: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    applied_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    job = relationship("ImportJob", back_populates="rows")

    __table_args__ = (
        UniqueConstraint("import_job_id", "row_number", name="uq_import_job_row_number"),
    )
