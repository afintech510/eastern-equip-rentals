import { createClient } from '@supabase/supabase-js';

// Dedicated client for the OUTBOUND auth-email requests (password reset, signup
// confirmation) ONLY.
//
// Why separate: @supabase/ssr's browser client hardcodes flowType:'pkce', whose
// email links return a `?code` that needs a code_verifier cookie — which is
// absent when the link is opened on another device/browser (→ the 500s). This
// client uses the IMPLICIT flow, so the email link instead returns the session
// in the URL hash (`#access_token=...`), which needs no verifier and works from
// anywhere. The landing page's normal cookie client then ingests that hash via
// its detectSessionInUrl, establishing the cookie session for the whole app.
//
// It never persists a session itself (persistSession:false) so it can't clobber
// the cookie-based session the rest of the app relies on.
let client: ReturnType<typeof createClient> | null = null;

export function emailFlowClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY.');
  }
  client ??= createClient(url, anonKey, {
    auth: {
      flowType: 'implicit',
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  return client;
}
