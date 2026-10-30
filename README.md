# Retail Pricing Management System (POC)

An enterprise proof-of-concept web application for managing retail store pricing feeds, staged validation, optimistic concurrency price editing, and batch ingestion for a multi-country retail chain (~3,000 stores).

Built strictly according to the **Retail Pricing POC Development Specification** and Tiger Analytics Case Study requirements.

---

## 🌟 Highlights & Key Features

- **Decoupled Asynchronous Feed Pipeline**: Uploads CSV feeds (up to 10 MB, 50,000 data rows, 50 columns) safely into shared storage and queues processing via **Celery + Redis**, keeping API response times snappy and non-blocking.
- **Staged Ingestion & Partial Apply**: Two-phase import workflow:
  1. *Validation & Preview*: Parses structure, resolves stores/SKUs, detects negative prices, enforces decimal precision (NUMERIC(12,2), no silent rounding), detects duplicate keys within the file, and captures current record versions.
  2. *Explicit Confirmation & Selective Row Execution*: Users review paginated row errors and totals. Users can choose to execute all error-free rows or select specific valid rows via checkboxes while isolating invalid rows. Unselected rows are safely tracked as `SKIPPED`. Eligible rows are applied in chunked batches (up to 1,000 rows/batch).
- **Optimistic Concurrency Control (OCC)**:
  - Both manual single-record edits and CSV batch applies enforce atomic version checks:
    ```sql
    UPDATE store_pricing
    SET price = :new_price,
        version = version + 1,
        updated_at = NOW(),
        updated_by = :actor_id
    WHERE id = :pricing_id AND version = :expected_version
    RETURNING version;
    ```
  - Stale edits return **HTTP 409 Conflict** with details of the latest price and version. The UI prompts the user to review before retrying.
  - CSV batch apply re-checks expected versions atomically at apply time; concurrent modifications flag a row conflict and preserve newer prices.
- **Idempotency Guard**: Reprocessing or task redelivery never duplicates pricing records or double-applies updates.
- **Full Audit Trail**: Durable `audit_events` table logs all price changes (manual edits, import inserts, and import updates) with actor, before/after snapshots, action, and correlation IDs.
- **Role-Based Persona Switcher & Store Administration**:
  - Topbar user dropdown enables switching between **Pricing Analyst** (`dev-analyst-01`) and **System Administrator** (`admin-ops-01`).
  - **Store Administration** option is strictly visible and accessible **only to System Administrators**.
  - System Administrators can register new store locations, modify store configurations, and activate or deactivate stores.
  - **Cascading Deactivation Rule**: Deactivating a store automatically deactivates all of that store's product pricing records in the same atomic transaction and logs an audit event (`STORE_DEACTIVATE`). Inactive stores are rejected in subsequent CSV feed validations.
- **Modern Responsive UI**: Built with React 18, TypeScript, and Vite using a polished Dark Slate aesthetic with vibrant accents, real-time status polling, role badges, and 1-click test fixture triggers.

---

## 🏗️ Technology Stack

| Layer | Technology | Role & Purpose |
| :--- | :--- | :--- |
| **Frontend** | React 18, TypeScript, Vite | Single-page application with responsive CSS design |
| **Backend API** | Python 3.11, FastAPI, Pydantic v2 | High-performance REST endpoints with schema validation |
| **Database** | PostgreSQL 16, SQLAlchemy 2.0 | Durable source of truth with composite uniqueness & CHECK constraints |
| **Task Queue** | Celery 5.3, Redis 7 | Local asynchronous background worker for validation and batch apply |
| **Storage** | Modular Storage Backend (`LocalStorageBackend`) | Shared volume storage abstraction (replaceable with S3) |
| **Migrations** | Alembic | Version-controlled database schema migrations |
| **Orchestration**| Docker Compose | Single-command multi-service local environment with health checks |
| **Testing** | Pytest, HTTPX | Unit, integration, concurrency, and boundary limit tests |

---

## 🗄️ Database Tables, Columns & Relationships

> Full schema specifications and data dictionary are documented in [DATABASE_SCHEMA.md](file:///Users/rohitsharma/Documents/developer/tigeranalytics/DATABASE_SCHEMA.md).

```mermaid
erDiagram
    STORES ||--o{ STORE_PRICING : "has pricing (1:N)"
    PRODUCTS ||--o{ STORE_PRICING : "priced at (1:N)"
    IMPORT_JOBS ||--o{ IMPORT_ROWS : "stages rows (1:N)"
    IMPORT_JOBS ..o{ AUDIT_EVENTS : "correlates via correlation_id"
    STORE_PRICING ..o{ AUDIT_EVENTS : "audited via entity_key"
```

### Table Summary & Foreign Key Relationships

| Table Name | Primary Key | Key Columns & Constraints | Foreign Keys & Relationships |
| :--- | :--- | :--- | :--- |
| **`stores`** | `id (INT)` | `store_code (VARCHAR(50), UNIQUE)`<br>`name (VARCHAR(255))`<br>`country_code (VARCHAR(10))` | `1:N` with `store_pricing` (`ON DELETE CASCADE`) |
| **`products`** | `id (INT)` | `sku (VARCHAR(100), UNIQUE)`<br>`name (VARCHAR(255))`<br>`category (VARCHAR(100))` | `1:N` with `store_pricing` (`ON DELETE CASCADE`) |
| **`store_pricing`** | `id (INT)` | `price (NUMERIC(12,2), CHECK >= 0)`<br>`version (INT, DEFAULT 1)`<br>`UNIQUE(store_id, product_id, country_code, currency_code)` | `FK -> stores(id)` (`ON DELETE CASCADE`)<br>`FK -> products(id)` (`ON DELETE CASCADE`) |
| **`import_jobs`** | `id (UUID)` | `status (VARCHAR(50))`<br>`total_rows`, `valid_rows`, `invalid_rows`<br>`applied_rows`, `conflicted_rows` | `1:N` with `import_rows` (`ON DELETE CASCADE`) |
| **`import_rows`** | `id (INT)` | `row_number (INT)`<br>`raw_data (JSON)`, `errors (JSON)`<br>`expected_version (INT, NULLABLE)`<br>`UNIQUE(import_job_id, row_number)` | `FK -> import_jobs(id)` (`ON DELETE CASCADE`) |
| **`audit_events`** | `id (INT)` | `action (CREATE, UPDATE, IMPORT_*)`<br>`entity_key (VARCHAR(255))` (e.g. `store:STR-001\|sku:101\|US\|USD`)<br>`before_value (JSON)`, `after_value (JSON)` | Correlates to `import_jobs(id)` via `correlation_id` |

---

## 🚀 Quick Start (Local Docker Compose)

### 1. Clone & Setup Environment
```bash
cp .env.example .env
```

### 2. Start Multi-Container Stack
```bash
docker compose up -d --build
```
This boots 5 services:
- `db`: PostgreSQL 16 (Health-checked)
- `redis`: Redis 7 (Health-checked)
- `api`: FastAPI REST API on port `8080` (or `8000`)
- `worker`: Celery Background Worker
- `frontend`: Vite React App on port `3000`

### 3. Run Database Migrations
```bash
docker compose exec api alembic upgrade head
```

### 4. Seed Synthetic Multi-Country Data
```bash
docker compose exec api python -m scripts.seed
```
Seeds 11 stores across **US, UK, Canada, and Germany**, 14 products across categories (Electronics, Grocery, Home, Apparel), and initial baseline prices with audit records.

### 5. Access the Web Application
- **Frontend UI**: [http://localhost:3000](http://localhost:3000)
- **Interactive API Swagger Docs**: [http://localhost:8080/docs](http://localhost:8080/docs)
- **API Liveness Probe**: [http://localhost:8080/api/v1/health/live](http://localhost:8080/api/v1/health/live)
- **API Readiness Probe**: [http://localhost:8080/api/v1/health/ready](http://localhost:8080/api/v1/health/ready)

---

## 🧪 Automated Tests

Run the full pytest suite inside the API container:
```bash
docker compose exec api pytest -v
```

### Test Coverage Highlights:
- **`test_health.py`**: Liveness (`/live`) and readiness (`/ready`) endpoint checks.
- **`test_pricing_crud.py`**: Search, filters, pagination, single-record retrieval, and audit trail logging.
- **`test_concurrency.py`**: Atomic optimistic concurrency checks, stale version HTTP 409 rejection, negative price rejection, and excess fractional precision rejection.
- **`test_csv_validation.py`**: Missing headers, unknown store/SKU codes, negative prices, excess decimal precision (3+ decimals), and in-file duplicate business keys.
- **`test_import_workflow.py`**:
  - Full happy path: Upload → Validation → Preview → Confirmation → Batch Apply.
  - Partial apply: Valid rows apply while invalid rows remain unapplied.
  - Stale version conflict during apply: Price modified after staging preview is flagged as `CONFLICT` and preserves newer price.
  - Reprocessing idempotency: Task redelivery does not re-apply or double-increment versions.
- **`test_limits.py`**:
  - 10 MB file size boundary (>10 MB rejected with HTTP 413).
  - 50 column boundary (50 columns accepted, 51 columns rejected).
  - Row limit boundary (>50,000 data rows rejected).

---

## 📁 Sample CSV Test Files (`samples/`)

The repository includes pre-built canonical test files in `samples/` (and directly accessible via 1-click buttons in the UI):

1. **`samples/valid_pricing.csv`**:
   - 13 valid pricing records across US, GB, CA, and DE stores.
   - Tests standard happy path ingestion, preview, and apply.
2. **`samples/mixed_valid_invalid.csv`**:
   - Contains intentional errors to test row-level validation:
     - Unknown store code (`UNKNOWN-STORE-999`)
     - Unknown product SKU (`UNKNOWN-SKU-999`)
     - Excess precision (`299.999` - 3 decimal places rejected without silent rounding)
     - Negative price (`-15.50`)
     - Missing required fields
     - In-file duplicate keys (`STR-GB-002 / SKU-ELEC-1003` duplicated - both flagged)
3. **`samples/stale_version_conflict.csv`**:
   - Targets records that can be modified concurrently between preview and confirmation to demonstrate row-level conflict detection.

---

## 📐 Architecture & Non-Functional Requirements (NFR)

### Context Diagram
```
+------------------------+                        +------------------------------------+
|  Store Operations User |                        |       System Administrator         |
|     (Regional / HQ)    |                        |        (Security & Ops)            |
+-----------+------------+                        +-----------------+------------------+
            |                                                       |
            | 1. Upload CSV Feed                                    | 1. Manage Config & Roles
            | 2. Search & Edit Prices (OCC)                         | 2. Monitor Cluster Health
            | 3. Review Staged Previews                             | 3. Inspect Audit Trail
            v                                                       v
   +-------------------------------------------------------------------------+
   |              Retail Pricing Management System (Core Platform)           |
   |                                                                         |
   |   [ React SPA ] <---> [ FastAPI REST API ] <---> [ Celery Workers ]    |
   |                                 |                        |              |
   |                                 v                        v              |
   |                        [ PostgreSQL 16 ] <------> [ Redis 7 ]           |
   +-------------------------------------------------------------------------+
```

### Production AWS Mapping Matrix
| POC Component | Production Cloud Equivalent | Design Rationale & SLA |
| :--- | :--- | :--- |
| **React SPA** | Amazon S3 + CloudFront (OAC) | Edge CDN caching, global sub-50ms latency, AWS WAF |
| **FastAPI API** | Amazon ECS Fargate + ALB | Autoscaled container service behind TLS load balancer |
| **Celery + Redis** | ECS Fargate Worker + Amazon SQS | Durable message broker with automatic Dead Letter Queue (DLQ) |
| **Storage Volume**| Amazon S3 Private Bucket | Encrypted multi-part uploads with presigned URLs |
| **PostgreSQL** | Amazon RDS PostgreSQL (Multi-AZ) | High availability, automated daily snapshots, PITR |
| **Audit & Logs** | OpenTelemetry + CloudWatch + X-Ray | Distributed request tracing, metrics, and compliance logging |

---

## 📌 Documented Architectural Assumptions

As instructed by Section 20 of the specification:
1. **Pricing Identity**: The composite business key is currently `(store_id, product_id, country_code, currency_code)`. Effective dates or seasonal price lists can be incorporated into the schema in future iterations without changing the OCC pattern.
2. **Authentication / Identity**: Authentication is stubbed for the POC with a development actor (`dev-analyst-01`). The abstraction is isolated so it can be swapped with corporate SSO/OIDC (Okta/Cognito).
3. **Currency & Tax**: Currency codes are validated ISO-3 codes; no automatic foreign exchange conversion or country tax calculations are performed.
4. **Limits & Guardrails**: 10 MB file size, 50,000 data rows, 50 columns, and 1,000-row batch writes are initial POC thresholds.
5. **Partial Apply Policy**: Valid rows are eligible to apply after user confirmation; invalid rows and version conflicts are isolated, reported, and skipped.

---

## 🛠️ Operational Commands & Reset

- **View Live Logs**:
  ```bash
  docker compose logs -f api worker
  ```
- **Stop All Services**:
  ```bash
  docker compose down
  ```
- **Complete Clean Reset (Reset DB & Volumes)**:
  ```bash
  docker compose down -v
  docker compose up -d --build
  docker compose exec api alembic upgrade head
  docker compose exec api python -m scripts.seed
  ```
