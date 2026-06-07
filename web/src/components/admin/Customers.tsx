'use client';

import { useCallback, useEffect, useState } from 'react';
import { adminFetch } from '@/lib/admin-api';

type Customer = {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  license_status: string;
  loyalty_tier: string;
};
type Detail = Customer & {
  transactional_sms: boolean;
  rentals: {
    id: string;
    status: string;
    start_date: string;
    end_date: string;
    product_name: string | null;
    total: number;
  }[];
  messages: { channel: string; template: string; status: string; created_at: string }[];
};

export default function Customers() {
  const [rows, setRows] = useState<Customer[]>([]);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<Detail | null>(null);

  const load = useCallback(async () => {
    setRows(await adminFetch<Customer[]>(`/customers${q ? `?q=${encodeURIComponent(q)}` : ''}`));
  }, [q]);

  useEffect(() => {
    void load();
  }, [load]);

  async function open(id: string) {
    setSel(await adminFetch<Detail>(`/customers/${id}`));
  }

  return (
    <section className="flex flex-col gap-4">
      <h1 className="font-heading text-5xl uppercase tracking-wide">Customers · CRM</h1>
      <input
        className="input-ind max-w-sm"
        placeholder="Search by name…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="flex flex-col gap-2">
          {rows.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => open(c.id)}
              className={`card-ind p-3 text-left font-mono text-sm ${sel?.id === c.id ? 'bg-ind-yellow' : ''}`}
            >
              <strong>{c.full_name}</strong> · {c.email}
              <span className="block text-ind-steel text-xs uppercase">
                license {c.license_status} · {c.loyalty_tier}
              </span>
            </button>
          ))}
          {rows.length === 0 && <p className="font-mono text-sm text-ind-steel">No customers.</p>}
        </div>

        {sel && (
          <div className="card-ind p-5 flex flex-col gap-3 h-fit">
            <h2 className="font-heading text-3xl uppercase tracking-wide">{sel.full_name}</h2>
            <p className="font-mono text-sm text-ind-steel">
              {sel.email} · {sel.phone ?? 'no phone'} · SMS {sel.transactional_sms ? 'on' : 'off'} ·
              license {sel.license_status}
            </p>
            <div>
              <h3 className="font-heading text-xl uppercase tracking-wide mt-2">Rentals</h3>
              <ul className="font-mono text-sm flex flex-col gap-1">
                {sel.rentals.map((r) => (
                  <li key={r.id}>
                    {r.product_name} · {r.start_date}→{r.end_date} · {r.status}
                  </li>
                ))}
                {sel.rentals.length === 0 && <li className="text-ind-steel">none</li>}
              </ul>
            </div>
            <div>
              <h3 className="font-heading text-xl uppercase tracking-wide mt-2">Message Log</h3>
              <ul className="font-mono text-xs flex flex-col gap-1">
                {sel.messages.map((m, i) => (
                  <li key={i}>
                    [{m.channel}] {m.template} — {m.status} · {m.created_at.slice(0, 10)}
                  </li>
                ))}
                {sel.messages.length === 0 && <li className="text-ind-steel">none</li>}
              </ul>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
