import { createBrowserClient } from '@supabase/ssr';

// Phase 00: client construction only — verifies the public env vars are wired.
// No tables, auth, or queries yet (those land in Phase 01+).
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY — set them via Doppler.',
    );
  }

  return createBrowserClient(url, anonKey);
}
