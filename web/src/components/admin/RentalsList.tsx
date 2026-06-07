'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { adminFetch } from '@/lib/admin-api';

type Row = {
  id: string;
  status: string;
  start_date: string;
  end_date: string;
  customer_name: string | null;
  product_name: string | null;
  total: number;
  balance_amount: number;
};

const FILTERS = ['', 'ready_for_pickup', 'reserved', 'active', 'returned', 'pending_fee'];

export default function RentalsList() {
  const [rows, setRows] = useState<Row[]>([]);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await adminFetch<Row[]>(`/rentals${status ? `?status=${status}` : ''}`));
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="flex flex-col gap-4">
      <h1 className="font-heading text-5xl uppercase tracking-wide">Rentals · Dispatch</h1>
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f || 'all'}
            type="button"
            onClick={() => setStatus(f)}
            className={`btn-outline ${status === f ? 'bg-ind-black text-ind-yellow border-ind-black' : ''}`}
          >
            {f ? f.replace(/_/g, ' ') : 'all'}
          </button>
        ))}
      </div>
      {loading ? (
        <p className="font-mono text-sm text-ind-steel">Loading…</p>
      ) : rows.length === 0 ? (
        <div className="card-ind p-8 text-center font-mono text-sm text-ind-steel">No rentals.</div>
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map((r) => (
            <Link
              key={r.id}
              href={`/admin/rentals/${r.id}`}
              className="card-ind p-4 flex flex-wrap items-center justify-between gap-2 hover:shadow-heavy-sm hover:translate-x-[3px] hover:translate-y-[3px] transition-all font-mono text-sm"
            >
              <span>
                <strong>{r.product_name}</strong> · {r.customer_name}
              </span>
              <span className="text-ind-steel">
                {r.start_date} → {r.end_date}
              </span>
              <span className="uppercase bg-ind-black text-ind-yellow px-2 py-1 text-xs">
                {r.status.replace(/_/g, ' ')}
              </span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
