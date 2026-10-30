import csv
import io
import re
from decimal import Decimal, InvalidOperation
from typing import Dict, Any, List, Tuple, Set, Optional
from sqlalchemy.orm import Session
from sqlalchemy import select
from app.models.store import Store
from app.models.product import Product
from app.models.pricing import StorePricing
from app.models.import_row import ImportRow, ImportRowStatus
from app.core.config import settings

CANONICAL_HEADERS = ["store_code", "product_sku", "country_code", "currency_code", "price"]
COUNTRY_CODE_REGEX = re.compile(r"^[A-Za-z]{2,3}$")
CURRENCY_CODE_REGEX = re.compile(r"^[A-Za-z]{3}$")


class CsvValidationError(Exception):
    pass


def parse_and_stage_csv(
    db: Session,
    file_stream: io.BytesIO,
    job_id: str,
) -> Tuple[int, int, int]:
    """
    Parses CSV, validates structure and business rules, detects duplicate keys,
    captures current expected_version for existing pricing, and bulk-inserts import_rows.
    Returns (total_rows, valid_rows, invalid_rows).
    """
    # 1. Read and decode UTF-8 safely
    try:
        content = file_stream.read().decode("utf-8-sig")
    except UnicodeDecodeError as e:
        raise CsvValidationError(f"File encoding is invalid. UTF-8 encoded CSV is required: {str(e)}")

    lines = content.splitlines()
    if not lines or not any(line.strip() for line in lines):
        raise CsvValidationError("CSV file is empty")

    csv_reader = csv.reader(lines)
    try:
        raw_header = next(csv_reader)
    except StopIteration:
        raise CsvValidationError("CSV file is empty or missing header row")

    if len(raw_header) > settings.MAX_COLUMNS:
        raise CsvValidationError(
            f"CSV column limit exceeded: file contains {len(raw_header)} columns (max allowed: {settings.MAX_COLUMNS})"
        )

    # Normalize header names (lowercase, stripped)
    header = [col.strip().lower() for col in raw_header]
    missing_headers = [col for col in CANONICAL_HEADERS if col not in header]
    if missing_headers:
        raise CsvValidationError(
            f"CSV missing required canonical headers: {', '.join(missing_headers)}. Found headers: {', '.join(header)}"
        )

    # Column index mapping
    col_idx = {col: header.index(col) for col in CANONICAL_HEADERS}

    # Pre-fetch lookup caches for stores and products
    stores = db.scalars(select(Store).where(Store.active == True)).all()
    store_map: Dict[str, Store] = {s.store_code.strip().upper(): s for s in stores}

    products = db.scalars(select(Product).where(Product.active == True)).all()
    product_map: Dict[str, Product] = {p.sku.strip().upper(): p for p in products}

    # Pre-fetch existing pricing records: key = (store_id, product_id, country_code, currency_code) -> (pricing_id, version)
    existing_pricing = db.scalars(select(StorePricing)).all()
    pricing_map: Dict[Tuple[int, int, str, str], Tuple[int, int]] = {
        (ep.store_id, ep.product_id, ep.country_code.upper(), ep.currency_code.upper()): (ep.id, ep.version)
        for ep in existing_pricing
    }

    # Pass 1: Parse rows, check counts and row-level field formats
    parsed_rows: List[Dict[str, Any]] = []
    key_to_row_indices: Dict[Tuple[str, str, str, str], List[int]] = {}

    row_count = 0
    for row_idx, row in enumerate(csv_reader, start=1):
        # Skip empty lines
        if not row or not any(field.strip() for field in row):
            continue

        row_count += 1
        if row_count > settings.MAX_DATA_ROWS:
            raise CsvValidationError(
                f"CSV row limit exceeded: file contains > {settings.MAX_DATA_ROWS} data rows (max allowed: {settings.MAX_DATA_ROWS})"
            )

        row_errors: List[Dict[str, Any]] = []

        # Check column width
        if len(row) > settings.MAX_COLUMNS:
            row_errors.append({
                "field": "columns",
                "code": "COLUMN_LIMIT_EXCEEDED",
                "message": f"Row has {len(row)} columns, exceeding maximum {settings.MAX_COLUMNS}",
            })

        # Extract fields
        def get_field(name: str) -> str:
            idx = col_idx[name]
            return row[idx].strip() if idx < len(row) else ""

        raw_store = get_field("store_code")
        raw_sku = get_field("product_sku")
        raw_country = get_field("country_code")
        raw_currency = get_field("currency_code")
        raw_price = get_field("price")

        raw_payload = {header[i]: row[i] if i < len(row) else "" for i in range(len(header))}

        # Validation: store_code
        store_obj: Optional[Store] = None
        if not raw_store:
            row_errors.append({
                "field": "store_code",
                "code": "REQUIRED_FIELD_MISSING",
                "message": "store_code is required and cannot be empty",
            })
        else:
            store_obj = store_map.get(raw_store.upper())
            if not store_obj:
                row_errors.append({
                    "field": "store_code",
                    "code": "UNKNOWN_STORE",
                    "message": f"Store code '{raw_store}' does not match any known active store",
                })

        # Validation: product_sku
        product_obj: Optional[Product] = None
        if not raw_sku:
            row_errors.append({
                "field": "product_sku",
                "code": "REQUIRED_FIELD_MISSING",
                "message": "product_sku is required and cannot be empty",
            })
        else:
            product_obj = product_map.get(raw_sku.upper())
            if not product_obj:
                row_errors.append({
                    "field": "product_sku",
                    "code": "UNKNOWN_PRODUCT",
                    "message": f"Product SKU '{raw_sku}' does not match any known active product",
                })

        # Validation: country_code
        norm_country = raw_country.upper()
        if not norm_country or not COUNTRY_CODE_REGEX.match(norm_country):
            row_errors.append({
                "field": "country_code",
                "code": "INVALID_COUNTRY_CODE",
                "message": f"country_code '{raw_country}' must be a valid 2-3 letter ISO code",
            })

        # Validation: currency_code
        norm_currency = raw_currency.upper()
        if not norm_currency or not CURRENCY_CODE_REGEX.match(norm_currency):
            row_errors.append({
                "field": "currency_code",
                "code": "INVALID_CURRENCY_CODE",
                "message": f"currency_code '{raw_currency}' must be a valid 3-letter currency code",
            })

        # Validation: price
        parsed_price: Optional[Decimal] = None
        if not raw_price:
            row_errors.append({
                "field": "price",
                "code": "REQUIRED_FIELD_MISSING",
                "message": "price is required and cannot be empty",
            })
        else:
            try:
                dec = Decimal(raw_price)
                if dec.as_tuple().exponent < -2:
                    row_errors.append({
                        "field": "price",
                        "code": "EXCESS_PRECISION",
                        "message": f"Price '{raw_price}' has excess fractional precision (maximum 2 decimal places allowed, no silent rounding)",
                    })
                elif dec < 0:
                    row_errors.append({
                        "field": "price",
                        "code": "NEGATIVE_PRICE",
                        "message": f"Price '{raw_price}' cannot be negative",
                    })
                elif dec > Decimal("9999999999.99"):
                    row_errors.append({
                        "field": "price",
                        "code": "PRICE_OVERFLOW",
                        "message": f"Price '{raw_price}' exceeds maximum allowable magnitude (NUMERIC(12,2))",
                    })
                else:
                    parsed_price = dec
            except InvalidOperation:
                row_errors.append({
                    "field": "price",
                    "code": "INVALID_DECIMAL",
                    "message": f"Price '{raw_price}' is not a valid decimal number",
                })

        # Business key for duplicate checking within this CSV
        bus_key = (raw_store.upper(), raw_sku.upper(), norm_country, norm_currency)
        if raw_store and raw_sku and norm_country and norm_currency:
            if bus_key not in key_to_row_indices:
                key_to_row_indices[bus_key] = []
            key_to_row_indices[bus_key].append(len(parsed_rows))

        parsed_rows.append({
            "row_number": row_count,
            "raw_payload": raw_payload,
            "store_code": raw_store,
            "product_sku": raw_sku,
            "country_code": norm_country,
            "currency_code": norm_currency,
            "price": parsed_price,
            "store_obj": store_obj,
            "product_obj": product_obj,
            "errors": row_errors,
            "bus_key": bus_key,
        })

    # Pass 2: Duplicate key detection
    # "If two input rows share the same business key, flag both rows as duplicate-key errors"
    for bus_key, indices in key_to_row_indices.items():
        if len(indices) > 1:
            for idx in indices:
                parsed_rows[idx]["errors"].append({
                    "field": "business_key",
                    "code": "DUPLICATE_KEY_IN_FILE",
                    "message": (
                        f"Duplicate business key (Store: '{bus_key[0]}', SKU: '{bus_key[1]}', "
                        f"Country: '{bus_key[2]}', Currency: '{bus_key[3]}') found on {len(indices)} rows in this file. "
                        "All duplicates are flagged to prevent silent overwrites."
                    ),
                })

    # Pass 3: Staging import_rows with expected_version
    import_row_objects: List[ImportRow] = []
    valid_count = 0
    invalid_count = 0

    for r in parsed_rows:
        errors = r["errors"]
        is_valid = len(errors) == 0

        expected_version: Optional[int] = None
        if is_valid and r["store_obj"] and r["product_obj"]:
            key = (r["store_obj"].id, r["product_obj"].id, r["country_code"], r["currency_code"])
            if key in pricing_map:
                pricing_id, current_ver = pricing_map[key]
                expected_version = current_ver
            else:
                expected_version = None  # Indicates new insert

        if is_valid:
            valid_count += 1
            status = ImportRowStatus.VALID
        else:
            invalid_count += 1
            status = ImportRowStatus.INVALID

        import_row_obj = ImportRow(
            import_job_id=job_id,
            row_number=r["row_number"],
            store_code=r["store_code"],
            product_sku=r["product_sku"],
            country_code=r["country_code"],
            currency_code=r["currency_code"],
            price=r["price"],
            raw_data=r["raw_payload"],
            status=status,
            errors=errors if errors else None,
            expected_version=expected_version,
        )
        import_row_objects.append(import_row_obj)

    # Batch insert staged rows into DB
    batch_size = settings.DB_BATCH_SIZE
    for i in range(0, len(import_row_objects), batch_size):
        db.add_all(import_row_objects[i : i + batch_size])
        db.flush()

    return row_count, valid_count, invalid_count
