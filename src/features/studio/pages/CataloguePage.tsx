'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { studioApi, type CatalogueBook } from '../api';
import { useStudio } from '../components/StudioProvider';
import { Icon } from '../components/Icon';

type BookForm = { isbn: string; title: string; author: string; format: string; publisher: string; description: string; subjects: string; language: string; pages: string };
const emptyForm: BookForm = { isbn: '', title: '', author: '', format: 'Paperback', publisher: '', description: '', subjects: '', language: 'English', pages: '' };

function formFrom(book: CatalogueBook): BookForm {
  return { isbn: book.isbn, title: book.title, author: book.author, format: book.format,
    publisher: book.publisher || '', description: book.description || '',
    subjects: book.subjects.join(', '), language: book.language || '', pages: book.pages ? String(book.pages) : '' };
}

export default function CataloguePage() {
  const { state, notify } = useStudio();
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [books, setBooks] = useState<CatalogueBook[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<CatalogueBook | null | undefined>(undefined);
  const [form, setForm] = useState<BookForm>(emptyForm);
  const canManage = Boolean(state.permissions?.['catalogue.manage']);

  useEffect(() => { const timer = setTimeout(() => setQuery(search.trim()), 300); return () => clearTimeout(timer); }, [search]);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    void studioApi.catalogue(query).then(result => { if (alive) { setBooks(result.books); setError(''); setLoading(false); } })
      .catch(cause => { if (alive) { setError((cause as Error).message); setLoading(false); } });
    return () => { alive = false; };
  }, [query]);

  const reload = async () => { const result = await studioApi.catalogue(query); setBooks(result.books); };
  const open = (book: CatalogueBook | null) => { setEditing(book); setForm(book ? formFrom(book) : emptyForm); };
  const change = (key: keyof BookForm, value: string) => setForm(previous => ({ ...previous, [key]: value }));

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      const result = await studioApi.act<{ message: string }>('catalogue', {
        action: editing ? 'update' : 'add', id: editing?.id,
        ...form, subjects: form.subjects.split(',').map(value => value.trim()).filter(Boolean),
        pages: form.pages || null,
      });
      await reload(); setEditing(undefined); notify(result.message);
    } catch (cause) { notify((cause as Error).message, true); }
    finally { setBusy(false); }
  };

  const setArchived = async (book: CatalogueBook) => {
    setBusy(true);
    try {
      const result = await studioApi.act<{ message: string }>('catalogue', { action: book.archived ? 'restore' : 'archive', id: book.id });
      await reload(); notify(result.message);
    } catch (cause) { notify((cause as Error).message, true); }
    finally { setBusy(false); }
  };

  return <>
    <section className="sec">
      <div className="sechead"><h2>Book catalogue</h2><span className="small muted">Search imported titles or manage books added here.</span>
        {canManage && <button className="btn r" onClick={() => open(null)}><Icon name="plus"/>Add book</button>}
      </div>
      <div className="catalogue-search"><label className="small" htmlFor="catalogue-search">Search title, author or ISBN</label>
        <input id="catalogue-search" value={search} onChange={event => setSearch(event.target.value)} placeholder="e.g. Rich Dad Poor Dad or 978…" autoComplete="off"/>
        <p className="small muted">A blank search shows recent manual entries. Imported books appear in search results.</p>
      </div>
      <p className="small muted">Title details help draft accurate posts. Stock, rental availability and exact cover art are not verified here.</p>
    </section>
    <section className="card pad sec">
      <div className="sechead"><h2>{query ? 'Search results' : 'Recently added books'}</h2><span className="small muted">{books.length ? `Showing ${books.length} books` : ''}</span></div>
      {error ? <div className="empty" role="alert">{error}<button className="btn ghost" onClick={() => { setLoading(true); void reload().then(() => { setError(''); setLoading(false); }).catch(cause => { setError((cause as Error).message); setLoading(false); }); }}>Retry</button></div>
        : loading ? <p role="status">Loading catalogue…</p>
        : !books.length ? <div className="empty"><Icon name="book"/><b>{query ? 'No books matched your search' : 'No manual books added yet'}</b><span>{query ? 'Try a different title, author or ISBN.' : 'Use Add book to create the first entry.'}</span></div>
        : <div className="tblwrap"><table className="tbl catalogue-table"><thead><tr><th>Book</th><th>ISBN</th><th>Format</th><th>Source</th><th>Actions</th></tr></thead>
            <tbody>{books.map((book, index) => <tr key={`${book.source}-${book.id || book.isbn}-${index}`}>
              <td><b>{book.title}</b><small className="muted catalogue-sub">{book.author}{book.publisher ? ` · ${book.publisher}` : ''}</small></td>
              <td className="num">{book.isbn || '—'}</td><td>{book.format || '—'}</td>
              <td><span className={`chip ${book.archived ? 'amber' : book.source === 'manual' ? 'green' : ''}`}>{book.archived ? 'Archived' : book.source === 'manual' ? 'Added here' : 'Imported'}</span></td>
              <td>{book.source === 'manual' && canManage ? <div className="catalogue-actions"><button className="btn ghost sm" disabled={busy} onClick={() => open(book)}>Edit</button><button className="btn ghost sm" disabled={busy} onClick={() => void setArchived(book)}>{book.archived ? 'Restore' : 'Archive'}</button></div> : <span className="small muted">Read only</span>}</td>
            </tr>)}</tbody>
          </table></div>}
    </section>
    {editing !== undefined && <div className="catalogue-overlay" onMouseDown={event => { if (event.target === event.currentTarget && !busy) setEditing(undefined); }}>
      <div className="catalogue-dialog card" role="dialog" aria-modal="true" aria-label={editing ? 'Edit book' : 'Add book'}>
        <div className="catalogue-dialog-head"><div><h2>{editing ? 'Edit book' : 'Add a book'}</h2><p className="small muted">Required fields are marked *. These details may be used when creating posts.</p></div><button className="iconbtn" aria-label="Close" disabled={busy} onClick={() => setEditing(undefined)}><Icon name="x"/></button></div>
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
          <div className="catalogue-footer wide"><button type="button" className="btn ghost" disabled={busy} onClick={() => setEditing(undefined)}>Cancel</button><button className="btn" disabled={busy} type="submit">{busy ? 'Saving…' : 'Save book'}</button></div>
        </form>
      </div>
    </div>}
  </>;
}
