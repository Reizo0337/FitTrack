// Cliente HTTP: access token en memoria (nunca localStorage); el refresh va en cookie httpOnly.
let accessToken: string | null = null;

export class ApiError extends Error {
  constructor(public status: number, public code: string) {
    super(code);
  }
}

async function refresh(): Promise<boolean> {
  const r = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' });
  if (!r.ok) return false;
  accessToken = ((await r.json()) as { accessToken: string }).accessToken;
  return true;
}

export async function api<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body) headers.set('content-type', 'application/json');
  if (accessToken) headers.set('authorization', `Bearer ${accessToken}`);
  const r = await fetch(`/api${path}`, { ...init, headers, credentials: 'include' });
  if (r.status === 401 && retry && !path.startsWith('/auth/') && (await refresh())) return api<T>(path, init, false);
  if (!r.ok) throw new ApiError(r.status, ((await r.json().catch(() => ({}))) as { error?: string }).error ?? 'ERROR');
  return r.json() as Promise<T>;
}

export async function login(email: string, password: string) {
  const r = await fetch('/api/auth/login', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) });
  if (!r.ok) throw new ApiError(r.status, ((await r.json().catch(() => ({}))) as { error?: string }).error ?? 'ERROR');
  accessToken = ((await r.json()) as { accessToken: string }).accessToken;
}

export const restoreSession = refresh;

export async function logout() {
  await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
  accessToken = null;
}
