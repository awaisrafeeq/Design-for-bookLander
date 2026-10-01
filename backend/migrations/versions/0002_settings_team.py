"""Persist spend choices, team access, and provider cost entries."""

from collections.abc import Sequence
from uuid import uuid4

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision: str = "0002_settings_team"
down_revision: str | Sequence[str] | None = "0001_foundation"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("users", sa.Column("invited", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("users", sa.Column("is_approver", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("users", sa.Column("module_access", sa.JSON(), nullable=False, server_default=sa.text("'[]'")))
    op.add_column("spend_settings", sa.Column("efficient_model", sa.Boolean(), nullable=False, server_default=sa.true()))
    op.create_table(
        "spend_entries",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("provider", sa.String(80), nullable=False),
        sa.Column("category", sa.String(20), nullable=False),
        sa.Column("amount_usd", sa.Numeric(10, 4), nullable=False),
        sa.Column("model", sa.String(160)),
        sa.Column("provider_job_id", sa.String(160)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_spend_entries_created_at", "spend_entries", ["created_at"])

    connection = op.get_bind()
    active_policies = connection.execute(sa.text("SELECT id FROM brand_policy_versions WHERE active = true")).scalars().all()
    required_rules = [
        "Do not claim that a book is in stock, available, newly arrived, or deliverable unless verified by an approved source.",
        "Never invent a review, testimonial, discount, delivery promise, or false urgency.",
    ]
    for policy_id in active_policies:
        for rule in required_rules:
            exists = connection.execute(
                sa.text("SELECT 1 FROM brand_rules WHERE policy_version_id = :policy_id AND rule = :rule"),
                {"policy_id": policy_id, "rule": rule},
            ).first()
            if exists is None:
                connection.execute(
                    sa.text("INSERT INTO brand_rules (id, policy_version_id, rule) VALUES (:id, :policy_id, :rule)"),
                    {"id": uuid4(), "policy_id": policy_id, "rule": rule},
                )


def downgrade() -> None:
    op.drop_index("ix_spend_entries_created_at", table_name="spend_entries")
    op.drop_table("spend_entries")
    op.drop_column("spend_settings", "efficient_model")
    op.drop_column("users", "module_access")
    op.drop_column("users", "is_approver")
    op.drop_column("users", "invited")
