import Link from 'next/link';
import type { Product } from '@/lib/api';

function rateLabel(p: Product) {
  if (p.booking_fee_mode === 'percent_down' || p.daily_rate === 0) {
    return 'Delivered · Quote';
  }
  return `$${p.daily_rate.toFixed(0)}/day`;
}

export default function ProductCard({ product }: { product: Product }) {
  return (
    <Link
      href={`/equipment/${product.id}`}
      className="card-ind group flex flex-col hover:shadow-heavy-sm hover:translate-x-[3px] hover:translate-y-[3px] transition-all"
    >
      <div className="aspect-[4/3] bg-ind-concrete border-b-4 border-ind-black relative overflow-hidden">
        {product.photo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={product.photo_url} alt={product.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full hazard-stripes-light flex items-center justify-center">
            <span className="font-mono text-xs uppercase tracking-widest text-ind-black/60">
              No image
            </span>
          </div>
        )}
        {product.requires_towing_ack && (
          <span className="absolute top-2 right-2 bg-ind-black text-ind-yellow font-mono text-[10px] uppercase tracking-widest px-2 py-1 border-2 border-ind-yellow">
            Towable
          </span>
        )}
      </div>
      <div className="p-4 flex flex-col gap-1">
        <span className="font-mono text-[10px] uppercase tracking-widest text-ind-steel">
          {product.category}
        </span>
        <h3 className="font-heading text-3xl uppercase tracking-wide leading-none">
          {product.name}
        </h3>
        <span className="font-mono text-lg text-ind-black mt-1">{rateLabel(product)}</span>
      </div>
    </Link>
  );
}
