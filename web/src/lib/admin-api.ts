'use client';

import { apiBase } from '@/lib/api';
import { createClient } from '@/lib/supabase/client';

async function token(): Promise<string | null> {
  const { data } = await createClient().auth.getSession();
  return data.session?.access_token ?? null;
}

// Calls /api/v1/admin/* with the current user's bearer token. Throws on non-2xx.
export async function adminFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const t = await token();
  const res = await fetch(`${apiBase()}/api/v1/admin${path}`, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      ...(t ? { Authorization: `Bearer ${t}` } : {}),
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const msg = body?.detail?.message || body?.detail || `Request failed (${res.status})`;
    throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
  }
  return body as T;
}
