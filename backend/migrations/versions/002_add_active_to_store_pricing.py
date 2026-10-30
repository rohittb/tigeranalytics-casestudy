"""Add active column to store_pricing

Revision ID: 002_add_active_to_store_pricing
Revises: 001_initial_schema
Create Date: 2026-10-27 23:10:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = "002_add_active_to_store_pricing"
down_revision = "001_initial_schema"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "store_pricing",
        sa.Column("active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
    )


def downgrade() -> None:
    op.drop_column("store_pricing", "active")
