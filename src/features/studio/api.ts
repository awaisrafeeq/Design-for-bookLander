import type { Activity, Connection, Event, Post, Source, SourceProvider, TeamMember, StudioState, ResultMetrics } from './types';

export type Dashboard = { posts: Post[]; spend: Spend; connections: Connection[]; activity: Activity[] };
export type Spend = StudioState['spend'];
export type Sources = { sources: Record<Source, boolean>; connections: Connection[]; events: Event[]; providers?: Record<string, SourceProvider>; newsProvider?: 'currents' | 'newsdata'; accounts?: StudioState['accounts'] };
export type Brand = StudioState['brand'];
export type Results = ResultMetrics;
export type CatalogueListItem = { id: string | null; source: 'manual' | 'imported'; isbn: string; title: string; author: string; format: string; archived: boolean };
export type CatalogueBook = CatalogueListItem & { publisher: string; description: string; subjects: string[]; language: string; pages: number | string | null };
export type Catalogue = { books: CatalogueListItem[]; search: string; nextCursor: string | null; hasMore: boolean; pageSize: number };
export type ResourceMap = { snapshot: StudioState; dashboard: Dashboard; posts: Post[]; ideas: Post[]; review: Post[]; schedule: Post[]; calendar: Post[]; media: unknown; results: Results; sources: Sources; catalogue: Catalogue; brand: Brand; spend: Spend; team: TeamMember[]; logs: Activity[] };
export type Resource = keyof ResourceMap;

const base = process.env.NEXT_PUBLIC_STUDIO_API_BASE_URL || '/api/studio';
async function request<T>(resource: Resource, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (!(init?.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  if (init?.method === 'POST') {
    const csrfResponse = await fetch('/api/auth/csrf', { cache: 'no-store' });
    const csrf = await csrfResponse.json() as { csrf_token?: string; detail?: string; error?: string };
    if (!csrfResponse.ok || !csrf.csrf_token) throw new Error(csrf.detail || csrf.error || 'Your session expired. Sign in again.');
    headers.set('X-CSRF-Token', csrf.csrf_token);
  }
  const response = await fetch(`${base}/${resource}`, { cache: 'no-store', ...init, headers });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || `Request failed (${response.status})`);
  return result as T;
}
export const studioApi = {
  get<K extends Resource>(resource: K): Promise<ResourceMap[K]> { return request<ResourceMap[K]>(resource); },
  act<T = unknown>(resource: Resource, body: Record<string, unknown>): Promise<T> { return request<T>(resource, { method: 'POST', body: JSON.stringify(body) }); },
  upload(body: FormData): Promise<{ message: string }> { return request('media', { method: 'POST', body }); },
  async catalogue(search: string, cursor = '', pageSize = 25): Promise<Catalogue> {
    const response = await fetch(`${base}/catalogue?${new URLSearchParams({ search, cursor, pageSize: String(pageSize) })}`, { cache: 'no-store' });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Could not load catalogue');
    return result as Catalogue;
  },
  async catalogueDetail(book: CatalogueListItem): Promise<CatalogueBook> {
    const query = new URLSearchParams({ detail: book.source, id: book.id || book.isbn });
    const response = await fetch(`${base}/catalogue?${query}`, { cache: 'no-store' });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Could not load book details');
    return result as CatalogueBook;
  },
  async calendar(start: string, end: string): Promise<Post[]> {
    const response = await fetch(`${base}/calendar?${new URLSearchParams({ start, end })}`, { cache: 'no-store' });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Could not load the calendar');
    return result;
  },
  async accountOptions<T>(accountId: string, detail: 'pinterest-boards' | 'tiktok-creator-info', mediaType?: 'video' | 'photo'): Promise<T> {
    const query = new URLSearchParams({ accountId, detail });
    if (mediaType) query.set('mediaType', mediaType);
    const response = await fetch(`${base}/sources?${query}`, { cache: 'no-store' });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || `Could not load ${detail}`);
    return result as T;
  },
};
