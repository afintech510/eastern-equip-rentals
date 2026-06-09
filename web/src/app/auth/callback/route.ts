import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Exchanges the auth code for a session (email confirmation, password-reset
// links, magic links), then redirects to `next` (default home).
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/account';

  if (code) {
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) {
        return NextResponse.redirect(`${origin}${next}`);
      }
    } catch {
      // exchangeCodeForSession throws (not just returns an error) when the PKCE
      // code_verifier cookie is missing — e.g. the link was opened in a
      // different browser/device. Never let that 500; fall through gracefully.
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
