import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
const apiBase = process.env.BOOKLENDER_API_URL || 'http://127.0.0.1:8001/api/v1';
type Context = { params: Promise<{ action: string }> };

async function forward(request: NextRequest, action: string, method: 'GET' | 'POST') {
  if (!['login', 'activate-invitation', 'me', 'csrf', 'logout', 'profile', 'password'].includes(action)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const headers = new Headers();
  const cookie = request.headers.get('cookie');
  const csrf = request.headers.get('x-csrf-token');
  const requestId = request.headers.get('x-request-id');
  if (cookie) headers.set('cookie', cookie);
  const clientIp = request.headers.get('x-real-ip');
  if (clientIp) headers.set('x-client-ip', clientIp);
  if (csrf) headers.set('x-csrf-token', csrf);
  if (requestId) headers.set('x-request-id', requestId);
  if (method === 'POST') headers.set('content-type', 'application/json');

  try {
    const upstream = await fetch(`${apiBase}/auth/${action}`, {
      method,
      headers,
      body: method === 'POST' ? await request.text() : undefined,
      cache: 'no-store',
    });
    const text = await upstream.text();
    const response = new NextResponse(text || null, {
      status: upstream.status,
      headers: { 'Content-Type': upstream.headers.get('content-type') || 'application/json', 'Cache-Control': 'no-store' },
    });
    const setCookie = upstream.headers.get('set-cookie');
    if (setCookie) response.headers.set('set-cookie', setCookie);
    const retryAfter = upstream.headers.get('retry-after');
    if (retryAfter) response.headers.set('retry-after', retryAfter);
    return response;
  } catch {
    return NextResponse.json({ error: 'Authentication service is unavailable.' }, { status: 503 });
  }
}

export async function GET(request: NextRequest, context: Context) {
  return forward(request, (await context.params).action, 'GET');
}

export async function POST(request: NextRequest, context: Context) {
  return forward(request, (await context.params).action, 'POST');
}
