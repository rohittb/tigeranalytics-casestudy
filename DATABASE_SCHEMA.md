# Database Schema & Data Dictionary

Complete database documentation for the **Retail Pricing Management System**, detailing all tables, columns, constraints, indexes, and relationships.

---

## 📊 Entity Relationship Diagram (ERD)

```mermaid
erDiagram
    STORES ||--o{ STORE_PRICING : "has pricing"
    PRODUCTS ||--o{ STORE_PRICING : "priced at"
    IMPORT_JOBS ||--o{ IMPORT_ROWS : "contains"
    IMPORT_JOBS ..o{ AUDIT_EVENTS : "correlates via correlation_id"
    STORE_PRICING ..o{ AUDIT_EVENTS : "audited via entity_key"

    STORES {
        int id PK
        varchar(50) store_code UK "Unique store identifier"
        varchar(255) name "Store display name"
        varchar(10) country_code "ISO-2/3 country code"
        boolean active "Soft delete / active flag"
        timestamptz created_at "Record creation timestamp"
    }

    PRODUCTS {
        int id PK
        varchar(100) sku UK "Unique stock keeping unit"
        varchar(255) name "Product display name"
        varchar(100) category "Product category"
        boolean active "Soft delete / active flag"
        timestamptz created_at "Record creation timestamp"
    }

    STORE_PRICING {
        int id PK
        int store_id FK "References stores.id (CASCADE)"
        int product_id FK "References products.id (CASCADE)"
        varchar(10) country_code "Region code"
        varchar(10) currency_code "ISO-3 currency code"
        numeric(12_2) price "Price (CHECK >= 0)"
        int version "Optimistic Concurrency Version Token (DEFAULT 1)"
        boolean active "Cascaded store active/inactive state (DEFAULT true)"
        timestamptz updated_at "Last updated timestamp"
        varchar(100) updated_by "Actor/analyst ID"
    }

    IMPORT_JOBS {
        varchar(36) id PK "UUID string"
        varchar(255) original_filename "Uploaded CSV filename"
        varchar(500) storage_key "Safe local/S3 storage path"
        varchar(50) status "Job state (UPLOADED, AWAITING_CONFIRMATION, etc.)"
        varchar(100) created_by "Actor who triggered import"
        int total_rows "Total data rows parsed"
        int valid_rows "Count of eligible rows"
        int invalid_rows "Count of rejected rows"
        int applied_rows "Count of successfully applied rows"
        int conflicted_rows "Count of stale version conflicts"
        text failure_summary "Fatal error message if FAILED"
        timestamptz created_at "Job upload timestamp"
        timestamptz updated_at "State transition timestamp"
        timestamptz confirmed_at "User confirmation timestamp"
    }

    IMPORT_ROWS {
        int id PK
        varchar(36) import_job_id FK "References import_jobs.id (CASCADE)"
        int row_number "1-indexed CSV line number"
        varchar(50) store_code "Raw store code"
        varchar(100) product_sku "Raw SKU"
        varchar(10) country_code "Normalized country code"
        varchar(10) currency_code "Normalized currency code"
        numeric(12_2) price "Parsed price"
        json raw_data "Full raw row key-value map"
        varchar(50) status "VALID, INVALID, APPLIED, CONFLICT, SKIPPED"
        json errors "Array of {field, code, message}"
        int expected_version "Captured version at staging (NULL for inserts)"
        timestamptz applied_at "Timestamp when applied"
    }

    AUDIT_EVENTS {
        int id PK
        varchar(100) actor_id "User or process who made the change"
        varchar(50) action "CREATE, UPDATE, IMPORT_INSERT, IMPORT_UPDATE"
        varchar(50) entity_type "Target entity type (store_pricing)"
        varchar(255) entity_key "Composite business key string"
        json before_value "Snapshot prior to change"
        json after_value "Snapshot post change"
        varchar(50) source "MANUAL or IMPORT"
        varchar(255) correlation_id "Import job_id or request trace ID"
        timestamptz created_at "Event timestamp"
    }
```

---

## 🗃️ Detailed Table Specifications

### 1. `stores`
Stores physical and regional retail outlet records across multiple countries.

| Column | Type | Nullable | Default | Constraints & Description |
| :--- | :--- | :---: | :---: | :--- |
| `id` | `INTEGER` | ❌ No | Auto-increment | **PRIMARY KEY** |
| `store_code` | `VARCHAR(50)` | ❌ No | — | **UNIQUE**, Indexed (`ix_stores_store_code`). E.g. `STR-US-001` |
| `name` | `VARCHAR(255)` | ❌ No | — | Human-readable store name (e.g. `Downtown Manhattan Flagship`) |
| `country_code` | `VARCHAR(10)` | ❌ No | — | Indexed (`ix_stores_country_code`). ISO-2/3 code (e.g. `US`, `GB`, `CA`, `DE`) |
| `active` | `BOOLEAN` | ❌ No | `TRUE` | Soft-delete status flag |
| `created_at` | `TIMESTAMPTZ` | ❌ No | `NOW()` | Record creation timestamp |

#### Relationships:
- **`has_many` `store_pricing`**: Cascades on delete (`ondelete="CASCADE"`).

---

### 2. `products`
Product catalogue holding SKUs and product metadata.

| Column | Type | Nullable | Default | Constraints & Description |
| :--- | :--- | :---: | :---: | :--- |
| `id` | `INTEGER` | ❌ No | Auto-increment | **PRIMARY KEY** |
| `sku` | `VARCHAR(100)` | ❌ No | — | **UNIQUE**, Indexed (`ix_products_sku`). E.g. `SKU-ELEC-1001` |
| `name` | `VARCHAR(255)` | ❌ No | — | Product title (e.g. `Pro Wireless Noise-Cancelling Headphones`) |
| `category` | `VARCHAR(100)` | ✔️ Yes | `NULL` | Category classification (e.g. `Electronics`, `Grocery`) |
| `active` | `BOOLEAN` | ❌ No | `TRUE` | Soft-delete status flag |
| `created_at` | `TIMESTAMPTZ` | ❌ No | `NOW()` | Record creation timestamp |

#### Relationships:
- **`has_many` `store_pricing`**: Cascades on delete (`ondelete="CASCADE"`).

---

### 3. `store_pricing`
The core business entity representing price points per store, SKU, and currency with **Optimistic Concurrency Control (OCC)**.

| Column | Type | Nullable | Default | Constraints & Description |
| :--- | :--- | :---: | :---: | :--- |
| `id` | `INTEGER` | ❌ No | Auto-increment | **PRIMARY KEY** |
| `store_id` | `INTEGER` | ❌ No | — | **FOREIGN KEY** -> `stores.id` (`ON DELETE CASCADE`), Indexed |
| `product_id` | `INTEGER` | ❌ No | — | **FOREIGN KEY** -> `products.id` (`ON DELETE CASCADE`), Indexed |
| `country_code` | `VARCHAR(10)` | ❌ No | — | Region code (e.g. `US`, `GB`), Indexed |
| `currency_code`| `VARCHAR(10)` | ❌ No | — | ISO-3 currency (e.g. `USD`, `GBP`, `EUR`, `CAD`) |
| `price` | `NUMERIC(12,2)` | ❌ No | — | Monetary price. **CHECK constraint** `price >= 0` |
| `version` | `INTEGER` | ❌ No | `1` | **Concurrency Version Token**. Incremented atomically on each edit |
| `active` | `BOOLEAN` | ❌ No | `TRUE` | **Active / Lifecycle Flag**. Evaluated dynamically as `(stores.active AND products.active)` to provide zero-lock **O(1)** scalability without mass child row mutations |
| `updated_at` | `TIMESTAMPTZ` | ❌ No | `NOW()` | Timestamp of last modification (auto updated on edit) |
| `updated_by` | `VARCHAR(100)` | ❌ No | `'dev-analyst-01'` | Actor/analyst identifier who made the update |

#### Table-Level Constraints & Indexes:
- **Composite Unique Key**: `UNIQUE (store_id, product_id, country_code, currency_code)` (`uq_store_product_country_currency`)
- **Check Constraint**: `CHECK (price >= 0)` (`ck_store_pricing_price_non_negative`)
- **Foreign Keys**: `store_id -> stores(id)`, `product_id -> products(id)`

#### Concurrency Pattern:
```sql
UPDATE store_pricing
SET price = :new_price,
    version = version + 1,
    updated_at = NOW(),
    updated_by = :actor_id
WHERE id = :pricing_id AND version = :expected_version
RETURNING version;
```

---

### 4. `import_jobs`
Tracks the asynchronous lifecycle, validation metrics, and terminal status of CSV feed imports.

| Column | Type | Nullable | Default | Constraints & Description |
| :--- | :--- | :---: | :---: | :--- |
| `id` | `VARCHAR(36)` | ❌ No | UUID | **PRIMARY KEY** (UUID string) |
| `original_filename`| `VARCHAR(255)`| ❌ No | — | Original uploaded filename (e.g. `pricing_feed_us.csv`) |
| `storage_key` | `VARCHAR(500)` | ❌ No | — | Safe storage identifier path on local volume / S3 |
| `status` | `VARCHAR(50)` | ❌ No | `'UPLOADED'` | Indexed (`ix_import_jobs_status`). Lifecycle status |
| `created_by` | `VARCHAR(100)` | ❌ No | `'dev-analyst-01'` | Submitting actor identifier |
| `total_rows` | `INTEGER` | ❌ No | `0` | Total data rows parsed (excluding header) |
| `valid_rows` | `INTEGER` | ❌ No | `0` | Count of eligible valid rows |
| `invalid_rows` | `INTEGER` | ❌ No | `0` | Count of rejected rows (validation errors) |
| `applied_rows` | `INTEGER` | ❌ No | `0` | Count of successfully committed rows |
| `conflicted_rows`| `INTEGER` | ❌ No | `0` | Count of stale version conflicts at apply time |
| `failure_summary`| `TEXT` | ✔️ Yes | `NULL` | Detailed error summary if job fails structurally |
| `created_at` | `TIMESTAMPTZ` | ❌ No | `NOW()` | Ingestion timestamp, Indexed (`ix_import_jobs_created_at`) |
| `updated_at` | `TIMESTAMPTZ` | ❌ No | `NOW()` | Last state transition timestamp |
| `confirmed_at` | `TIMESTAMPTZ` | ✔️ Yes | `NULL` | Timestamp when user confirmed eligible rows |

#### State Machine:
```
UPLOADED -> VALIDATING -> AWAITING_CONFIRMATION -> APPLYING -> COMPLETED
                                                            |-> COMPLETED_WITH_ERRORS
                                                            |-> COMPLETED_WITH_CONFLICTS
                                                            |-> FAILED
Any pre-apply state may transition to: CANCELLED
```

---

### 5. `import_rows`
Staged row-level records holding normalized payloads, validation errors, expected versions, and execution outcomes.

| Column | Type | Nullable | Default | Constraints & Description |
| :--- | :--- | :---: | :---: | :--- |
| `id` | `INTEGER` | ❌ No | Auto-increment | **PRIMARY KEY** |
| `import_job_id` | `VARCHAR(36)` | ❌ No | — | **FOREIGN KEY** -> `import_jobs.id` (`ON DELETE CASCADE`), Indexed |
| `row_number` | `INTEGER` | ❌ No | — | 1-indexed row position in the CSV |
| `store_code` | `VARCHAR(50)` | ✔️ Yes | `NULL` | Parsed store code |
| `product_sku` | `VARCHAR(100)` | ✔️ Yes | `NULL` | Parsed product SKU |
| `country_code` | `VARCHAR(10)` | ✔️ Yes | `NULL` | Normalized 2-3 char country code |
| `currency_code`| `VARCHAR(10)` | ✔️ Yes | `NULL` | Normalized 3-char currency code |
| `price` | `NUMERIC(12,2)` | ✔️ Yes | `NULL` | Parsed price decimal |
| `raw_data` | `JSON` | ❌ No | — | Full raw row key-value snapshot |
| `status` | `VARCHAR(50)` | ❌ No | `'PENDING'` | Indexed (`ix_import_rows_status`): `VALID`, `INVALID`, `APPLIED`, `CONFLICT`, `SKIPPED` |
| `errors` | `JSON` | ✔️ Yes | `NULL` | Array of `{field, code, message}` validation reasons |
| `expected_version`| `INTEGER` | ✔️ Yes | `NULL` | Captured during staging (`NULL` = new insert, `int` = expected version) |
| `applied_at` | `TIMESTAMPTZ` | ✔️ Yes | `NULL` | Timestamp when row was applied to `store_pricing` |

#### Table-Level Constraints:
- **Composite Unique Key**: `UNIQUE (import_job_id, row_number)` (`uq_import_job_row_number`)
- **Foreign Key**: `import_job_id -> import_jobs(id) ON DELETE CASCADE`

---

### 6. `audit_events`
Immutable historical log of all price changes across manual and automated import workflows.

| Column | Type | Nullable | Default | Constraints & Description |
| :--- | :--- | :---: | :---: | :--- |
| `id` | `INTEGER` | ❌ No | Auto-increment | **PRIMARY KEY** |
| `actor_id` | `VARCHAR(100)` | ❌ No | — | Actor who executed the operation (e.g. `dev-analyst-01`) |
| `action` | `VARCHAR(50)` | ❌ No | — | `CREATE`, `UPDATE`, `IMPORT_INSERT`, `IMPORT_UPDATE` |
| `entity_type` | `VARCHAR(50)` | ❌ No | `'store_pricing'`| Target entity domain |
| `entity_key` | `VARCHAR(255)` | ❌ No | — | Indexed (`ix_audit_events_entity_key`): `store:STR-US-001\|sku:PROD-001\|US\|USD` |
| `before_value` | `JSON` | ✔️ Yes | `NULL` | JSON snapshot before change: `{"price": "249.99", "version": 1}` |
| `after_value` | `JSON` | ✔️ Yes | `NULL` | JSON snapshot after change: `{"price": "269.99", "version": 2}` |
| `source` | `VARCHAR(50)` | ❌ No | — | `MANUAL` (single edit) or `IMPORT` (batch feed) |
| `correlation_id`| `VARCHAR(255)`| ✔️ Yes | `NULL` | Indexed (`ix_audit_events_correlation_id`): import `job_id` or request ID |
| `created_at` | `TIMESTAMPTZ` | ❌ No | `NOW()` | Event timestamp, Indexed (`ix_audit_events_created_at`) |

---

## ⚡ Indexing Strategy

1. **`stores(store_code)`** (`UNIQUE`, B-Tree): Instant O(1) lookup during CSV parsing and store validation.
2. **`products(sku)`** (`UNIQUE`, B-Tree): Instant O(1) lookup during CSV parsing and SKU validation.
3. **`store_pricing(store_id, product_id, country_code, currency_code)`** (`UNIQUE`, B-Tree): Enforces business identity uniqueness and supports fast point queries during staging existence checks.
4. **`store_pricing(store_id)`** and **`store_pricing(product_id)`**: Supports fast foreign key joins and filtered catalog searches.
5. **`import_jobs(status, created_at DESC)`**: Optimizes import history dashboard sorting and status filtering.
6. **`import_rows(import_job_id, status)`**: Accelerates paginated preview queries filtered by row outcome (`VALID`, `INVALID`, `CONFLICT`, `APPLIED`).
7. **`audit_events(entity_key, created_at DESC)`**: Fetches recent change history for any pricing record in milliseconds.
