from typing import Optional, Any, Dict
from sqlalchemy.orm import Session
from app.models.audit import AuditEvent, AuditSource


def record_audit(
    db: Session,
    actor_id: str,
    action: str,
    entity_key: str,
    before_value: Optional[Dict[str, Any]],
    after_value: Optional[Dict[str, Any]],
    source: str = AuditSource.MANUAL,
    correlation_id: Optional[str] = None,
    commit: bool = False,
) -> AuditEvent:
    event = AuditEvent(
        actor_id=actor_id,
        action=action,
        entity_key=entity_key,
        before_value=before_value,
        after_value=after_value,
        source=source,
        correlation_id=correlation_id,
    )
    db.add(event)
    if commit:
        db.commit()
        db.refresh(event)
    return event
