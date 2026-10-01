import type { Activity, Connection, Event, Post, Source, TeamMember, StudioState, ResultMetrics } from './types';

export type Dashboard = { posts: Post[]; spend: Spend; connections: Connection[]; activity: Activity[] };
export type Spend = StudioState['spend'];
export type Sources = { sources: Record<Source, boolean>; connections: Connection[]; events: Event[] };
export type Brand = StudioState['brand'];
export type Results = ResultMetrics;
export type ResourceMap = { snapshot: StudioState; dashboard: Dashboard; posts: Post[]; ideas: Post[]; review: Post[]; schedule: Post[]; results: Results; sources: Sources; brand: Brand; spend: Spend; team: TeamMember[]; logs: Activity[] };
export type Resource = keyof ResourceMap;

const base = process.env.NEXT_PUBLIC_STUDIO_API_BASE_URL || '/api/studio';
async function request<T>(resource: Resource, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set('Content-Type', 'application/json');
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
};
