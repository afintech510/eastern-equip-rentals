import type { Metadata } from 'next';
import Link from 'next/link';
import { getTowns, type Town } from '@/lib/api';

export const revalidate = 86400;
const BASE = process.env.NEXT_PUBLIC_BASE_URL || 'https://rentals.benchworksai.com';

export const metadata: Metadata = {
  title: 'Equipment Rental Service Areas | Eastern Rentals',
  description:
    'Heavy equipment rentals across the Moriches area: Center Moriches, Mastic, Mastic Beach, East Moriches, Manorville, Eastport, Shirley, and Moriches.',
  alternates: { canonical: `${BASE}/rent` },
};

export default async function ServiceAreasPage() {
  let towns: Town[] = [];
  try {
    towns = await getTowns();
  } catch {
    towns = [];
  }

  return (
    <section className="animate-powerOn flex flex-col gap-6">
      <div className="border-b-8 border-ind-black pb-4 bg-ind-white p-6 shadow-heavy">
        <h1 className="font-heading text-5xl uppercase tracking-wide leading-none">
          Service Areas
        </h1>
        <p className="font-mono text-ind-steel mt-2 text-sm uppercase font-bold tracking-widest">
          &gt;&gt;&gt; Heavy equipment rental across the Moriches area
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {towns.map((t) => (
          <Link
            key={t.slug}
            href={`/rent/${t.slug}`}
            className="card-ind p-6 hover:shadow-heavy-sm hover:translate-x-[3px] hover:translate-y-[3px] transition-all"
          >
            <h2 className="font-heading text-3xl uppercase tracking-wide leading-none">
              {t.name}, NY
            </h2>
            <p className="font-mono text-sm text-ind-steel mt-2">Rent equipment in {t.name} →</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
