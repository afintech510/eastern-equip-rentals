// Canonical public origin for AUTH EMAIL links (password reset, signup
// confirmation). These links are clicked from an inbox, so they must resolve to
// the real public host and stay inside Supabase's redirect allow-list — never a
// dev artifact like https://0.0.0.0:3000 or an un-allow-listed IP, which is what
// broke the reset/confirm flows when the app was opened on a non-prod origin.
//
// We trust the live browser origin only when it is already an allow-listed host
// (prod domain or localhost:3009); otherwise we fall back to NEXT_PUBLIC_BASE_URL
// and finally to the hard-coded prod domain.

const PROD = 'https://rentals.benchworksai.com';

// Hosts present in the Supabase Auth "Redirect URLs" allow-list.
function isAllowlisted(origin: string): boolean {
  return /^https:\/\/rentals\.benchworksai\.com$/.test(origin) || /^https?:\/\/localhost:3009$/.test(origin);
}

export function siteOrigin(): string {
  if (typeof window !== 'undefined' && isAllowlisted(window.location.origin)) {
    return window.location.origin;
  }
  const env = process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/$/, '');
  if (env && !/0\.0\.0\.0|127\.0\.0\.1/.test(env)) return env;
  return PROD;
}

// Build a Supabase auth-callback redirect URL (code exchange → `next`).
export function authCallbackUrl(next: string): string {
  return `${siteOrigin()}/auth/callback?next=${next}`;
}
