import { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';
const apiBase = process.env.BOOKLENDER_API_URL || 'http://127.0.0.1:8001/api/v1';

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!/^[a-f0-9-]{36}$/i.test(id)) return new Response('Invalid media ID', { status: 400 });
  const headers = new Headers();
  headers.set('cookie', request.headers.get('cookie') || '');
  if (request.headers.get('range')) headers.set('range', request.headers.get('range')!);
  const upstream = await fetch(`${apiBase}/studio/media/${id}`, { headers, cache: 'no-store' });
  const responseHeaders = new Headers();
  for (const key of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'cache-control']) {
    const value = upstream.headers.get(key); if (value) responseHeaders.set(key, value);
  }
  responseHeaders.set('X-Content-Type-Options', 'nosniff');
  return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
}
