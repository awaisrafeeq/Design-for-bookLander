"""Add separately managed catalogue entries and search indexes."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "0009_manual_catalogue_books"
down_revision = "0008_catalogue_title_search"
branch_labels = depends_on = None


def upgrade():
    op.create_table(
        "manual_catalogue_books",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("isbn", sa.String(13), nullable=False),
        sa.Column("title", sa.String(500), nullable=False),
        sa.Column("author", sa.String(300), nullable=False),
        sa.Column("format", sa.String(80), nullable=False),
        sa.Column("publisher", sa.String(300)),
        sa.Column("description", sa.Text()),
        sa.Column("subjects", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("language", sa.String(80)),
        sa.Column("pages", sa.Integer()),
        sa.Column("archived", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_by", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("updated_by", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("isbn", name="uq_manual_catalogue_books_isbn"),
    )
    op.execute("CREATE INDEX ix_manual_catalogue_books_search_gin ON manual_catalogue_books USING GIN (to_tsvector('simple'::regconfig, title || ' ' || author))")
    bind = op.get_bind()
    if sa.inspect(bind).has_table("books", schema="public"):
        op.execute("CREATE INDEX IF NOT EXISTS ix_books_isbn ON public.books (c001)")
        op.execute("CREATE INDEX IF NOT EXISTS ix_books_catalogue_search_gin ON public.books USING GIN (to_tsvector('simple'::regconfig, COALESCE(c003, '') || ' ' || COALESCE(c006, '')))")
    op.execute("""
        UPDATE users
        SET module_access = (module_access::jsonb || '["Catalogue"]'::jsonb)::json
        WHERE role IN ('admin', 'campaigns_manager', 'editor')
          AND (module_access::jsonb ? 'Sources')
          AND NOT (module_access::jsonb ? 'Catalogue')
    """)


def downgrade():
    op.execute("""
        UPDATE users
        SET module_access = (module_access::jsonb - 'Catalogue')::json
        WHERE module_access::jsonb ? 'Catalogue'
    """)
    bind = op.get_bind()
    if sa.inspect(bind).has_table("books", schema="public"):
        op.execute("DROP INDEX IF EXISTS public.ix_books_catalogue_search_gin")
        op.execute("DROP INDEX IF EXISTS public.ix_books_isbn")
    op.drop_table("manual_catalogue_books")
