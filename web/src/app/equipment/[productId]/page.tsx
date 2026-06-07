import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getProduct, type Product } from '@/lib/api';
import AvailabilityCalendar from '@/components/catalog/AvailabilityCalendar';

export const dynamic = 'force-dynamic';

export default async function ProductDetailPage({ params }: { params: { productId: string } }) {
  const t = await getTranslations('detail');
  let product: Product;
  try {
    product = await getProduct(params.productId);
  } catch {
    notFound();
  }

  const isDumpster = product.booking_fee_mode === 'percent_down';

  return (
    <section className="animate-powerOn flex flex-col gap-6">
      <Link
        href="/equipment"
        className="font-heading text-2xl uppercase tracking-wider inline-flex items-center gap-2 bg-ind-white px-4 py-1 border-4 border-ind-black shadow-heavy-sm self-start hover:text-ind-danger transition-colors"
      >
        ‹ {t('back')}
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Spec sheet */}
        <div className="card-ind overflow-hidden">
          <div className="aspect-[4/3] bg-ind-concrete border-b-4 border-ind-black">
            {product.photo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={product.photo_url}
                alt={product.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full hazard-stripes-light flex items-center justify-center">
                <span className="font-mono text-xs uppercase tracking-widest text-ind-black/60">
                  {t('noImage')}
                </span>
              </div>
            )}
          </div>
          <div className="p-6 flex flex-col gap-3">
            <span className="font-mono text-xs uppercase tracking-widest text-ind-steel">
              {product.category}
            </span>
            <h1 className="font-heading text-5xl uppercase tracking-wide leading-none">
              {product.name}
            </h1>
            <p className="font-mono text-2xl">
              {isDumpster || product.daily_rate === 0
                ? t('deliveredQuote')
                : `$${product.daily_rate.toFixed(2)} ${t('perDay')}`}
            </p>
            {product.description && (
              <p className="font-body text-ind-black/80 mt-1">{product.description}</p>
            )}
            <ul className="font-mono text-sm mt-2 flex flex-col gap-1 border-t-2 border-ind-black/10 pt-3">
              <li>{t('maxRental', { days: product.max_rental_days })}</li>
              <li>{t('deposit')}</li>
              {product.requires_towing_ack && (
                <li className="text-ind-danger font-bold uppercase">{t('towingRequired')}</li>
              )}
              {isDumpster && <li>{t('billingDown')}</li>}
            </ul>
          </div>
        </div>

        {/* Availability */}
        <div className="flex flex-col gap-3">
          <h2 className="font-heading text-3xl uppercase tracking-wide border-b-4 border-ind-black pb-2">
            {t('availability')}
          </h2>
          <AvailabilityCalendar productId={product.id} maxRentalDays={product.max_rental_days} />
        </div>
      </div>
    </section>
  );
}
