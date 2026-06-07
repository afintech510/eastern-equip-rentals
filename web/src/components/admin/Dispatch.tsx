'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { adminFetch } from '@/lib/admin-api';

type R = {
  id: string;
  status: string;
  start_date: string;
  end_date: string;
  fulfillment: string;
  delivery_address: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  product_name: string | null;
};
type DispatchData = { date: string; pickups: R[]; returns: R[]; deliveries: R[] };

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function Dispatch() {
  const [day, setDay] = useState(today());
  const [data, setData] = useState<DispatchData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await adminFetch<DispatchData>(`/dispatch?day=${day}`));
    } finally {
      setLoading(false);
    }
  }, [day]);

  useEffect(() => {
    void load();
  }, [load]);

  function Group({ title, rows }: { title: string; rows: R[] }) {
    return (
      <div className="card-ind p-4">
        <h2 className="font-heading text-2xl uppercase tracking-wide mb-3 border-b-4 border-ind-black pb-1">
          {title} <span className="font-mono text-base text-ind-steel">({rows.length})</span>
        </h2>
        {rows.length === 0 ? (
          <p className="font-mono text-sm text-ind-steel">None.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {rows.map((r) => (
              <li
                key={r.id}
                className="font-mono text-sm flex flex-wrap justify-between gap-2 border-b-2 border-ind-black/10 pb-2"
              >
                <span>
                  <strong>{r.product_name}</strong> · {r.customer_name}
                  {r.customer_phone ? ` · ${r.customer_phone}` : ''}
                  {r.fulfillment === 'delivery' && r.delivery_address
                    ? ` · 🚚 ${r.delivery_address}`
                    : ''}
                </span>
                <Link href={`/admin/rentals/${r.id}`} className="underline hover:text-ind-danger">
                  open
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-heading text-5xl uppercase tracking-wide">Dispatch</h1>
        <input
          type="date"
          className="input-ind"
          value={day}
          onChange={(e) => setDay(e.target.value)}
        />
      </div>
      {loading || !data ? (
        <p className="font-mono text-sm text-ind-steel">Loading…</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Group title="Pickups" rows={data.pickups} />
          <Group title="Returns" rows={data.returns} />
          <Group title="Deliveries" rows={data.deliveries} />
        </div>
      )}
    </section>
  );
}
