import io
import pytest
from app.workers.parser import parse_and_stage_csv, CsvValidationError
from app.models.import_job import ImportJob
from app.core.config import settings


def test_file_size_exceeding_10mb_rejected_with_413(client):
    # Create content that exceeds MAX_UPLOAD_SIZE_BYTES (10 MB + 100 bytes)
    oversized_size = settings.MAX_UPLOAD_SIZE_BYTES + 100
    oversized_file = io.BytesIO(b"A" * oversized_size)

    response = client.post(
        "/api/v1/imports",
        files={"file": ("oversized.csv", oversized_file, "text/csv")},
    )
    assert response.status_code == 413
    err = response.json()["error"]
    assert err["code"] == "FILE_LIMIT_EXCEEDED"
    assert "10 MB" in err["message"]


def test_columns_exceeding_50_rejected(db_session):
    job = ImportJob(original_filename="wide.csv", storage_key="wide.csv")
    db_session.add(job)
    db_session.commit()

    # 51 columns: 5 canonical + 46 extra
    headers = ["store_code", "product_sku", "country_code", "currency_code", "price"]
    extra_headers = [f"extra_col_{i}" for i in range(1, 47)]
    all_headers = headers + extra_headers
    assert len(all_headers) == 51

    csv_data = io.BytesIO(",".join(all_headers).encode("utf-8") + b"\n")
    with pytest.raises(CsvValidationError) as exc:
        parse_and_stage_csv(db_session, csv_data, job.id)
    assert "column limit exceeded" in str(exc.value).lower()


def test_columns_at_50_boundary_accepted(db_session):
    job = ImportJob(original_filename="50_cols.csv", storage_key="50_cols.csv")
    db_session.add(job)
    db_session.commit()

    # Exactly 50 columns: 5 canonical + 45 extra
    headers = ["store_code", "product_sku", "country_code", "currency_code", "price"]
    extra_headers = [f"extra_col_{i}" for i in range(1, 46)]
    all_headers = headers + extra_headers
    assert len(all_headers) == 50

    row_data = ["STR-US-001", "SKU-ELEC-1001", "US", "USD", "199.99"] + ["val"] * 45
    csv_content = ",".join(all_headers) + "\n" + ",".join(row_data) + "\n"

    total, valid, invalid = parse_and_stage_csv(db_session, io.BytesIO(csv_content.encode("utf-8")), job.id)
    assert total == 1
    assert valid == 1


def test_rows_exceeding_50000_rejected(db_session, monkeypatch):
    job = ImportJob(original_filename="too_many_rows.csv", storage_key="too_many_rows.csv")
    db_session.add(job)
    db_session.commit()

    # Set threshold low for fast test execution
    monkeypatch.setattr(settings, "MAX_DATA_ROWS", 5)

    lines = ["store_code,product_sku,country_code,currency_code,price"]
    for i in range(6):
        lines.append(f"STR-US-001,SKU-ELEC-1001,US,USD,199.99")

    csv_data = io.BytesIO("\n".join(lines).encode("utf-8"))
    with pytest.raises(CsvValidationError) as exc:
        parse_and_stage_csv(db_session, csv_data, job.id)
    assert "row limit exceeded" in str(exc.value).lower()
