"""Initial schema for retail pricing system

Revision ID: 001_initial_schema
Revises: 
Create Date: 2026-10-27 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = "001_initial_schema"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. stores
    op.create_table(
        "stores",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("store_code", sa.String(length=50), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("country_code", sa.String(length=10), nullable=False),
        sa.Column("active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("store_code", name="uq_stores_store_code"),
    )
    op.create_index("ix_stores_store_code", "stores", ["store_code"], unique=True)
    op.create_index("ix_stores_country_code", "stores", ["country_code"], unique=False)

    # 2. products
    op.create_table(
        "products",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("sku", sa.String(length=100), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("category", sa.String(length=100), nullable=True),
        sa.Column("active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("sku", name="uq_products_sku"),
    )
    op.create_index("ix_products_sku", "products", ["sku"], unique=True)

    # 3. store_pricing
    op.create_table(
        "store_pricing",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("store_id", sa.Integer(), nullable=False),
        sa.Column("product_id", sa.Integer(), nullable=False),
        sa.Column("country_code", sa.String(length=10), nullable=False),
        sa.Column("currency_code", sa.String(length=10), nullable=False),
        sa.Column("price", sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column("version", sa.Integer(), server_default=sa.text("1"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("updated_by", sa.String(length=100), server_default="dev-analyst-01", nullable=False),
        sa.ForeignKeyConstraint(["product_id"], ["products.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["store_id"], ["stores.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.CheckConstraint("price >= 0", name="ck_store_pricing_price_non_negative"),
        sa.UniqueConstraint("store_id", "product_id", "country_code", "currency_code", name="uq_store_product_country_currency"),
    )
    op.create_index("ix_store_pricing_store_id", "store_pricing", ["store_id"])
    op.create_index("ix_store_pricing_product_id", "store_pricing", ["product_id"])
    op.create_index("ix_store_pricing_country_code", "store_pricing", ["country_code"])

    # 4. import_jobs
    op.create_table(
        "import_jobs",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("original_filename", sa.String(length=255), nullable=False),
        sa.Column("storage_key", sa.String(length=500), nullable=False),
        sa.Column("status", sa.String(length=50), server_default="UPLOADED", nullable=False),
        sa.Column("created_by", sa.String(length=100), server_default="dev-analyst-01", nullable=False),
        sa.Column("total_rows", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("valid_rows", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("invalid_rows", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("applied_rows", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("conflicted_rows", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("failure_summary", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("confirmed_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_import_jobs_status", "import_jobs", ["status"])
    op.create_index("ix_import_jobs_created_at", "import_jobs", ["created_at"])

    # 5. import_rows
    op.create_table(
        "import_rows",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("import_job_id", sa.String(length=36), nullable=False),
        sa.Column("row_number", sa.Integer(), nullable=False),
        sa.Column("store_code", sa.String(length=50), nullable=True),
        sa.Column("product_sku", sa.String(length=100), nullable=True),
        sa.Column("country_code", sa.String(length=10), nullable=True),
        sa.Column("currency_code", sa.String(length=10), nullable=True),
        sa.Column("price", sa.Numeric(precision=12, scale=2), nullable=True),
        sa.Column("raw_data", sa.JSON(), nullable=False),
        sa.Column("status", sa.String(length=50), server_default="PENDING", nullable=False),
        sa.Column("errors", sa.JSON(), nullable=True),
        sa.Column("expected_version", sa.Integer(), nullable=True),
        sa.Column("applied_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["import_job_id"], ["import_jobs.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("import_job_id", "row_number", name="uq_import_job_row_number"),
    )
    op.create_index("ix_import_rows_import_job_id", "import_rows", ["import_job_id"])
    op.create_index("ix_import_rows_status", "import_rows", ["status"])

    # 6. audit_events
    op.create_table(
        "audit_events",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("actor_id", sa.String(length=100), nullable=False),
        sa.Column("action", sa.String(length=50), nullable=False),
        sa.Column("entity_type", sa.String(length=50), server_default="store_pricing", nullable=False),
        sa.Column("entity_key", sa.String(length=255), nullable=False),
        sa.Column("before_value", sa.JSON(), nullable=True),
        sa.Column("after_value", sa.JSON(), nullable=True),
        sa.Column("source", sa.String(length=50), nullable=False),
        sa.Column("correlation_id", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_audit_events_entity_key", "audit_events", ["entity_key"])
    op.create_index("ix_audit_events_correlation_id", "audit_events", ["correlation_id"])
    op.create_index("ix_audit_events_created_at", "audit_events", ["created_at"])


def downgrade() -> None:
    op.drop_table("audit_events")
    op.drop_table("import_rows")
    op.drop_table("import_jobs")
    op.drop_table("store_pricing")
    op.drop_table("products")
    op.drop_table("stores")
