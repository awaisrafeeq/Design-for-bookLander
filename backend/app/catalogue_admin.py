"""Staff catalogue search and individual manual book maintenance."""
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


_IMPORTED_SEARCH = text(r"""
    SELECT c001, c003, c006, c012, c015, c023, c025, c030, c037, c046
    FROM (
      SELECT DISTINCT ON (c001) c001, c003, c006, c012, c015, c023, c025, c030, c037, c046, score
      FROM (
        SELECT c001, c003, c006, c012, c015, c023, c025, c030, c037, c046,
               CASE WHEN c001 = :isbn THEN 1000
                    ELSE ts_rank_cd(to_tsvector('simple'::regconfig, COALESCE(c003, '') || ' ' || COALESCE(c006, '')),
                                    to_tsquery('simple'::regconfig, :query)) END AS score
        FROM public.books
        WHERE c001 = :isbn OR (
            :query <> '' AND
            to_tsvector('simple'::regconfig, COALESCE(c003, '') || ' ' || COALESCE(c006, ''))
            @@ to_tsquery('simple'::regconfig, :query)
        )
        ORDER BY score DESC, c003
        LIMIT 100
      ) ranked
      ORDER BY c001, score DESC
    ) unique_matches
    ORDER BY score DESC, c003
    LIMIT 40
""")


def read_catalogue(db: Session, search: str) -> dict:
    search = _clean(search, 120)
    tokens = re.findall(r"[\w]+", search.casefold())[:8]
    ts_query = " & ".join(f"{token}:*" for token in tokens if len(token) > 1)
    isbn = re.sub(r"[\s-]", "", search).upper()
    if search:
        manual_query = select(ManualCatalogueBook).where(
            (ManualCatalogueBook.isbn == isbn) |
            text("to_tsvector('simple'::regconfig, title || ' ' || author) @@ to_tsquery('simple'::regconfig, :query)").bindparams(query=ts_query or "unlikelycataloguetoken")
        ).order_by(ManualCatalogueBook.archived, ManualCatalogueBook.title).limit(40)
    else:
        manual_query = select(ManualCatalogueBook).order_by(ManualCatalogueBook.updated_at.desc()).limit(40)
    manual = [_manual_dto(book) for book in db.scalars(manual_query)]
    imported = []
    if search:
        for row in db.execute(_IMPORTED_SEARCH, {"isbn": isbn, "query": ts_query}).mappings():
            imported.append({
                "id": None, "source": "imported", "isbn": row["c001"] or "",
                "title": row["c003"] or "", "author": row["c006"] or "",
                "format": row["c015"] or "", "publisher": row["c012"] or "",
                "description": (row["c046"] or "")[:1000],
                "subjects": [value for value in (row["c023"], row["c025"]) if value and value != r"\N"],
                "language": row["c037"] or "", "pages": row["c030"] or None,
                "archived": False,
            })
    seen = {book["isbn"] for book in manual if not book["archived"]}
    return {"books": (manual + [book for book in imported if book["isbn"] not in seen])[:50],
            "search": search}


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
