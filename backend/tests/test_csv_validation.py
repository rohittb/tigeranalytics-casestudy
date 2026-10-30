import io
import pytest
from app.workers.parser import parse_and_stage_csv, CsvValidationError
from app.models.import_job import ImportJob
from app.models.import_row import ImportRow, ImportRowStatus
from sqlalchemy import select


def test_missing_canonical_headers_raises_error(db_session):
    job = ImportJob(original_filename="bad_header.csv", storage_key="bad.csv")
    db_session.add(job)
    db_session.commit()

    bad_csv = io.BytesIO(b"store_code,product_sku,price\nSTR-US-001,SKU-ELEC-1001,19.99\n")
    with pytest.raises(CsvValidationError) as exc:
        parse_and_stage_csv(db_session, bad_csv, job.id)
    assert "missing required canonical headers" in str(exc.value).lower()


def test_unknown_store_and_sku_flagged_as_invalid(db_session):
    job = ImportJob(original_filename="unknown.csv", storage_key="unknown.csv")
    db_session.add(job)
    db_session.commit()

    csv_data = io.BytesIO(
        b"store_code,product_sku,country_code,currency_code,price\n"
        b"NON_EXISTENT_STORE,SKU-ELEC-1001,US,USD,199.99\n"
        b"STR-US-001,NON_EXISTENT_SKU,US,USD,199.99\n"
    )
    total, valid, invalid = parse_and_stage_csv(db_session, csv_data, job.id)
    assert total == 2
    assert valid == 0
    assert invalid == 2

    rows = db_session.scalars(select(ImportRow).where(ImportRow.import_job_id == job.id)).all()
    assert rows[0].status == ImportRowStatus.INVALID
    assert any(e["code"] == "UNKNOWN_STORE" for e in rows[0].errors)
    assert rows[1].status == ImportRowStatus.INVALID
    assert any(e["code"] == "UNKNOWN_PRODUCT" for e in rows[1].errors)


def test_excess_precision_and_negative_price_flagged(db_session):
    job = ImportJob(original_filename="price_errors.csv", storage_key="price_errors.csv")
    db_session.add(job)
    db_session.commit()

    csv_data = io.BytesIO(
        b"store_code,product_sku,country_code,currency_code,price\n"
        b"STR-US-001,SKU-ELEC-1001,US,USD,199.999\n"
        b"STR-US-001,SKU-ELEC-1002,US,USD,-50.00\n"
    )
    total, valid, invalid = parse_and_stage_csv(db_session, csv_data, job.id)
    assert total == 2
    assert invalid == 2

    rows = db_session.scalars(select(ImportRow).where(ImportRow.import_job_id == job.id)).all()
    assert any(e["code"] == "EXCESS_PRECISION" for e in rows[0].errors)
    assert any(e["code"] == "NEGATIVE_PRICE" for e in rows[1].errors)


def test_duplicate_keys_in_file_both_flagged(db_session):
    job = ImportJob(original_filename="duplicates.csv", storage_key="duplicates.csv")
    db_session.add(job)
    db_session.commit()

    # Two rows with identical business key (STR-US-001, SKU-ELEC-1002, US, USD)
    csv_data = io.BytesIO(
        b"store_code,product_sku,country_code,currency_code,price\n"
        b"STR-US-001,SKU-ELEC-1002,US,USD,399.00\n"
        b"STR-US-001,SKU-ELEC-1002,US,USD,389.00\n"
    )
    total, valid, invalid = parse_and_stage_csv(db_session, csv_data, job.id)
    assert total == 2
    assert valid == 0
    assert invalid == 2

    rows = db_session.scalars(select(ImportRow).where(ImportRow.import_job_id == job.id)).all()
    # Both rows must be flagged with DUPLICATE_KEY_IN_FILE
    for r in rows:
        assert r.status == ImportRowStatus.INVALID
        assert any(e["code"] == "DUPLICATE_KEY_IN_FILE" for e in r.errors)
