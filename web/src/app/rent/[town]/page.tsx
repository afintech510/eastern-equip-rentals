import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTown, getTowns, type Town } from '@/lib/api';
import { localBusinessJsonLd, townContent } from '@/lib/town-content';

// SSR per request (F-024): the cookie-based locale (next-intl in the layout)
// makes the app dynamic, so we render town pages dynamically — the HTML is
// still fully crawlable with unique copy + LocalBusiness JSON-LD.
export const dynamic = 'force-dynamic';

const BASE = process.env.NEXT_PUBLIC_BASE_URL || 'https://rentals.benchworksai.com';

export async function generateMetadata({
  params,
}: {
  params: { town: string };
}): Promise<Metadata> {
  try {
    const t = await getTown(params.town);
    const c = townContent(t);
    return {
      title: c.title,
      description: c.metaDescription,
      alternates: { canonical: `${BASE}/rent/${t.slug}` },
      openGraph: { title: c.title, description: c.metaDescription, url: `${BASE}/rent/${t.slug}` },
    };
  } catch {
    return { title: 'Equipment Rental | Eastern Rentals' };
  }
}

export default async function TownPage({ params }: { params: { town: string } }) {
  let town: Town;
  let towns: Town[] = [];
  try {
    [town, towns] = await Promise.all([getTown(params.town), getTowns()]);
  } catch {
    notFound();
  }
  const c = townContent(town);
  const nearby = towns.filter((x) => x.slug !== town.slug).slice(0, 6);

  return (
    <section className="animate-powerOn flex flex-col gap-6 max-w-3xl">
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(localBusinessJsonLd(town, BASE)) }}
      />
      <div className="bg-ind-black text-ind-white p-6 md:p-10 border-8 border-ind-black shadow-heavy relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-2 hazard-stripes" aria-hidden="true" />
        <p className="font-mono text-xs uppercase tracking-widest text-ind-yellow mt-2">
          Service Area
        </p>
        <h1 className="font-heading text-5xl md:text-6xl uppercase tracking-wide text-ind-yellow leading-none mt-1">
          {c.hero}
        </h1>
        <p className="font-body text-lg mt-4 max-w-2xl">{c.intro}</p>
        <Link href="/equipment" className="btn-primary inline-block mt-6">
          View The Fleet
        </Link>
      </div>

      <div className="card-ind p-6 flex flex-col gap-4">
        {c.body.map((p, i) => (
          <p key={i} className="font-body text-ind-black/85">
            {p}
          </p>
        ))}
      </div>

      <div className="card-ind p-6">
        <h2 className="font-heading text-3xl uppercase tracking-wide mb-3">Nearby Service Areas</h2>
        <div className="flex flex-wrap gap-2">
          {nearby.map((n) => (
            <Link key={n.slug} href={`/rent/${n.slug}`} className="btn-outline">
              {n.name}
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
