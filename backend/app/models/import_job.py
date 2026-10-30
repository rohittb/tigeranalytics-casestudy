import uuid
from datetime import datetime
from typing import Optional, List, TYPE_CHECKING
from sqlalchemy import String, Integer, Text, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base

if TYPE_CHECKING:
    from app.models.import_row import ImportRow



class ImportJobStatus:
    UPLOADED = "UPLOADED"
    VALIDATING = "VALIDATING"
    AWAITING_CONFIRMATION = "AWAITING_CONFIRMATION"
    APPLYING = "APPLYING"
    COMPLETED = "COMPLETED"
    COMPLETED_WITH_ERRORS = "COMPLETED_WITH_ERRORS"
    COMPLETED_WITH_CONFLICTS = "COMPLETED_WITH_CONFLICTS"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"

    TERMINAL_STATES = {
        COMPLETED,
        COMPLETED_WITH_ERRORS,
        COMPLETED_WITH_CONFLICTS,
        FAILED,
        CANCELLED,
    }


class ImportJob(Base):
    __tablename__ = "import_jobs"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    original_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    storage_key: Mapped[str] = mapped_column(String(500), nullable=False)
    status: Mapped[str] = mapped_column(
        String(50), default=ImportJobStatus.UPLOADED, nullable=False, index=True
    )
    created_by: Mapped[str] = mapped_column(String(100), default="dev-analyst-01", nullable=False)
    
    # Aggregated row counters
    total_rows: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    valid_rows: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    invalid_rows: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    applied_rows: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    conflicted_rows: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    failure_summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
    confirmed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    rows: Mapped[List["ImportRow"]] = relationship(
        "ImportRow", back_populates="job", cascade="all, delete-orphan"
    )
