import os
from typing import Optional
from fastapi import APIRouter, Depends, UploadFile, File, Query, status
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.schemas.imports import (
    ImportJobResponse,
    ImportRowResponse,
    ConfirmImportRequest,
    ConfirmImportResponse,
    CancelImportResponse,
)
from app.schemas.common import PaginatedResponse
from app.services import import_service
from app.storage.local import default_storage
from app.core.config import settings
from app.core.errors import FileLimitExceededError, AppValidationError

router = APIRouter(prefix="/imports", tags=["Imports"])


@router.post("", response_model=ImportJobResponse, status_code=status.HTTP_201_CREATED, summary="Upload CSV pricing feed")
async def upload_pricing_csv(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    if not file.filename:
        raise AppValidationError("File must have a valid filename")

    ext = os.path.splitext(file.filename)[1].lower()
    if ext != ".csv":
        raise AppValidationError(f"Invalid file type '{ext}'. Only .csv files are supported.")

    # Read content while checking size limit (10MB)
    max_size = settings.MAX_UPLOAD_SIZE_BYTES
    content = await file.read(max_size + 1)
    if len(content) > max_size:
        raise FileLimitExceededError(
            f"File size exceeds maximum allowed limit of {max_size // (1024 * 1024)} MB",
            details={"max_bytes": max_size, "received_bytes": len(content)},
        )

    file.file.seek(0)
    storage_key = default_storage.save(file.file, file.filename)

    job = import_service.create_import_job(
        db=db,
        original_filename=file.filename,
        storage_key=storage_key,
        created_by=settings.DEV_ACTOR_ID,
    )
    return job


@router.get("", response_model=PaginatedResponse[ImportJobResponse], summary="List import jobs history")
def list_import_jobs(
    status: Optional[str] = Query(None, description="Filter by status (e.g. UPLOADED, AWAITING_CONFIRMATION, COMPLETED)"),
    page: int = Query(1, ge=1, description="Page number"),
    limit: int = Query(20, ge=1, le=100, description="Items per page"),
    db: Session = Depends(get_db),
):
    items, total = import_service.list_import_jobs(
        db=db,
        status=status,
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


@router.get("/{job_id}", response_model=ImportJobResponse, summary="Get import job details and status")
def get_import_job(job_id: str, db: Session = Depends(get_db)):
    return import_service.get_import_job(db=db, job_id=job_id)


@router.get("/{job_id}/rows", response_model=PaginatedResponse[ImportRowResponse], summary="Get paginated rows and validation errors for a job")
def get_import_rows(
    job_id: str,
    status: Optional[str] = Query(None, description="Filter by row status: VALID, INVALID, APPLIED, CONFLICT, SKIPPED"),
    page: int = Query(1, ge=1, description="Page number"),
    limit: int = Query(50, ge=1, le=200, description="Items per page"),
    db: Session = Depends(get_db),
):
    items, total = import_service.get_import_rows(
        db=db,
        job_id=job_id,
        status=status,
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


@router.post("/{job_id}/confirm", response_model=ConfirmImportResponse, summary="Confirm applying eligible valid rows (all or selectively)")
def confirm_import(
    job_id: str,
    payload: Optional[ConfirmImportRequest] = None,
    db: Session = Depends(get_db),
):
    selected_row_ids = payload.selected_row_ids if payload else None
    job = import_service.confirm_import_job(
        db=db,
        job_id=job_id,
        selected_row_ids=selected_row_ids,
        actor_id=settings.DEV_ACTOR_ID,
    )
    count_desc = f"{len(selected_row_ids)} selected rows" if selected_row_ids is not None else "all eligible rows"
    return ConfirmImportResponse(
        job_id=job.id,
        status=job.status,
        message=f"Import confirmed. Applying {count_desc} asynchronously.",
        selected_rows_count=len(selected_row_ids) if selected_row_ids is not None else None,
    )


@router.post("/{job_id}/cancel", response_model=CancelImportResponse, summary="Cancel an import job prior to applying")
def cancel_import(job_id: str, db: Session = Depends(get_db)):
    job = import_service.cancel_import_job(
        db=db,
        job_id=job_id,
        actor_id=settings.DEV_ACTOR_ID,
    )
    return CancelImportResponse(
        job_id=job.id,
        status=job.status,
        message="Import job has been cancelled.",
    )
