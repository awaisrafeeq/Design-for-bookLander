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
    SELECT c001, c003, c006, c012, c015, c022, c023, c024, c025, c030, c037, c046
    FROM books
    WHERE NULLIF(BTRIM(c003), '') IS NOT NULL
      AND BTRIM(c003) <> '\N'
      AND (:phrase = '' OR c003 ILIKE :pattern)
    ORDER BY CASE WHEN LOWER(BTRIM(c003)) = LOWER(:phrase) THEN 0
                  WHEN c003 ILIKE :prefix THEN 1 ELSE 2 END,
             c003
    LIMIT 3
""")


def _clean(value):
    value = str(value or "").strip()
    return "" if value == r"\N" else value


def find_catalogue_book(db: Session, topic: str) -> dict | None:
    """Find a likely named book in the catalogue without making stock claims."""
    words = [word for word in re.findall(r"[\w'-]+", topic or "")
             if len(word) > 1 and word.casefold() not in _STOP_WORDS]
    if not words:
        return None

    # Prefer the most specific phrase; progressively shorten it to handle ideas
    # such as "A lesson inspired by Rich Dad Poor Dad".
    phrases = [" ".join(words[-size:])
               for size in range(min(6, len(words)), 1, -1)]
    if len(words) == 1:
        phrases.append(words[0])
    for phrase in phrases:
        rows = db.execute(_BOOK_LOOKUP, {
            "phrase": phrase,
            "pattern": f"%{phrase}%",
            "prefix": f"{phrase}%",
        }).mappings().all()
        if not rows:
            continue
        best = rows[0]
        title = _clean(best["c003"])
        author = _clean(best["c006"])
        description = _clean(best["c046"])
        return {
            "isbn": _clean(best["c001"]),
            "title": title,
            "author": author,
            "publisher": _clean(best["c012"]),
            "format": _clean(best["c015"]),
            "description": description[:1200],
            "subjects": [value for value in (_clean(best["c023"]), _clean(best["c025"])) if value],
            "pages": _clean(best["c030"]),
            "language": _clean(best["c037"]),
            "subjectCodes": [value for value in (_clean(best["c022"]), _clean(best["c024"])) if value],
            "source": "BookLender catalogue",
        }
    return None
