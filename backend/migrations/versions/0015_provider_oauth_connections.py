"""Encrypted provider OAuth credentials for read-only account metrics."""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0015_provider_oauth_connections"
down_revision = "0014_campaign_drafts"
branch_labels = depends_on = None


def upgrade():
    op.create_table(
        "provider_oauth_connections",
        sa.Column("provider", sa.String(40), primary_key=True),
        sa.Column("encrypted_credentials", sa.Text(), nullable=False),
        sa.Column(
            "connected_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
        ),
        sa.Column(
            "connected_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
    )


def downgrade():
    op.drop_table("provider_oauth_connections")
