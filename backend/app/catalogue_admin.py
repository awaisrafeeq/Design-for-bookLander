"""Staff catalogue search and individual manual book maintenance."""
import base64
import binascii
import json
import re
from uuid import UUID

from fastapi import HTTPException, Request
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import AuditEvent, ManualCatalogueBook, User


def _clean(value, maximum: int) -> str:
    value = str(value or "").strip()
    if len(value) > maximum:
        raise HTTPException(422, f"A field exceeds {maximum} characters")
    return value


def _isbn(value) -> str:
    isbn = re.sub(r"[\s-]", "", str(value or "")).upper()
    if not re.fullmatch(r"(?:[0-9]{13}|[0-9]{9}[0-9X])", isbn):
        raise HTTPException(422, "Enter a 10 or 13 character ISBN")
    return isbn


def _book_data(command: dict) -> dict:
    required = {key: _clean(command.get(key), maximum) for key, maximum in
                (("title", 500), ("author", 300), ("format", 80))}
    if not all(required.values()):
        raise HTTPException(422, "Title, author and format are required")
    subjects = command.get("subjects") or []
    if not isinstance(subjects, list) or len(subjects) > 12:
        raise HTTPException(422, "Enter up to 12 subjects")
    subjects = [_clean(value, 100) for value in subjects if str(value or "").strip()]
    pages = command.get("pages")
    if pages in ("", None):
        pages = None
    elif isinstance(pages, bool) or not str(pages).isdigit() or not 1 <= int(pages) <= 10000:
        raise HTTPException(422, "Pages must be a number from 1 to 10000")
    else:
        pages = int(pages)
    return {
        "isbn": _isbn(command.get("isbn")), **required,
        "publisher": _clean(command.get("publisher"), 300) or None,
        "description": _clean(command.get("description"), 10000) or None,
        "subjects": subjects,
        "language": _clean(command.get("language"), 80) or None,
        "pages": pages,
    }


def _manual_dto(book: ManualCatalogueBook) -> dict:
    return {"id": str(book.id), "source": "manual", "isbn": book.isbn,
            "title": book.title, "author": book.author, "format": book.format,
            "publisher": book.publisher or "", "description": book.description or "",
            "subjects": book.subjects or [], "language": book.language or "",
            "pages": book.pages, "archived": book.archived}


def _cursor_value(cursor: str, search: str, page_size: int) -> tuple[str, str] | None:
    if not cursor:
        return None
    try:
        if len(cursor) > 8000:
            raise ValueError
        data = json.loads(base64.urlsafe_b64decode(cursor + "=" * (-len(cursor) % 4)))
        if (not isinstance(data, dict) or data.get("search") != search
                or data.get("pageSize") != page_size
                or not isinstance(data.get("title"), str)
                or not isinstance(data.get("isbn"), str)
                or len(data["title"]) > 500 or len(data["isbn"]) > 80):
            raise ValueError
        return data["title"], data["isbn"]
    except (ValueError, TypeError, UnicodeDecodeError, binascii.Error):
        raise HTTPException(422, "Invalid catalogue page cursor") from None


def _encode_cursor(row: dict, search: str, page_size: int) -> str:
    value = {"title": row["sort_title"], "isbn": row["isbn"],
             "search": search, "pageSize": page_size}
    return base64.urlsafe_b64encode(json.dumps(value).encode()).decode().rstrip("=")


def read_catalogue(db: Session, search: str, cursor: str = "", page_size: int = 25) -> dict:
    search = _clean(search, 120)
    if page_size not in (25, 50):
        raise HTTPException(422, "Page size must be 25 or 50")
    after = _cursor_value(cursor, search, page_size)
    tokens = re.findall(r"\w+", search.casefold())[:8]
    ts_query = " & ".join(f"{token}:*" for token in tokens)
    isbn = re.sub(r"[\s-]", "", search).upper()
    isbn_search = bool(search and re.fullmatch(r"[0-9Xx\s-]+", search))
    params = {"isbn": isbn, "query": ts_query, "limit": page_size + 1,
              "after_title": after[0] if after else "", "after_isbn": after[1] if after else ""}
    imported_where = ""
    manual_where = ""
    if search:
        if isbn_search:
            imported_where = "AND c001 = :isbn"
            manual_where = "AND isbn = :isbn"
        elif ts_query:
            imported_where = "AND to_tsvector('simple'::regconfig, COALESCE(c003, '') || ' ' || COALESCE(c006, '')) @@ to_tsquery('simple'::regconfig, :query)"
            manual_where = "AND to_tsvector('simple'::regconfig, title || ' ' || author) @@ to_tsquery('simple'::regconfig, :query)"
        else:
            return {"books": [], "search": search, "nextCursor": None,
                    "hasMore": False, "pageSize": page_size}
    if after:
        imported_where += ' AND (left(lower(c003), 500) COLLATE "C", c001 COLLATE "C") > (:after_title, :after_isbn)'
        manual_where += ' AND (left(lower(title), 500) COLLATE "C", isbn COLLATE "C") > (:after_title, :after_isbn)'
    # Keep the list narrow; descriptions and other large fields are fetched on row open.
    listing = text(f"""
        SELECT id, source, isbn, title, author, format, archived, sort_title FROM (
          SELECT NULL::text AS id, 'imported' AS source, c001 AS isbn,
                 c003 AS title, c006 AS author, c015 AS format,
                 false AS archived, left(lower(c003), 500) COLLATE "C" AS sort_title
          FROM public.books WHERE true {imported_where}
          UNION ALL
          SELECT id::text, 'manual', isbn, title, author, format,
                 archived, left(lower(title), 500) COLLATE "C"
          FROM manual_catalogue_books WHERE true {manual_where}
        ) books
        ORDER BY sort_title, isbn COLLATE "C"
        LIMIT :limit
    """)
    rows = [dict(row) for row in db.execute(listing, params).mappings()]
    has_more = len(rows) > page_size
    page = rows[:page_size]
    next_cursor = _encode_cursor(page[-1], search, page_size) if has_more else None
    for row in page:
        row.pop("sort_title")
    return {"books": page, "search": search, "nextCursor": next_cursor,
            "hasMore": has_more, "pageSize": page_size}


def read_catalogue_detail(db: Session, source: str, identifier: str) -> dict:
    if source == "manual":
        try:
            book_id = UUID(identifier)
        except (TypeError, ValueError):
            raise HTTPException(422, "Invalid book ID") from None
        book = db.get(ManualCatalogueBook, book_id)
        if book is None:
            raise HTTPException(404, "Book not found")
        return _manual_dto(book)
    if source != "imported":
        raise HTTPException(422, "Invalid catalogue source")
    isbn = _clean(identifier, 80)
    row = db.execute(text("""
        SELECT c001, c003, c006, c012, c015, c023, c025, c030, c037, c046
        FROM public.books WHERE c001 = :isbn LIMIT 1
    """), {"isbn": isbn}).mappings().first()
    if row is None:
        raise HTTPException(404, "Book not found")
    return {"id": None, "source": "imported", "isbn": row["c001"] or "",
            "title": row["c003"] or "", "author": row["c006"] or "",
            "format": row["c015"] or "", "publisher": row["c012"] or "",
            "description": (row["c046"] or "")[:10000],
            "subjects": [value for value in (row["c023"], row["c025"]) if value and value != r"\N"],
            "language": row["c037"] or "", "pages": row["c030"] or None,
            "archived": False}


def _ensure_unique(db: Session, isbn: str, ignore_id: UUID | None = None) -> None:
    existing = db.scalar(select(ManualCatalogueBook.id).where(ManualCatalogueBook.isbn == isbn))
    if existing and existing != ignore_id:
        raise HTTPException(409, "This ISBN already exists in the manual catalogue")
    imported = db.execute(text("SELECT 1 FROM public.books WHERE c001 = :isbn LIMIT 1"), {"isbn": isbn}).first()
    if imported:
        raise HTTPException(409, "This ISBN already exists in the imported catalogue")


def mutate_catalogue(db: Session, user: User, request: Request, command: dict) -> dict:
    action = command.get("action")
    if action not in {"add", "update", "archive", "restore"}:
        raise HTTPException(422, "Unknown catalogue action")
    before = None
    if action == "add":
        data = _book_data(command)
        _ensure_unique(db, data["isbn"])
        book = ManualCatalogueBook(**data, created_by=user.id, updated_by=user.id)
        db.add(book)
    else:
        try:
            book_id = UUID(str(command.get("id")))
        except (ValueError, TypeError):
            raise HTTPException(422, "Invalid book ID") from None
        book = db.get(ManualCatalogueBook, book_id)
        if not book:
            raise HTTPException(404, "Manual book not found")
        before = _manual_dto(book)
        if action == "update":
            data = _book_data(command)
            if data["isbn"] != book.isbn:
                _ensure_unique(db, data["isbn"], book.id)
            for field, value in data.items():
                setattr(book, field, value)
            book.updated_by = user.id
        elif action == "archive":
            book.archived = True
            book.updated_by = user.id
        else:
            book.archived = False
            book.updated_by = user.id
    try:
        db.flush()
        db.add(AuditEvent(actor_user_id=user.id, action=f"catalogue.{action}",
                          resource_type="manual_catalogue_book", resource_id=str(book.id),
                          request_id=request.headers.get("x-request-id"),
                          details={"before": before, "after": _manual_dto(book)}))
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "This ISBN already exists") from None
    return {"message": "Book saved" if action in {"add", "update"} else "Book status updated",
            "book": _manual_dto(book)}
