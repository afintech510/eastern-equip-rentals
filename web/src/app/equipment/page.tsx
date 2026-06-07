import Link from 'next/link';
import { getProducts, type Product } from '@/lib/api';
import ProductCard from '@/components/catalog/ProductCard';

export const metadata = { title: 'Equipment Roster — Eastern Rentals' };
// Catalog reads the API; keep it dynamic so newly-activated products appear.
export const dynamic = 'force-dynamic';

export default async function EquipmentPage({
  searchParams,
}: {
  searchParams: { category?: string };
}) {
  const active = (searchParams.category ?? '').toLowerCase();

  let products: Product[] = [];
  let error: string | null = null;
  try {
    products = await getProducts();
  } catch (e) {
    error = e instanceof Error ? e.message : 'Failed to load fleet';
  }

  const categories = Array.from(new Set(products.map((p) => p.category))).sort();
  const shown = active ? products.filter((p) => p.category.toLowerCase() === active) : products;

  return (
    <section className="animate-powerOn">
      {/* Roster header */}
      <div className="mb-8 border-b-8 border-ind-black pb-4 flex flex-col md:flex-row justify-between items-start md:items-end gap-4 bg-ind-white p-6 shadow-heavy relative">
        <span
          className="absolute top-2 left-2 w-3 h-3 rounded-full bg-ind-concrete border-2 border-ind-black"
          aria-hidden="true"
        />
        <span
          className="absolute top-2 right-2 w-3 h-3 rounded-full bg-ind-concrete border-2 border-ind-black"
          aria-hidden="true"
        />
        <span
          className="absolute bottom-2 left-2 w-3 h-3 rounded-full bg-ind-concrete border-2 border-ind-black"
          aria-hidden="true"
        />
        <span
          className="absolute bottom-2 right-2 w-3 h-3 rounded-full bg-ind-concrete border-2 border-ind-black"
          aria-hidden="true"
        />
        <div className="pl-4">
          <h1 className="font-heading text-5xl font-bold text-ind-black tracking-wide uppercase m-0 leading-none">
            Equipment Roster
          </h1>
          <p className="font-mono text-ind-steel mt-2 text-sm uppercase font-bold tracking-widest">
            &gt;&gt;&gt; Select unit for spec sheets &amp; availability
          </p>
        </div>

        {categories.length > 0 && (
          <div className="flex flex-wrap gap-3">
            <Link
              href="/equipment"
              className={`btn-outline ${!active ? 'bg-ind-black text-ind-yellow border-ind-black' : ''}`}
            >
              All Units
            </Link>
            {categories.map((c) => (
              <Link
                key={c}
                href={`/equipment?category=${encodeURIComponent(c)}`}
                className={`btn-outline ${active === c.toLowerCase() ? 'bg-ind-black text-ind-yellow border-ind-black' : ''}`}
              >
                {c}
              </Link>
            ))}
          </div>
        )}
      </div>

      {error ? (
        <div className="card-ind p-8 text-center">
          <p className="font-heading text-3xl uppercase tracking-wide text-ind-danger">
            Yard Offline
          </p>
          <p className="font-mono text-sm text-ind-steel mt-2">
            Could not reach the fleet service. Try again shortly.
          </p>
        </div>
      ) : shown.length === 0 ? (
        <div className="card-ind p-10 text-center">
          <p className="font-heading text-3xl uppercase tracking-wide">No Units In This Class</p>
          <p className="font-mono text-sm text-ind-steel mt-2">
            &gt;&gt;&gt; Check back — iron is being staged.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {shown.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      )}
    </section>
  );
}
