"""Support indexed, cursor-based browsing of the full book catalogue."""
from alembic import op
import sqlalchemy as sa

revision = "0010_catalogue_browse_index"
down_revision = "0009_manual_catalogue_books"
branch_labels = depends_on = None


def upgrade():
    # Imported titles can be long; the first 500 characters keep B-tree entries
    # within PostgreSQL's per-entry size limit while covering ordinary titles.
    if sa.inspect(op.get_bind()).has_table("books", schema="public"):
        with op.get_context().autocommit_block():
            op.execute('DROP INDEX CONCURRENTLY IF EXISTS public.ix_books_catalogue_browse')
            op.execute('''CREATE INDEX CONCURRENTLY ix_books_catalogue_browse
                ON public.books ((left(lower(c003), 500) COLLATE "C"), (c001 COLLATE "C"))''')
    op.execute('''CREATE INDEX IF NOT EXISTS ix_manual_catalogue_browse
        ON manual_catalogue_books ((left(lower(title), 500) COLLATE "C"), (isbn COLLATE "C"))''')


def downgrade():
    op.execute("DROP INDEX IF EXISTS ix_manual_catalogue_browse")
    with op.get_context().autocommit_block():
        op.execute("DROP INDEX CONCURRENTLY IF EXISTS public.ix_books_catalogue_browse")
