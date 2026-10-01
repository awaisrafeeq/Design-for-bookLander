import { cookies } from 'next/headers';
import { Shell } from '@/features/studio/components/Shell';
import { redirect } from 'next/navigation';

const apiBase = process.env.BOOKLENDER_API_URL || 'http://127.0.0.1:8001/api/v1';

export default async function StudioLayout({ children }: { children: React.ReactNode }) {
  const cookieHeader = (await cookies()).getAll().map(({ name, value }) => `${name}=${value}`).join('; ');
  try {
    const response = await fetch(`${apiBase}/auth/me`, {
      headers: cookieHeader ? { cookie: cookieHeader } : {},
      cache: 'no-store',
    });
    if (!response.ok) redirect('/login');
  } catch (error) {
    if (error && typeof error === 'object' && 'digest' in error) throw error;
    redirect('/login');
  }
  return <Shell>{children}</Shell>;
}
