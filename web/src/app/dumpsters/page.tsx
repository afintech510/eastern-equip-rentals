import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { getProducts, type Product } from '@/lib/api';
import ProductCard from '@/components/catalog/ProductCard';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: '20-Yard Roll-Off Dumpster Rentals — Eastern Rentals, Center Moriches NY',
  description:
    'Flat-rate 20-yard roll-off dumpster rentals. $850 includes up to 10 tons and 2 weeks on site. Delivery and pickup within 40 miles of Center Moriches.',
};

export default async function DumpstersPage() {
  const t = await getTranslations('dumpsters');

  let products: Product[] = [];
  let error = false;
  try {
    products = await getProducts();
  } catch {
    error = true;
  }
  // Dumpsters are the flat-fee (percent_down) carve-out (spec §3.2).
  const dumpsters = products.filter((p) => p.booking_fee_mode === 'percent_down' && p.active);
  const primary = dumpsters[0];

  return (
    <section className="animate-powerOn flex flex-col gap-8">
      {/* Header */}
      <div className="border-b-8 border-ind-black pb-4 bg-ind-white p-6 shadow-heavy">
        <h1 className="font-heading text-5xl uppercase tracking-wide leading-none">{t('title')}</h1>
        <p className="font-mono text-ind-steel mt-2 text-sm uppercase font-bold tracking-widest">
          {t('subtitle')}
        </p>
      </div>

      {error ? (
        <div className="card-ind p-8 text-center">
          <p className="font-heading text-3xl uppercase tracking-wide text-ind-danger">
            {t('offlineTitle')}
          </p>
          <p className="font-mono text-sm text-ind-steel mt-2">{t('offlineBody')}</p>
        </div>
      ) : (
        <>
          {/* Lead / marketing */}
          <div className="card-ind overflow-hidden flex flex-col lg:flex-row">
            <div className="lg:w-1/2 aspect-[4/3] lg:aspect-auto bg-ind-concrete border-b-4 lg:border-b-0 lg:border-r-4 border-ind-black">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/img/dumpster.jpg"
                alt={t('leadTitle')}
                className="w-full h-full object-cover"
              />
            </div>
            <div className="lg:w-1/2 p-6 md:p-10 flex flex-col gap-4 justify-center">
              <h2 className="font-heading text-3xl md:text-4xl uppercase tracking-wide leading-none">
                {t('leadTitle')}
              </h2>
              <p className="font-body text-lg text-ind-black/80">{t('leadBody')}</p>
              <ul className="font-mono text-sm flex flex-col gap-2 border-t-2 border-ind-black/10 pt-4">
                {['b1', 'b2', 'b3', 'b4'].map((b) => (
                  <li key={b} className="flex items-center gap-2">
                    <span className="text-ind-yellow [-webkit-text-stroke:1px_#1a1a1a] font-bold">
                      ▸
                    </span>
                    {t(b)}
                  </li>
                ))}
              </ul>
              {primary && (
                <Link href={`/equipment/${primary.id}`} className="btn-primary self-start mt-2">
                  {t('reserveCta')}
                </Link>
              )}
            </div>
          </div>

          {/* Unit cards (reserve flow lives on the product detail) */}
          {dumpsters.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {dumpsters.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          ) : (
            <div className="card-ind p-10 text-center">
              <p className="font-heading text-3xl uppercase tracking-wide">{t('emptyTitle')}</p>
              <p className="font-mono text-sm text-ind-steel mt-2">{t('emptyBody')}</p>
            </div>
          )}
        </>
      )}
    </section>
  );
}
