import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getProduct, type Product } from '@/lib/api';
import CheckoutClient from '@/components/reserve/CheckoutClient';

export const dynamic = 'force-dynamic';

export default async function ReservePage({
  params,
  searchParams,
}: {
  params: { productId: string };
  searchParams: { start?: string; end?: string; fulfillment?: string; address?: string };
}) {
  const t = await getTranslations('reserve');
  const { start, end } = searchParams;
  if (!start || !end) notFound();
  const fulfillment = searchParams.fulfillment === 'delivery' ? 'delivery' : 'pickup';
  const address = searchParams.address ?? '';

  let product: Product;
  try {
    product = await getProduct(params.productId);
  } catch {
    notFound();
  }

  return (
    <section className="animate-powerOn flex flex-col gap-6 max-w-2xl mx-auto w-full">
      <Link
        href={`/equipment/${product.id}`}
        className="font-heading text-2xl uppercase tracking-wider inline-flex items-center gap-2 bg-ind-white px-4 py-1 border-4 border-ind-black shadow-heavy-sm self-start hover:text-ind-danger transition-colors"
      >
        ‹ {t('back')}
      </Link>
      <h1 className="font-heading text-5xl uppercase tracking-wide leading-none">
        {t('title')} · {product.name}
      </h1>
      <CheckoutClient
        product={product}
        start={start}
        end={end}
        fulfillment={fulfillment}
        deliveryAddress={address}
      />
    </section>
  );
}
