import type { Activity, Connection, Event, Post, Source, SourceProvider, TeamMember, StudioState, ResultMetrics } from './types';

export type Dashboard = { posts: Post[]; spend: Spend; connections: Connection[]; activity: Activity[] };
export type Spend = StudioState['spend'];
export type Sources = { sources: Record<Source, boolean>; ideaLimits?: Record<Source, number>; ideaBacklog?: Record<Source, number>; connections: Connection[]; events: Event[]; providers?: Record<string, SourceProvider>; newsProvider?: 'currents' | 'newsdata'; accounts?: StudioState['accounts'] };
export type Brand = StudioState['brand'];
export type Results = ResultMetrics;
export type LiveResultPost = { id: number; publicationId: string; title: string; platform: string; accountId: string; format: string; publishedAt: string | null; scheduledAt: string; postUrl: string | null; status: string; engagement: number | null; dataAsOf: string | null; metrics: Record<'impressions'|'reach'|'likes'|'comments'|'shares'|'saves'|'clicks'|'views', number | null> };
export type LiveResults = { scope: 'booklender'; fromDate: string; toDate: string; accounts: {id:string; name:string; platform:string}[]; publishedPosts: number; syncedPosts: number; pendingPosts: number; totals: LiveResultPost['metrics']; metricCoverage: Record<keyof LiveResultPost['metrics'], number>; engagement: number|null; engagementRate: number|null; daily: {date:string; posts:number; engagement:number}[]; byPlatform: {name:string; posts:number; engagement:number; reach:number; impressions:number}[]; byFormat: {name:string; posts:number; engagement:number; reach:number; impressions:number}[]; followers: {accountId:string; name:string; platform:string; current:number|null; growth:number|null; syncedAt:string}[]; topPosts: LiveResultPost[]; recentPosts: LiveResultPost[]; lastSyncedAt: string|null; note:string };
export type CatalogueListItem = { id: string | null; source: 'manual' | 'imported'; isbn: string; title: string; author: string; format: string; archived: boolean };
export type CatalogueBook = CatalogueListItem & { publisher: string; description: string; subjects: string[]; language: string; pages: number | string | null };
export type Catalogue = { books: CatalogueListItem[]; search: string; nextCursor: string | null; hasMore: boolean; pageSize: number };
export type VoiceOption = { id: string; name: string; gender: string; accent: string; previewUrl: string };
export type Voices = { voices: VoiceOption[]; defaultAccent: string };
export type LibraryAsset = { id: string; type: 'image' | 'video'; url: string; mime: string; size: number; name: string; createdAt: string };
export type Library = { assets: LibraryAsset[]; nextCursor: string | null };
export type ResourceMap = { snapshot: StudioState; dashboard: Dashboard; posts: Post[]; ideas: Post[]; review: Post[]; schedule: Post[]; calendar: Post[]; media: unknown; results: Results; sources: Sources; catalogue: Catalogue; voices: Voices; library: Library; brand: Brand; spend: Spend; team: TeamMember[]; logs: Activity[] };
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
  uploadToLibrary(body: FormData): Promise<{ message: string }> { return request('library', { method: 'POST', body }); },
  async library(cursor = ''): Promise<Library> {
    const response = await fetch(`${base}/library?${new URLSearchParams({cursor})}`, {cache:'no-store'});
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Could not load Media library');
    return result as Library;
  },
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
  async results(filters: {fromDate:string; toDate:string; platform:string; accountId:string; format:string}): Promise<LiveResults> {
    const response = await fetch(`${base}/results?${new URLSearchParams(filters)}`, {cache:'no-store'});
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Could not load Results');
    return result as LiveResults;
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
