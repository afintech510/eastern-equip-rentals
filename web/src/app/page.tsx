import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { getProducts, getTowns, type Product, type Town } from '@/lib/api';
import ProductCard from '@/components/catalog/ProductCard';

// Real landing page (F-001). Reads the API for featured units + service towns;
// keep it dynamic so newly-activated products/towns appear.
export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Eastern Rentals — Heavy Equipment & Dumpster Rentals, Center Moriches NY',
  description:
    'Reserve skid steers, mini excavators, chippers and 20-yard roll-off dumpsters online. Pickup in Center Moriches or delivery within 40 miles.',
};

export default async function Home() {
  const t = await getTranslations('home');

  let products: Product[] = [];
  let towns: Town[] = [];
  try {
    [products, towns] = await Promise.all([getProducts(), getTowns()]);
  } catch {
    // Hero + CTAs still render if the API is briefly unreachable.
  }

  const featured = products
    .filter((p) => p.booking_fee_mode !== 'percent_down' && p.active)
    .slice(0, 3);

  return (
    <div className="animate-powerOn flex flex-col gap-12">
      {/* Hero */}
      <section className="relative bg-ind-black text-ind-white shadow-heavy border-b-8 border-ind-yellow overflow-hidden">
        <div className="h-2 w-full hazard-stripes" aria-hidden="true" />
        <div className="p-6 md:p-12 flex flex-col gap-5 max-w-3xl">
          <span className="font-mono text-xs md:text-sm uppercase tracking-[0.2em] text-ind-yellow">
            {t('kicker')}
          </span>
          <h1 className="font-heading text-5xl md:text-7xl uppercase tracking-wide leading-[0.95]">
            {t('title')}
          </h1>
          <p className="font-body text-lg md:text-xl text-ind-white/80">{t('subtitle')}</p>
          <div className="flex flex-col sm:flex-row gap-3 mt-2">
            <Link href="/equipment" className="btn-primary text-center">
              {t('browseCta')}
            </Link>
            <Link
              href="/dumpsters"
              className="btn-outline border-ind-yellow text-ind-yellow hover:bg-ind-yellow hover:text-ind-black text-center"
            >
              {t('dumpsterCta')}
            </Link>
          </div>
        </div>
      </section>

      {/* Featured equipment */}
      {featured.length > 0 && (
        <section className="flex flex-col gap-5">
          <div className="flex items-end justify-between gap-4 border-b-4 border-ind-black pb-2">
            <h2 className="font-heading text-3xl md:text-4xl uppercase tracking-wide">
              {t('featuredTitle')}
            </h2>
            <Link href="/equipment" className="font-mono text-sm uppercase hover:text-ind-danger">
              {t('viewAll')}
            </Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {featured.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      )}

      {/* Dumpster callout */}
      <section className="card-ind overflow-hidden flex flex-col md:flex-row">
        <div className="md:w-1/2 aspect-[4/3] md:aspect-auto bg-ind-concrete border-b-4 md:border-b-0 md:border-r-4 border-ind-black">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/img/dumpster.jpg"
            alt={t('dumpsterTitle')}
            className="w-full h-full object-cover"
          />
        </div>
        <div className="md:w-1/2 p-6 md:p-10 flex flex-col gap-4 justify-center">
          <h2 className="font-heading text-3xl md:text-4xl uppercase tracking-wide leading-none">
            {t('dumpsterTitle')}
          </h2>
          <p className="font-body text-lg text-ind-black/80">{t('dumpsterBody')}</p>
          <Link href="/dumpsters" className="btn-primary self-start">
            {t('dumpsterCtaAlt')}
          </Link>
        </div>
      </section>

      {/* How it works */}
      <section className="flex flex-col gap-5">
        <h2 className="font-heading text-3xl md:text-4xl uppercase tracking-wide border-b-4 border-ind-black pb-2">
          {t('howTitle')}
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[1, 2, 3].map((n) => (
            <div key={n} className="card-ind p-6 flex flex-col gap-2">
              <span className="font-stencil text-5xl text-ind-yellow [-webkit-text-stroke:2px_#1a1a1a] leading-none">
                {String(n).padStart(2, '0')}
              </span>
              <h3 className="font-heading text-2xl uppercase tracking-wide">{t(`step${n}Title`)}</h3>
              <p className="font-mono text-sm text-ind-black/70">{t(`step${n}Body`)}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Service areas */}
      <section className="bg-ind-black text-ind-white p-6 md:p-10 shadow-heavy border-l-8 border-ind-yellow flex flex-col gap-4">
        <h2 className="font-heading text-3xl md:text-4xl uppercase tracking-wide">
          {t('areasTitle')}
        </h2>
        <p className="font-body text-lg text-ind-white/80 max-w-2xl">{t('areasBody')}</p>
        {towns.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {towns.slice(0, 8).map((town) => (
              <Link
                key={town.id}
                href={`/rent/${town.slug}`}
                className="font-mono text-sm border-2 border-ind-yellow text-ind-yellow px-3 py-1 hover:bg-ind-yellow hover:text-ind-black transition-colors"
              >
                {town.name}
              </Link>
            ))}
          </div>
        )}
        <Link href="/rent" className="btn-primary self-start mt-1">
          {t('viewAreas')}
        </Link>
      </section>
    </div>
  );
}
