import io
from decimal import Decimal
from sqlalchemy import select
from app.models.import_job import ImportJob, ImportJobStatus
from app.models.import_row import ImportRow, ImportRowStatus
from app.models.pricing import StorePricing
from app.models.store import Store
from app.models.product import Product
from app.models.audit import AuditEvent, AuditAction
from app.storage.local import default_storage
from app.workers.parser import parse_and_stage_csv
from app.workers.tasks import apply_import_job_task


def test_happy_path_import_and_apply(db_session):
    # Stored CSV with 1 update (SKU-ELEC-1001) and 1 insert (SKU-ELEC-1002)
    csv_bytes = (
        b"store_code,product_sku,country_code,currency_code,price\n"
        b"STR-US-001,SKU-ELEC-1001,US,USD,235.00\n"
        b"STR-US-001,SKU-ELEC-1002,US,USD,420.00\n"
    )
    storage_key = default_storage.save(io.BytesIO(csv_bytes), "test_happy.csv")

    job = ImportJob(original_filename="test_happy.csv", storage_key=storage_key)
    db_session.add(job)
    db_session.commit()

    # Stage
    total, valid, invalid = parse_and_stage_csv(db_session, io.BytesIO(csv_bytes), job.id)
    assert total == 2
    assert valid == 2
    assert invalid == 0

    job.total_rows = total
    job.valid_rows = valid
    job.invalid_rows = invalid
    job.status = ImportJobStatus.AWAITING_CONFIRMATION
    db_session.commit()

    # Check expected versions
    rows = db_session.scalars(select(ImportRow).where(ImportRow.import_job_id == job.id)).all()
    # First row is update to existing record -> expected_version = 1
    assert rows[0].expected_version == 1
    # Second row is new insert -> expected_version is None
    assert rows[1].expected_version is None

    # Apply
    apply_import_job_task(job.id, actor_id="test-runner", db=db_session)
    db_session.refresh(job)

    assert job.status == ImportJobStatus.COMPLETED
    assert job.applied_rows == 2
    assert job.conflicted_rows == 0

    # Verify updated pricing
    p1 = db_session.scalar(
        select(StorePricing)
        .join(Store)
        .join(Product)
        .where(Store.store_code == "STR-US-001", Product.sku == "SKU-ELEC-1001")
    )
    assert float(p1.price) == 235.00
    assert p1.version == 2

    # Verify inserted pricing
    p2 = db_session.scalar(
        select(StorePricing)
        .join(Store)
        .join(Product)
        .where(Store.store_code == "STR-US-001", Product.sku == "SKU-ELEC-1002")
    )
    assert float(p2.price) == 420.00
    assert p2.version == 1


def test_partial_success_with_mixed_rows(db_session):
    # 1 valid row, 1 invalid row
    csv_bytes = (
        b"store_code,product_sku,country_code,currency_code,price\n"
        b"STR-US-001,SKU-ELEC-1003,US,USD,115.00\n"
        b"UNKNOWN_STORE,SKU-ELEC-1004,US,USD,50.00\n"
    )
    job = ImportJob(original_filename="test_mixed.csv", storage_key="mixed.csv")
    db_session.add(job)
    db_session.commit()

    total, valid, invalid = parse_and_stage_csv(db_session, io.BytesIO(csv_bytes), job.id)
    assert total == 2
    assert valid == 1
    assert invalid == 1

    job.total_rows = total
    job.valid_rows = valid
    job.invalid_rows = invalid
    job.status = ImportJobStatus.AWAITING_CONFIRMATION
    db_session.commit()

    # Apply eligible rows
    apply_import_job_task(job.id, actor_id="test-runner", db=db_session)
    db_session.refresh(job)

    # Status must be COMPLETED_WITH_ERRORS
    assert job.status == ImportJobStatus.COMPLETED_WITH_ERRORS
    assert job.applied_rows == 1
    assert job.invalid_rows == 1

    # Valid row applied
    row_valid = db_session.scalar(
        select(ImportRow).where(ImportRow.import_job_id == job.id, ImportRow.row_number == 1)
    )
    assert row_valid.status == ImportRowStatus.APPLIED


def test_stale_version_conflict_during_apply_is_detected(db_session):
    # CSV wants to update STR-US-001 / SKU-ELEC-1001 (currently version 1, price 249.99)
    csv_bytes = (
        b"store_code,product_sku,country_code,currency_code,price\n"
        b"STR-US-001,SKU-ELEC-1001,US,USD,210.00\n"
    )
    job = ImportJob(original_filename="conflict.csv", storage_key="conflict.csv")
    db_session.add(job)
    db_session.commit()

    # Staging captures expected_version = 1
    parse_and_stage_csv(db_session, io.BytesIO(csv_bytes), job.id)
    job.total_rows = 1
    job.valid_rows = 1
    job.status = ImportJobStatus.AWAITING_CONFIRMATION
    db_session.commit()

    # Concurrent modification happens while awaiting confirmation!
    p = db_session.scalar(
        select(StorePricing)
        .join(Store)
        .join(Product)
        .where(Store.store_code == "STR-US-001", Product.sku == "SKU-ELEC-1001")
    )
    p.price = Decimal("299.99")
    p.version = 2
    db_session.commit()

    # Apply is executed
    apply_import_job_task(job.id, actor_id="test-runner", db=db_session)
    db_session.refresh(job)

    # Concurrency conflict detected!
    assert job.status == ImportJobStatus.COMPLETED_WITH_CONFLICTS
    assert job.conflicted_rows == 1
    assert job.applied_rows == 0

    # Ensure newer price was NOT overwritten
    db_session.refresh(p)
    assert float(p.price) == 299.99
    assert p.version == 2


def test_apply_idempotency_on_redelivery(db_session):
    # Verify repeating apply does not double-increment or duplicate rows
    csv_bytes = (
        b"store_code,product_sku,country_code,currency_code,price\n"
        b"STR-US-001,SKU-ELEC-1005,US,USD,35.00\n"
    )
    job = ImportJob(original_filename="idempotent.csv", storage_key="idempotent.csv")
    db_session.add(job)
    db_session.commit()

    parse_and_stage_csv(db_session, io.BytesIO(csv_bytes), job.id)
    job.status = ImportJobStatus.AWAITING_CONFIRMATION
    db_session.commit()

    # First apply
    apply_import_job_task(job.id, actor_id="test-runner", db=db_session)
    db_session.refresh(job)
    assert job.applied_rows == 1

    p = db_session.scalar(
        select(StorePricing)
        .join(Store)
        .join(Product)
        .where(Store.store_code == "STR-US-001", Product.sku == "SKU-ELEC-1005")
    )
    assert p.version == 1

    # Second apply (simulating task redelivery)
    apply_import_job_task(job.id, actor_id="test-runner", db=db_session)
    db_session.refresh(job)
    db_session.refresh(p)

    # Applied rows still 1, version still 1 (no double apply!)
    assert job.applied_rows == 1
    assert p.version == 1


def test_selective_row_execution(db_session):
    # Stored CSV with 3 valid rows
    csv_bytes = (
        b"store_code,product_sku,country_code,currency_code,price\n"
        b"STR-US-001,SKU-ELEC-1002,US,USD,111.00\n"
        b"STR-US-001,SKU-ELEC-1003,US,USD,222.00\n"
        b"STR-US-001,SKU-ELEC-1004,US,USD,333.00\n"
    )
    job = ImportJob(original_filename="selective.csv", storage_key="selective.csv")
    db_session.add(job)
    db_session.commit()

    total, valid, invalid = parse_and_stage_csv(db_session, io.BytesIO(csv_bytes), job.id)
    assert total == 3
    assert valid == 3
    job.total_rows = total
    job.valid_rows = valid
    job.status = ImportJobStatus.AWAITING_CONFIRMATION
    db_session.commit()

    rows = db_session.scalars(select(ImportRow).where(ImportRow.import_job_id == job.id).order_by(ImportRow.row_number.asc())).all()
    assert len(rows) == 3

    # User selects ONLY Row 1 and Row 3 (excludes Row 2)
    selected_ids = [rows[0].id, rows[2].id]
    apply_import_job_task(job.id, actor_id="test-runner", selected_row_ids=selected_ids, db=db_session)
    db_session.refresh(job)

    # 2 rows applied, 1 row skipped
    assert job.applied_rows == 2
    assert job.status == ImportJobStatus.COMPLETED_WITH_ERRORS

    db_session.refresh(rows[0])
    db_session.refresh(rows[1])
    db_session.refresh(rows[2])

    assert rows[0].status == ImportRowStatus.APPLIED
    assert rows[1].status == ImportRowStatus.SKIPPED
    assert rows[1].errors[0]["code"] == "ROW_NOT_SELECTED"
    assert rows[2].status == ImportRowStatus.APPLIED

    # Verify database has Row 1 and Row 3 price updates
    p1 = db_session.scalar(select(StorePricing).join(Product).where(Product.sku == "SKU-ELEC-1002"))
    p2 = db_session.scalar(select(StorePricing).join(Product).where(Product.sku == "SKU-ELEC-1003"))
    p3 = db_session.scalar(select(StorePricing).join(Product).where(Product.sku == "SKU-ELEC-1004"))
    assert p1 is not None and float(p1.price) == 111.00
    assert p2 is None  # Not created because excluded
    assert p3 is not None and float(p3.price) == 333.00
