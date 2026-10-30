from datetime import datetime
from typing import Optional, Tuple, List, Dict, Any
from sqlalchemy import select, func
from sqlalchemy.orm import Session
from app.models.import_job import ImportJob, ImportJobStatus
from app.models.import_row import ImportRow, ImportRowStatus
from app.core.errors import NotFoundError, InvalidStateTransitionError
from app.workers.tasks import validate_import_file_task, apply_import_job_task
from app.core.logging import logger


def dispatch_validation(job_id: str, run_sync: bool = False) -> None:
    if run_sync:
        validate_import_file_task(job_id)
    else:
        try:
            validate_import_file_task.delay(job_id)
        except Exception as e:
            logger.warning(f"Could not dispatch via Celery broker ({e}); running inline fallback.")
            validate_import_file_task(job_id)


def dispatch_apply(
    job_id: str,
    actor_id: str,
    selected_row_ids: Optional[List[int]] = None,
    run_sync: bool = False,
) -> None:
    if run_sync:
        apply_import_job_task(job_id, actor_id, selected_row_ids=selected_row_ids)
    else:
        try:
            apply_import_job_task.delay(job_id, actor_id, selected_row_ids=selected_row_ids)
        except Exception as e:
            logger.warning(f"Could not dispatch via Celery broker ({e}); running inline fallback.")
            apply_import_job_task(job_id, actor_id, selected_row_ids=selected_row_ids)


def create_import_job(
    db: Session,
    original_filename: str,
    storage_key: str,
    created_by: str = "dev-analyst-01",
    run_sync: bool = False,
) -> ImportJob:
    job = ImportJob(
        original_filename=original_filename,
        storage_key=storage_key,
        status=ImportJobStatus.UPLOADED,
        created_by=created_by,
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    # Trigger async validation worker
    dispatch_validation(job.id, run_sync=run_sync)
    db.refresh(job)
    return job


def get_import_job(db: Session, job_id: str) -> ImportJob:
    job = db.scalar(select(ImportJob).where(ImportJob.id == job_id))
    if not job:
        raise NotFoundError(f"Import job {job_id} not found")
    return job


def list_import_jobs(
    db: Session,
    status: Optional[str] = None,
    page: int = 1,
    limit: int = 20,
) -> Tuple[List[ImportJob], int]:
    stmt = select(ImportJob)
    if status:
        stmt = stmt.where(ImportJob.status == status.strip().upper())

    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = db.scalar(count_stmt) or 0

    offset = (page - 1) * limit
    paged_stmt = stmt.order_by(ImportJob.created_at.desc()).offset(offset).limit(limit)
    jobs = db.scalars(paged_stmt).all()

    return list(jobs), total


def get_import_rows(
    db: Session,
    job_id: str,
    status: Optional[str] = None,
    page: int = 1,
    limit: int = 50,
) -> Tuple[List[ImportRow], int]:
    # Ensure job exists
    get_import_job(db, job_id)

    stmt = select(ImportRow).where(ImportRow.import_job_id == job_id)
    if status:
        stmt = stmt.where(ImportRow.status == status.strip().upper())

    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = db.scalar(count_stmt) or 0

    offset = (page - 1) * limit
    paged_stmt = stmt.order_by(ImportRow.row_number.asc()).offset(offset).limit(limit)
    rows = db.scalars(paged_stmt).all()

    return list(rows), total


def confirm_import_job(
    db: Session,
    job_id: str,
    selected_row_ids: Optional[List[int]] = None,
    actor_id: str = "dev-analyst-01",
    run_sync: bool = False,
) -> ImportJob:
    job = get_import_job(db, job_id)

    if job.status != ImportJobStatus.AWAITING_CONFIRMATION:
        raise InvalidStateTransitionError(
            f"Cannot confirm job {job_id} in state '{job.status}'. Only jobs in 'AWAITING_CONFIRMATION' can be confirmed."
        )

    job.confirmed_at = datetime.now()
    job.status = ImportJobStatus.APPLYING
    db.commit()
    db.refresh(job)

    dispatch_apply(job.id, actor_id, selected_row_ids=selected_row_ids, run_sync=run_sync)
    db.refresh(job)
    return job


def cancel_import_job(
    db: Session,
    job_id: str,
    actor_id: str = "dev-analyst-01",
) -> ImportJob:
    job = get_import_job(db, job_id)

    if job.status not in (ImportJobStatus.UPLOADED, ImportJobStatus.AWAITING_CONFIRMATION):
        raise InvalidStateTransitionError(
            f"Cannot cancel job {job_id} in state '{job.status}'. Cancellation is only allowed before apply."
        )

    job.status = ImportJobStatus.CANCELLED
    db.commit()
    db.refresh(job)
    return job
