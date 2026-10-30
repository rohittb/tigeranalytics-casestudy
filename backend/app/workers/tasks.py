import io
from datetime import datetime
from decimal import Decimal
from typing import Dict, Any, List, Optional
from sqlalchemy import select, func
from sqlalchemy.orm import Session
from app.workers.celery_app import celery_app
from app.db.session import SessionLocal
from app.models.import_job import ImportJob, ImportJobStatus
from app.models.import_row import ImportRow, ImportRowStatus
from app.models.pricing import StorePricing
from app.models.store import Store
from app.models.product import Product
from app.models.audit import AuditEvent, AuditAction, AuditSource
from app.services.audit_service import record_audit
from app.storage.local import default_storage
from app.workers.parser import parse_and_stage_csv, CsvValidationError
from app.core.config import settings
from app.core.logging import logger


@celery_app.task(name="validate_import_file_task")
def validate_import_file_task(job_id: str, db: Optional[Session] = None) -> Dict[str, Any]:
    logger.info(f"Starting CSV validation task for import job {job_id}")
    close_db = False
    if db is None:
        db = SessionLocal()
        close_db = True
    try:
        job = db.scalar(select(ImportJob).where(ImportJob.id == job_id))
        if not job:
            logger.error(f"Import job {job_id} not found in database")
            return {"status": "error", "message": "Job not found"}

        job.status = ImportJobStatus.VALIDATING
        db.commit()

        # Open file from storage
        try:
            with default_storage.open(job.storage_key) as f:
                content = f.read()
                file_stream = io.BytesIO(content)
        except Exception as e:
            logger.error(f"Failed to read file for job {job_id}: {str(e)}")
            job.status = ImportJobStatus.FAILED
            job.failure_summary = f"Storage error: Could not read uploaded file: {str(e)}"
            db.commit()
            return {"status": "failed", "error": job.failure_summary}

        try:
            total_rows, valid_rows, invalid_rows = parse_and_stage_csv(
                db=db,
                file_stream=file_stream,
                job_id=job_id,
            )
            job.total_rows = total_rows
            job.valid_rows = valid_rows
            job.invalid_rows = invalid_rows
            job.status = ImportJobStatus.AWAITING_CONFIRMATION
            db.commit()
            logger.info(
                f"Validation finished for job {job_id}: {total_rows} total, {valid_rows} valid, {invalid_rows} invalid"
            )
            return {
                "status": "success",
                "total_rows": total_rows,
                "valid_rows": valid_rows,
                "invalid_rows": invalid_rows,
            }
        except CsvValidationError as e:
            logger.warning(f"CSV structural validation failed for job {job_id}: {str(e)}")
            job.status = ImportJobStatus.FAILED
            job.failure_summary = str(e)
            db.commit()
            return {"status": "failed", "error": str(e)}

    except Exception as e:
        logger.exception(f"Unexpected error validating job {job_id}: {str(e)}")
        db.rollback()
        job = db.scalar(select(ImportJob).where(ImportJob.id == job_id))
        if job:
            job.status = ImportJobStatus.FAILED
            job.failure_summary = f"Unexpected processing error: {str(e)}"
            db.commit()
        return {"status": "failed", "error": str(e)}
    finally:
        if close_db:
            db.close()


@celery_app.task(name="apply_import_job_task")
def apply_import_job_task(
    job_id: str,
    actor_id: str = "dev-analyst-01",
    selected_row_ids: Optional[List[int]] = None,
    db: Optional[Session] = None,
) -> Dict[str, Any]:
    logger.info(f"Starting apply task for import job {job_id} by actor {actor_id} (selected_rows={len(selected_row_ids) if selected_row_ids is not None else 'ALL'})")
    close_db = False
    if db is None:
        db = SessionLocal()
        close_db = True
    try:
        job = db.scalar(select(ImportJob).where(ImportJob.id == job_id))
        if not job:
            logger.error(f"Import job {job_id} not found in database")
            return {"status": "error", "message": "Job not found"}

        if job.status != ImportJobStatus.APPLYING and job.status != ImportJobStatus.AWAITING_CONFIRMATION:
            logger.warning(f"Job {job_id} is in status {job.status}, expected AWAITING_CONFIRMATION or APPLYING")

        job.status = ImportJobStatus.APPLYING
        db.commit()

        # If user explicitly selected a subset of error-free rows, mark unselected VALID rows as SKIPPED
        if selected_row_ids is not None:
            unselected_valid_rows = db.scalars(
                select(ImportRow).where(
                    ImportRow.import_job_id == job_id,
                    ImportRow.status == ImportRowStatus.VALID,
                    ~ImportRow.id.in_(selected_row_ids),
                )
            ).all()
            for uv_row in unselected_valid_rows:
                uv_row.status = ImportRowStatus.SKIPPED
                uv_row.errors = [{
                    "field": "selection",
                    "code": "ROW_NOT_SELECTED",
                    "message": "Row was not selected by user for execution",
                }]
            db.commit()

        # Cache active stores and products
        stores = db.scalars(select(Store).where(Store.active == True)).all()
        store_map = {s.store_code.strip().upper(): s for s in stores}

        products = db.scalars(select(Product).where(Product.active == True)).all()
        product_map = {p.sku.strip().upper(): p for p in products}

        # Fetch eligible valid rows that have not yet been applied (idempotency guard)
        eligible_query = select(ImportRow).where(
            ImportRow.import_job_id == job_id,
            ImportRow.status == ImportRowStatus.VALID,
        )
        if selected_row_ids is not None:
            eligible_query = eligible_query.where(ImportRow.id.in_(selected_row_ids))

        eligible_rows = db.scalars(
            eligible_query.order_by(ImportRow.row_number.asc())
        ).all()

        applied_count = job.applied_rows
        conflict_count = job.conflicted_rows
        batch_size = settings.DB_BATCH_SIZE

        now = datetime.now()

        for i in range(0, len(eligible_rows), batch_size):
            batch = eligible_rows[i : i + batch_size]
            for row in batch:
                # Idempotency check: Skip if already applied
                if row.status == ImportRowStatus.APPLIED:
                    continue

                store = store_map.get(row.store_code.upper()) if row.store_code else None
                product = product_map.get(row.product_sku.upper()) if row.product_sku else None

                if not store or not product:
                    row.status = ImportRowStatus.INVALID
                    err = row.errors or []
                    err.append({
                        "field": "reference",
                        "code": "MISSING_ENTITY_AT_APPLY",
                        "message": "Store or product was deactivated or deleted before apply phase",
                    })
                    row.errors = err
                    continue

                # Lock and check current existing record in database
                existing_pricing_query = select(StorePricing).where(
                    StorePricing.store_id == store.id,
                    StorePricing.product_id == product.id,
                    StorePricing.country_code == row.country_code.upper(),
                    StorePricing.currency_code == row.currency_code.upper(),
                )
                if db.bind and db.bind.dialect.name == "postgresql":
                    existing_pricing_query = existing_pricing_query.with_for_update()
                
                existing_pricing = db.scalar(existing_pricing_query)

                entity_key = f"store:{store.store_code}|sku:{product.sku}|{row.country_code.upper()}|{row.currency_code.upper()}"

                # Concurrency check
                has_conflict = False
                if row.expected_version is None:
                    # Staging expected this to be a new insert
                    if existing_pricing is not None:
                        has_conflict = True
                        conflict_message = (
                            f"Concurrency conflict: record was inserted concurrently (current price: "
                            f"{existing_pricing.price}, version: {existing_pricing.version}) while awaiting confirmation."
                        )
                else:
                    # Staging expected an update of row.expected_version
                    if existing_pricing is None:
                        has_conflict = True
                        conflict_message = "Concurrency conflict: record was deleted concurrently before apply."
                    elif existing_pricing.version != row.expected_version:
                        has_conflict = True
                        conflict_message = (
                            f"Concurrency conflict: record was updated from version {row.expected_version} "
                            f"to version {existing_pricing.version} (price: {existing_pricing.price}, "
                            f"by {existing_pricing.updated_by}) while awaiting confirmation."
                        )

                if has_conflict:
                    row.status = ImportRowStatus.CONFLICT
                    err = row.errors or []
                    err.append({
                        "field": "version",
                        "code": "VERSION_CONFLICT_AT_APPLY",
                        "message": conflict_message,
                    })
                    row.errors = err
                    conflict_count += 1
                else:
                    # Apply changes safely
                    if existing_pricing is not None:
                        # UPDATE
                        before_val = {
                            "price": str(existing_pricing.price),
                            "version": existing_pricing.version,
                        }
                        existing_pricing.price = row.price
                        existing_pricing.version = existing_pricing.version + 1
                        existing_pricing.updated_at = now
                        existing_pricing.updated_by = actor_id

                        after_val = {
                            "price": str(row.price),
                            "version": existing_pricing.version,
                        }

                        record_audit(
                            db=db,
                            actor_id=actor_id,
                            action=AuditAction.IMPORT_UPDATE,
                            entity_key=entity_key,
                            before_value=before_val,
                            after_value=after_val,
                            source=AuditSource.IMPORT,
                            correlation_id=job_id,
                            commit=False,
                        )
                    else:
                        # INSERT
                        new_pricing = StorePricing(
                            store_id=store.id,
                            product_id=product.id,
                            country_code=row.country_code.upper(),
                            currency_code=row.currency_code.upper(),
                            price=row.price,
                            version=1,
                            updated_by=actor_id,
                        )
                        db.add(new_pricing)

                        after_val = {
                            "price": str(row.price),
                            "version": 1,
                        }

                        record_audit(
                            db=db,
                            actor_id=actor_id,
                            action=AuditAction.IMPORT_INSERT,
                            entity_key=entity_key,
                            before_value=None,
                            after_value=after_val,
                            source=AuditSource.IMPORT,
                            correlation_id=job_id,
                            commit=False,
                        )

                    row.status = ImportRowStatus.APPLIED
                    row.applied_at = now
                    applied_count += 1

            # Commit batch atomically
            db.commit()

        # Update final job state and counters
        job = db.scalar(select(ImportJob).where(ImportJob.id == job_id))
        job.applied_rows = applied_count
        job.conflicted_rows = conflict_count

        skipped_count = db.scalar(
            select(func.count(ImportRow.id)).where(
                ImportRow.import_job_id == job_id,
                ImportRow.status == ImportRowStatus.SKIPPED,
            )
        ) or 0

        if conflict_count > 0:
            job.status = ImportJobStatus.COMPLETED_WITH_CONFLICTS
        elif job.invalid_rows > 0 or skipped_count > 0:
            job.status = ImportJobStatus.COMPLETED_WITH_ERRORS
        else:
            job.status = ImportJobStatus.COMPLETED

        db.commit()
        logger.info(
            f"Apply finished for job {job_id}: {applied_count} applied, {conflict_count} conflicted, status={job.status}"
        )
        return {
            "status": "success",
            "job_status": job.status,
            "applied_rows": applied_count,
            "conflicted_rows": conflict_count,
        }

    except Exception as e:
        logger.exception(f"Unexpected error in apply task for job {job_id}: {str(e)}")
        db.rollback()
        job = db.scalar(select(ImportJob).where(ImportJob.id == job_id))
        if job:
            job.status = ImportJobStatus.FAILED
            job.failure_summary = f"Fatal apply engine error: {str(e)}"
            db.commit()
        return {"status": "failed", "error": str(e)}
    finally:
        if close_db:
            db.close()
