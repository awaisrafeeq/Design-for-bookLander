"""Persist source enablement preferences."""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision: str = "0004_source_settings"
down_revision: str | Sequence[str] | None = "0003_persistent_workflow"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "source_settings",
        sa.Column("key", sa.String(40), primary_key=True),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("updated_by", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.bulk_insert(
        sa.table("source_settings", sa.column("key", sa.String), sa.column("enabled", sa.Boolean)),
        [{"key": "calendar", "enabled": False}, {"key": "news", "enabled": False}, {"key": "team", "enabled": True}],
    )


def downgrade() -> None:
    op.drop_table("source_settings")
