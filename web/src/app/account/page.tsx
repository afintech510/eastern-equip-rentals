import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
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

  const { data: isAdmin } = await supabase.rpc('is_admin');
  const t = await getTranslations('account');

  return (
    <section className="animate-powerOn flex flex-col gap-6">
      <div className="card-ind p-6">
        <div className="h-2 w-full hazard-stripes -mt-6 -mx-6 mb-6" aria-hidden="true" />
        <h1 className="font-heading text-4xl uppercase tracking-wide">{t('title')}</h1>
        <p className="font-mono text-sm text-ind-steel mt-2 uppercase tracking-widest">
          {t('authedAs', { email: user.email ?? '' })}
        </p>
        <p className="font-body mt-4 text-ind-black/80">{t('body')}</p>
        <div className="mt-6 flex flex-wrap gap-3">
          {isAdmin && (
            <a href="/admin/inventory" className="btn-primary">
              {t('openAdmin')}
            </a>
          )}
          <form action="/auth/signout" method="post">
            <button type="submit" className="btn-secondary">
              {t('logout')}
            </button>
          </form>
        </div>
      </div>
    </section>
  );
}
