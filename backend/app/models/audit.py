from datetime import datetime
from typing import Optional, Any, Dict
from sqlalchemy import String, DateTime, JSON, func
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base


class AuditAction:
    CREATE = "CREATE"
    UPDATE = "UPDATE"
    IMPORT_INSERT = "IMPORT_INSERT"
    IMPORT_UPDATE = "IMPORT_UPDATE"
    STORE_CREATE = "STORE_CREATE"
    STORE_UPDATE = "STORE_UPDATE"
    STORE_ACTIVATE = "STORE_ACTIVATE"
    STORE_DEACTIVATE = "STORE_DEACTIVATE"


class AuditSource:
    MANUAL = "MANUAL"
    IMPORT = "IMPORT"


class AuditEvent(Base):
    __tablename__ = "audit_events"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    actor_id: Mapped[str] = mapped_column(String(100), nullable=False)
    action: Mapped[str] = mapped_column(String(50), nullable=False)
    entity_type: Mapped[str] = mapped_column(String(50), default="store_pricing", nullable=False)
    entity_key: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    before_value: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSON, nullable=True)
    after_value: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSON, nullable=True)
    source: Mapped[str] = mapped_column(String(50), nullable=False)
    correlation_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )
