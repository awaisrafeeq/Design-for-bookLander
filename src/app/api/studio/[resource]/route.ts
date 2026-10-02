import { NextRequest, NextResponse } from 'next/server';
import { mutateResource, readResource } from '@/features/studio/server/store';
import type { StudioState } from '@/features/studio/types';

export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ resource: string }> };
const apiBase = process.env.BOOKLENDER_API_URL || 'http://127.0.0.1:8001/api/v1';
const persistentResources = new Set(['brand', 'spend', 'team', 'posts', 'sources', 'logs', 'schedule', 'calendar', 'media']);

async function isAuthenticated(request: NextRequest) {
  const cookie = request.headers.get('cookie');
  if (!cookie) return false;
  try {
    const response = await fetch(`${apiBase}/auth/me`, { headers: { cookie }, cache: 'no-store' });
    return response.ok;
  } catch {
    return false;
  }
}

async function authenticatedUser(request: NextRequest): Promise<{ role?: string; modules?: string[]; is_approver?: boolean; permissions?: Record<string, boolean> } | null> {
  const cookie = request.headers.get('cookie');
  if (!cookie) return null;
  try {
    const response = await fetch(`${apiBase}/auth/me`, { headers: { cookie }, cache: 'no-store' });
    return response.ok ? await response.json() as { role?: string; modules?: string[]; is_approver?: boolean; permissions?: Record<string, boolean> } : null;
  } catch {
    return null;
  }
}

function canAccess(user: { role?: string; modules?: string[] }, module: string) {
  return user.role === 'admin' || Boolean(user.modules?.includes(module));
}

async function hasValidCsrf(request: NextRequest) {
  const cookie = request.headers.get('cookie');
  const supplied = request.headers.get('x-csrf-token');
  if (!cookie || !supplied) return false;
  try {
    const response = await fetch(`${apiBase}/auth/csrf`, { headers: { cookie }, cache: 'no-store' });
    if (!response.ok) return false;
    const result = await response.json() as { csrf_token?: string };
    return Boolean(result.csrf_token && result.csrf_token === supplied);
  } catch {
    return false;
  }
}

async function backendResource(request: NextRequest, resource: string, method: 'GET' | 'POST') {
  const headers = new Headers();
  const cookie = request.headers.get('cookie');
  if (cookie) headers.set('cookie', cookie);
  if (method === 'POST') {
    headers.set('content-type', request.headers.get('content-type') || 'application/json');
    const csrf = request.headers.get('x-csrf-token');
    if (csrf) headers.set('x-csrf-token', csrf);
  }
  const upstream = await fetch(`${apiBase}/studio/${resource}${method === 'GET' ? request.nextUrl.search : ''}`, {
    method,
    headers,
    body: method === 'POST' ? await request.arrayBuffer() : undefined,
    cache: 'no-store',
  });
  const result = await upstream.json().catch(() => ({})) as Record<string, unknown>;
  if (!upstream.ok && typeof result.detail === 'string') result.error = result.detail;
  return NextResponse.json(result, { status: upstream.status, headers: { 'Cache-Control': 'no-store' } });
}

export async function GET(request: NextRequest, context: Context) {
  if (!await isAuthenticated(request)) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  const resource = (await context.params).resource;
  try {
    if (persistentResources.has(resource)) return await backendResource(request, resource, 'GET');
    if (resource === 'snapshot') {
      const [brand, spend, team, posts, sources, logs] = await Promise.all(['brand', 'spend', 'team', 'posts', 'sources', 'logs'].map(name => backendResource(request, name, 'GET')));
      if (!brand.ok || !spend.ok) return NextResponse.json({ error: 'Could not load saved settings from the backend.' }, { status: 503 });
      if (!posts.ok) return NextResponse.json({ error: 'Could not load saved workflow data from the backend.' }, { status: 503 });
      if (!sources.ok) return NextResponse.json({ error: 'Could not load saved source settings from the backend.' }, { status: 503 });
      if (!logs.ok && logs.status !== 403) return NextResponse.json({ error: 'Could not load the audit log from the backend.' }, { status: 503 });
      const [brandState, spendState, teamState, postsState, sourcesState, logsState, user] = await Promise.all([brand.json(), spend.json(), team.ok ? team.json() : Promise.resolve([]), posts.json(), sources.json(), logs.ok ? logs.json() : Promise.resolve([]), authenticatedUser(request)]);
      const postCounts = {
        ideas: postsState.filter((post: { stage: string }) => post.stage === 'idea').length,
        picked: postsState.filter((post: { stage: string }) => post.stage === 'selected').length,
        made: postsState.filter((post: { stage: string }) => ['review', 'scheduled', 'published'].includes(post.stage)).length,
        approved: postsState.filter((post: { stage: string }) => ['scheduled', 'published'].includes(post.stage)).length,
        published: postsState.filter((post: { stage: string }) => post.stage === 'published').length,
        errors: postsState.filter((post: { error?: string }) => Boolean(post.error)).length,
      };
      const seed = readResource('snapshot') as StudioState;
      const emptyResults = { ...seed.results, posts: 0, kpi: { reach: [0, 0], impressions: [0, 0], er: [0, 0], clicks: [0, 0], followers: [0, 0] }, weeks: seed.results.weeks.map(item => ({ ...item, value: 0 })), byFormat: seed.results.byFormat.map(item => ({ ...item, engagement: 0 })), byPlatform: seed.results.byPlatform.map(item => ({ ...item, engagement: 0 })), best: 'Waiting for verified publishing and analytics data.', learned: [] };
      return NextResponse.json({ ...seed, modules: user?.modules || [], permissions: user?.permissions || {}, books: {}, videos: [], news: { read: 0, kept: 0 }, accounts: sourcesState.accounts || [], brand: brandState, spend: spendState, team: teamState, posts: postsState, activity: logsState, events: sourcesState.events, connections: sourcesState.connections, sources: sourcesState.sources, summary: postCounts, results: emptyResults }, { headers: { 'Cache-Control': 'no-store' } });
    }
    return NextResponse.json(readResource(resource), { headers: { 'Cache-Control': 'no-store' } });
  }
  catch (error) { return NextResponse.json({ error: (error as Error).message }, { status: 404 }); }
}
export async function POST(request: NextRequest, context: Context) {
  const user = await authenticatedUser(request);
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  if (!await hasValidCsrf(request)) return NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 });
  const resource = (await context.params).resource;
  try {
    if (persistentResources.has(resource)) return await backendResource(request, resource, 'POST');
    const command = await request.json() as { action?: string };
    const action = command.action || '';
    let requiredModule = resource === 'sources' ? 'Sources' : 'Ideas';
    if (resource === 'posts' && ['approve', 'reject', 'revise'].includes(action)) requiredModule = 'Review';
    if (resource === 'posts' && ['archive', 'restore', 'unpick'].includes(action)) requiredModule = 'Board';
    if (resource === 'team') requiredModule = 'Team';
    if (!canAccess(user, requiredModule)) return NextResponse.json({ error: 'You do not have access to this area.' }, { status: 403 });
    if (resource === 'posts' && action === 'approve' && user.role !== 'admin' && !user.is_approver) {
      return NextResponse.json({ error: 'Only an assigned approver can approve content.' }, { status: 403 });
    }
    return NextResponse.json(mutateResource(resource, command));
  }
  catch (error) { return NextResponse.json({ error: (error as Error).message }, { status: (error as Error).message.includes('not found') ? 404 : 400 }); }
}
