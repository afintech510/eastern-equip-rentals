import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: 'Account — Eastern Rentals' };

// Auth-gated landing. Phase 03 builds the full account UI (profile, license,
// rentals); this is the minimal protected page that completes the auth flow.
export default async function AccountPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // First-authenticated-request backstop (§7.1, REV-021): guarantees a
  // customers row exists even if the auth.users trigger was bypassed.
  await supabase.rpc('ensure_customer');

  return (
    <section className="animate-powerOn flex flex-col gap-6">
      <div className="card-ind p-6">
        <div className="h-2 w-full hazard-stripes -mt-6 -mx-6 mb-6" aria-hidden="true" />
        <h1 className="font-heading text-4xl uppercase tracking-wide">Operator Console</h1>
        <p className="font-mono text-sm text-ind-steel mt-2 uppercase tracking-widest">
          &gt;&gt;&gt; Authenticated as {user.email}
        </p>
        <p className="font-body mt-4 text-ind-black/80">
          Profile, license upload, and active jobs deploy in Phase 03. Your account is provisioned
          and ready.
        </p>
        <form action="/auth/signout" method="post" className="mt-6">
          <button type="submit" className="btn-secondary">
            Log Out
          </button>
        </form>
      </div>
    </section>
  );
}
