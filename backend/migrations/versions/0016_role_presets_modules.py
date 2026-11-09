"""Editable role presets and separate inbox and library access."""

import sqlalchemy as sa
from alembic import op

revision = "0016_role_presets_modules"
down_revision = "0015_provider_oauth_connections"
branch_labels = depends_on = None


def upgrade():
    op.create_table(
        "role_presets",
        sa.Column("role", sa.String(40), primary_key=True),
        sa.Column("modules", sa.JSON(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.execute("""UPDATE users SET module_access = (
        (module_access::jsonb - 'Inbox') || '["Messages", "Comments"]'::jsonb
    )::json WHERE module_access::jsonb ? 'Inbox'""")
    op.execute("""UPDATE users SET module_access = (
        module_access::jsonb || '["Media library"]'::jsonb
    )::json WHERE (module_access::jsonb ? 'Board') AND NOT (module_access::jsonb ? 'Media library')""")


def downgrade():
    op.execute("""UPDATE users SET module_access = (
        (module_access::jsonb - 'Messages' - 'Comments' - 'Media library') || '["Inbox"]'::jsonb
    )::json WHERE (module_access::jsonb ? 'Messages') OR (module_access::jsonb ? 'Comments')""")
    op.drop_table("role_presets")
