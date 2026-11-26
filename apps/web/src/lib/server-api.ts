import 'server-only';
import { cookies } from 'next/headers';

const API_URL = process.env.API_INTERNAL_URL ?? 'http://localhost:4000';

/** Server-component fetch straight to the API, forwarding the session cookie. */
export async function serverApi<T>(path: string): Promise<T | null> {
  const jar = await cookies();
  const session = jar.get('jp_session');
  try {
    const res = await fetch(`${API_URL}/api${path}`, {
      cache: 'no-store',
      headers: session ? { cookie: `jp_session=${session.value}` } : {},
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}
