"""Persist external idea source results and sync history."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "0007_idea_source_feeds"
down_revision = "0006_integrations"
branch_labels = depends_on = None


def upgrade():
    op.add_column("source_settings", sa.Column("provider", sa.String(40)))
    op.create_table(
        "source_items",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("category", sa.String(24), nullable=False),
        sa.Column("provider", sa.String(40), nullable=False),
        sa.Column("external_id", sa.String(240), nullable=False),
        sa.Column("title", sa.String(500), nullable=False),
        sa.Column("summary", sa.Text()),
        sa.Column("url", sa.Text()),
        sa.Column("event_date", sa.Date()),
        sa.Column("published_at", sa.DateTime(timezone=True)),
        sa.Column("country", sa.String(8)),
        sa.Column("metadata_json", sa.JSON(), nullable=False, server_default="{}"),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("provider", "external_id", name="uq_source_items_provider_external_id"),
    )
    op.create_index("ix_source_items_category", "source_items", ["category"])
    op.create_index("ix_source_items_provider", "source_items", ["provider"])
    op.create_table(
        "source_sync_runs",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("provider", sa.String(40), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("fetched_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("new_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("error", sa.Text()),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("finished_at", sa.DateTime(timezone=True)),
    )
    op.create_index("ix_source_sync_runs_provider", "source_sync_runs", ["provider"])
    op.create_index("ix_source_sync_runs_status", "source_sync_runs", ["status"])


def downgrade():
    op.drop_table("source_sync_runs")
    op.drop_table("source_items")
    op.drop_column("source_settings", "provider")
