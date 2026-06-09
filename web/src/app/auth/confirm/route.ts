import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Token-hash email confirmation (password reset, signup confirm, magic link,
// email change). Unlike the PKCE `code` exchange, verifyOtp({ token_hash })
// needs no client-side code_verifier, so the link works from ANY browser or
// device and survives inbox prefetch quirks. Supabase email templates point
// here with ?token_hash=...&type=...&next=...
type EmailOtpType = 'signup' | 'invite' | 'magiclink' | 'recovery' | 'email_change' | 'email';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token_hash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
  const next = searchParams.get('next') ?? '/account';
  // Behind nginx, request.url's host is the container's internal bind address;
  // use the canonical public origin for redirects.
  const base =
    process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/$/, '') || 'https://rentals.benchworksai.com';

  if (token_hash && type) {
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.verifyOtp({ type, token_hash });
      if (!error) {
        return NextResponse.redirect(`${base}${next}`);
      }
    } catch {
      // fall through to the error redirect
    }
  }

  return NextResponse.redirect(`${base}/login?error=auth_link_invalid`);
}
