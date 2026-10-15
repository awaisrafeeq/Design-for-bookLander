"""Read-only lookup for the migrated BookLender title catalogue.

The imported table keeps its source columns as c001..c075. The fields used here
are the ones identified from the catalogue row supplied during integration.
Inventory flags are intentionally omitted until their source meanings are known.
"""
import re

from sqlalchemy import text
from sqlalchemy.orm import Session


_STOP_WORDS = {
    "a", "an", "the", "and", "or", "of", "for", "to", "in", "on", "by",
    "with", "about", "inspired", "book", "books", "story", "reading",
    "lesson", "novel", "novels", "topic", "post",
}

_BOOK_LOOKUP = text(r"""
    SELECT c001, c003, c006, c012, c015, c022, c023, c024, c025, c030, c037, c046,
           ts_rank_cd(
               to_tsvector('simple'::regconfig, COALESCE(c003, '')),
               to_tsquery('simple'::regconfig, :query)
           ) AS rank
    FROM books
    WHERE NULLIF(BTRIM(c003), '') IS NOT NULL
      AND BTRIM(c003) <> '\N'
      AND to_tsvector('simple'::regconfig, COALESCE(c003, ''))
          @@ to_tsquery('simple'::regconfig, :query)
    ORDER BY (LOWER(BTRIM(c003)) = :normalized) DESC,
             (POSITION(:phrase IN LOWER(c003)) > 0) DESC,
             rank DESC,
             c003
    LIMIT 3
""")


def _clean(value):
    value = str(value or "").strip()
    return "" if value == r"\N" else value


def find_catalogue_book(db: Session, topic: str) -> dict | None:
    """Find a likely named book in the catalogue without making stock claims."""
    words = list(dict.fromkeys(
        word.casefold() for word in re.findall(r"[\w]+", topic or "")
        if len(word) > 1 and word.casefold() not in _STOP_WORDS
    ))[-8:]
    if not words:
        return None

    # One indexed GIN full-text query replaces repeated wildcard scans.
    phrase = " ".join(words)
    query = " | ".join(words)
    best = db.execute(_BOOK_LOOKUP, {
        "query": query,
        "phrase": phrase,
        "normalized": phrase,
    }).mappings().first()
    if not best:
        return None
    return {
        "isbn": _clean(best["c001"]),
        "title": _clean(best["c003"]),
        "author": _clean(best["c006"]),
        "publisher": _clean(best["c012"]),
        "format": _clean(best["c015"]),
        "description": _clean(best["c046"])[:600],
        "subjects": [value for value in (_clean(best["c023"]), _clean(best["c025"])) if value],
        "pages": _clean(best["c030"]),
        "language": _clean(best["c037"]),
        "subjectCodes": [value for value in (_clean(best["c022"]), _clean(best["c024"])) if value],
        "source": "BookLender catalogue",
    }
