"""Add an indexed full-text search for migrated catalogue titles."""
from alembic import op
import sqlalchemy as sa

revision = "0008_catalogue_title_search"
down_revision = "0007_idea_source_feeds"
branch_labels = depends_on = None

INDEX_NAME = "ix_books_title_search_gin"


def upgrade():
    bind = op.get_bind()
    if sa.inspect(bind).has_table("books", schema="public"):
        op.execute(sa.text(f"""
            CREATE INDEX IF NOT EXISTS {INDEX_NAME}
            ON public.books USING GIN (
                to_tsvector('simple'::regconfig, COALESCE(c003, ''))
            )
        """))


def downgrade():
    bind = op.get_bind()
    if sa.inspect(bind).has_table("books", schema="public"):
        op.execute(sa.text(f"DROP INDEX IF EXISTS public.{INDEX_NAME}"))
