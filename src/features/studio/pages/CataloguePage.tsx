'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { studioApi, type Catalogue, type CatalogueBook, type CatalogueListItem } from '../api';
import { useStudio } from '../components/StudioProvider';
import { Icon } from '../components/Icon';

type BookForm = { isbn: string; title: string; author: string; format: string; publisher: string; description: string; subjects: string; language: string; pages: string };
const emptyForm: BookForm = { isbn: '', title: '', author: '', format: 'Paperback', publisher: '', description: '', subjects: '', language: 'English', pages: '' };
function formFrom(book: CatalogueBook): BookForm {
  return { isbn: book.isbn, title: book.title, author: book.author, format: book.format,
    publisher: book.publisher || '', description: book.description || '', subjects: book.subjects.join(', '),
    language: book.language || '', pages: book.pages ? String(book.pages) : '' };
}

export default function CataloguePage() {
  const { state, notify } = useStudio();
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState<Catalogue | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<CatalogueBook | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [editing, setEditing] = useState<CatalogueBook | null | undefined>(undefined);
  const [form, setForm] = useState<BookForm>(emptyForm);
  const canManage = Boolean(state.permissions?.['catalogue.manage']);

  useEffect(() => {
    const timer = setTimeout(() => {
      const nextQuery = search.trim();
      if (nextQuery !== query) { setQuery(nextQuery); setCursor(''); setHistory([]); }
    }, 300);
    return () => clearTimeout(timer);
  }, [search, query]);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    void studioApi.catalogue(query, cursor, pageSize)
      .then(result => { if (alive) { setPage(result); setError(''); setLoading(false); } })
      .catch(cause => { if (alive) { setError((cause as Error).message); setLoading(false); } });
    return () => { alive = false; };
  }, [query, cursor, pageSize]);
  useEffect(() => {
    if (!selected && editing === undefined) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) { setSelected(null); setEditing(undefined); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selected, editing, busy]);

  const reload = async () => { setPage(await studioApi.catalogue(query, cursor, pageSize)); setError(''); };
  const showDetails = async (book: CatalogueListItem) => {
    setSelected(null); setDetailLoading(true);
    try { setSelected(await studioApi.catalogueDetail(book)); }
    catch (cause) { notify((cause as Error).message, true); }
    finally { setDetailLoading(false); }
  };
  const open = (book: CatalogueBook | null) => { setEditing(book); setForm(book ? formFrom(book) : emptyForm); };
  const change = (key: keyof BookForm, value: string) => setForm(previous => ({ ...previous, [key]: value }));
  const save = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true);
    try {
      const result = await studioApi.act<{ message: string; book: CatalogueBook }>('catalogue', {
        action: editing ? 'update' : 'add', id: editing?.id, ...form,
        subjects: form.subjects.split(',').map(value => value.trim()).filter(Boolean), pages: form.pages || null,
      });
      await reload(); setEditing(undefined); setSelected(result.book); notify(result.message);
    } catch (cause) { notify((cause as Error).message, true); }
    finally { setBusy(false); }
  };
  const setArchived = async (book: CatalogueBook) => {
    setBusy(true);
    try {
      const result = await studioApi.act<{ message: string; book: CatalogueBook }>('catalogue',
        { action: book.archived ? 'restore' : 'archive', id: book.id });
      await reload(); setSelected(result.book); notify(result.message);
    } catch (cause) { notify((cause as Error).message, true); }
    finally { setBusy(false); }
  };
  return <>
    <section className="sec">
      <div className="sechead"><h2>Book catalogue</h2><span className="small muted">Browse imported and manually added books.</span>
        {canManage && <button className="btn r" onClick={() => open(null)}><Icon name="plus"/>Add book</button>}
      </div>
      <div className="catalogue-search"><label className="small" htmlFor="catalogue-search">Search title, author or ISBN</label>
        <input id="catalogue-search" value={search} onChange={event => setSearch(event.target.value)}
          placeholder="e.g. Rich Dad Poor Dad, Robert Kiyosaki or a full ISBN" autoComplete="off"/>
        <p className="small muted">Leave blank to browse all books. Enter a full ISBN for an exact match.</p>
      </div>
      <p className="small muted">Title details help draft accurate posts. Stock, rental availability and exact cover art are not verified here.</p>
    </section>
    <section className="card pad sec">
      <div className="sechead"><h2>{query ? 'Search results' : 'All books'}</h2>
        <span className="small muted">{page && !loading ? `Page ${history.length + 1} · ${page.books.length} books` : ''}</span>
        <label className="small catalogue-page-size">Rows per page <select value={pageSize} onChange={event => {
          setPageSize(Number(event.target.value)); setCursor(''); setHistory([]);
        }}><option value={25}>25</option><option value={50}>50</option></select></label>
      </div>
      {error ? <div className="empty" role="alert">{error}<button className="btn ghost" onClick={() => {
        setLoading(true); void reload().catch(cause => setError((cause as Error).message)).finally(() => setLoading(false));
      }}>Retry</button></div>
        : loading ? <p role="status">Loading catalogue…</p>
        : !page?.books.length ? <div className="empty"><Icon name="book"/><b>{query ? 'No books matched your search' : 'No books found'}</b><span>{query ? 'Try another title, author or full ISBN.' : 'Use Add book to create an entry.'}</span></div>
        : <div className="tblwrap"><table className="tbl catalogue-table"><thead><tr><th>Title</th><th>Author</th><th>ISBN</th><th>Format</th><th>Source</th></tr></thead>
            <tbody>{page.books.map(book => <tr key={`${book.source}-${book.id || book.isbn}`} className="catalogue-row"
              tabIndex={0} onClick={() => void showDetails(book)} onKeyDown={event => {
                if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); void showDetails(book); }
              }} aria-label={`View details for ${book.title}`}>
              <td><b>{book.title}</b></td><td>{book.author || '—'}</td><td className="num">{book.isbn}</td>
              <td>{book.format || '—'}</td><td><span className={`chip ${book.archived ? 'amber' : book.source === 'manual' ? 'green' : ''}`}>
                {book.archived ? 'Archived' : book.source === 'manual' ? 'Added here' : 'Imported'}</span></td>
            </tr>)}</tbody></table></div>}
      <div className="catalogue-pagination"><span className="small muted">Browse by title. Open a row for its full details.</span>
        <div className="catalogue-actions"><button className="btn ghost sm" disabled={loading || !history.length}
          onClick={() => { setCursor(history[history.length - 1]); setHistory(items => items.slice(0, -1)); }}>Previous</button>
          <button className="btn ghost sm" disabled={loading || !page?.nextCursor} onClick={() => {
            if (page?.nextCursor) { setHistory(items => [...items, cursor]); setCursor(page.nextCursor); }
          }}>Next</button></div></div>
    </section>
    {detailLoading && <div className="catalogue-overlay" role="status">Loading book details…</div>}
    {selected && editing === undefined && <div className="catalogue-overlay catalogue-detail-overlay" onMouseDown={event => {
      if (event.target === event.currentTarget) setSelected(null);
    }}><aside className="catalogue-sheet" role="dialog" aria-modal="true" aria-label="Book details">
      <div className="catalogue-dialog-head"><div><span className="chip">{selected.source === 'manual' ? 'Added here' : 'Imported catalogue'}</span><h2>{selected.title}</h2></div>
        <button className="iconbtn" aria-label="Close" onClick={() => setSelected(null)}><Icon name="x"/></button></div>
      <dl className="catalogue-details"><dt>Author</dt><dd>{selected.author || '—'}</dd><dt>ISBN</dt><dd>{selected.isbn}</dd>
        <dt>Format</dt><dd>{selected.format || '—'}</dd><dt>Publisher</dt><dd>{selected.publisher || '—'}</dd>
        <dt>Language</dt><dd>{selected.language || '—'}</dd><dt>Pages</dt><dd>{selected.pages || '—'}</dd>
        <dt>Subjects</dt><dd>{selected.subjects.length ? selected.subjects.join(', ') : '—'}</dd>
        <dt>Status</dt><dd>{selected.archived ? 'Archived' : 'Active'}</dd></dl>
      <h3>Description</h3><p className="catalogue-description">{selected.description || 'No description available.'}</p>
      {selected.source === 'manual' && canManage && <div className="catalogue-sheet-actions">
        <button className="btn ghost" disabled={busy} onClick={() => open(selected)}>Edit</button>
        <button className="btn ghost" disabled={busy} onClick={() => void setArchived(selected)}>{selected.archived ? 'Restore' : 'Archive'}</button>
      </div>}
    </aside></div>}
    {editing !== undefined && <div className="catalogue-overlay" onMouseDown={event => {
      if (event.target === event.currentTarget && !busy) setEditing(undefined);
    }}><div className="catalogue-dialog card" role="dialog" aria-modal="true" aria-label={editing ? 'Edit book' : 'Add book'}>
      <div className="catalogue-dialog-head"><div><h2>{editing ? 'Edit book' : 'Add a book'}</h2>
        <p className="small muted">Required fields are marked *. These details may be used when creating posts.</p></div>
        <button className="iconbtn" aria-label="Close" disabled={busy} onClick={() => setEditing(undefined)}><Icon name="x"/></button></div>
      <form onSubmit={event => void save(event)} className="catalogue-form">
        <label>ISBN *<input required maxLength={17} value={form.isbn} onChange={event => change('isbn', event.target.value)} placeholder="10 or 13 characters"/></label>
        <label>Title *<input required maxLength={500} value={form.title} onChange={event => change('title', event.target.value)}/></label>
        <label>Author *<input required maxLength={300} value={form.author} onChange={event => change('author', event.target.value)}/></label>
        <label>Format *<select required value={form.format} onChange={event => change('format', event.target.value)}><option>Paperback</option><option>Hardcover</option><option>Audiobook CD</option><option>Other</option></select></label>
        <label>Publisher<input maxLength={300} value={form.publisher} onChange={event => change('publisher', event.target.value)}/></label>
        <label>Language<input maxLength={80} value={form.language} onChange={event => change('language', event.target.value)}/></label>
        <label>Pages<input type="number" min="1" max="10000" value={form.pages} onChange={event => change('pages', event.target.value)}/></label>
        <label className="wide">Subjects <span className="muted">(separate with commas)</span><input value={form.subjects} onChange={event => change('subjects', event.target.value)} placeholder="Fiction, Personal Finance"/></label>
        <label className="wide">Description<textarea rows={4} maxLength={10000} value={form.description} onChange={event => change('description', event.target.value)}/></label>
        <div className="catalogue-footer wide"><button type="button" className="btn ghost" disabled={busy} onClick={() => setEditing(undefined)}>Cancel</button>
          <button className="btn" disabled={busy} type="submit">{busy ? 'Saving…' : 'Save book'}</button></div>
      </form>
    </div></div>}
  </>;
}
