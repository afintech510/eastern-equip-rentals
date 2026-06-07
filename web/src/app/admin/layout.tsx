import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

// Guards every /admin/* route: must be signed in AND an active admin
// (is_admin() reads admin_users — server-side, never a client claim).
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: isAdmin } = await supabase.rpc('is_admin');
  if (!isAdmin) {
    return (
      <section className="card-ind p-8 text-center animate-powerOn">
        <div className="h-2 w-full hazard-stripes -mt-8 -mx-8 mb-6" aria-hidden="true" />
        <h1 className="font-heading text-4xl uppercase tracking-wide text-ind-danger">
          Access Denied
        </h1>
        <p className="font-mono text-sm text-ind-steel mt-2">
          &gt;&gt;&gt; Operator authorization required for the yard office.
        </p>
      </section>
    );
  }

  return (
    <div className="animate-powerOn">
      <nav className="mb-6 flex gap-3 border-b-8 border-ind-black pb-3" aria-label="Admin sections">
        <Link href="/admin/inventory" className="btn-outline">
          Inventory
        </Link>
        <Link href="/admin/licenses" className="btn-outline">
          Licenses
        </Link>
        <Link href="/admin/rentals" className="btn-outline">
          Rentals
        </Link>
      </nav>
      {children}
    </div>
  );
}
