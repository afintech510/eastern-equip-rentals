'use client';

import { useCallback, useEffect, useState } from 'react';
import { adminFetch } from '@/lib/admin-api';
import { createClient } from '@/lib/supabase/client';
import type { Product } from '@/lib/api';

const PHOTO_BUCKET = 'product-photos';

type Unit = { id: string; label: string; serial_number: string | null; status: string };
type Rate = { id: string; min_days: number; rate_type: string; value: number };

const BLANK = {
  name: '',
  category: '',
  daily_rate: '0',
  booking_fee_mode: 'standard',
  requires_towing_ack: false,
  max_rental_days: '30',
  active: true,
};

export default function InventoryManager() {
  const [products, setProducts] = useState<Product[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ ...BLANK });
  const [expanded, setExpanded] = useState<string | null>(null);
  const [units, setUnits] = useState<Record<string, Unit[]>>({});
  const [rates, setRates] = useState<Record<string, Rate[]>>({});
  const [uploading, setUploading] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setProducts(await adminFetch<Product[]>('/products'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Load failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(fn: () => Promise<unknown>) {
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed');
    }
  }

  async function createProduct(e: React.FormEvent) {
    e.preventDefault();
    await run(async () => {
      await adminFetch('/products', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name,
          category: form.category,
          daily_rate: Number(form.daily_rate),
          booking_fee_mode: form.booking_fee_mode,
          requires_towing_ack: form.requires_towing_ack,
          max_rental_days: Number(form.max_rental_days),
          active: form.active,
        }),
      });
      setForm({ ...BLANK });
      await load();
    });
  }

  async function toggleActive(p: Product) {
    await run(async () => {
      await adminFetch(`/products/${p.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ active: !p.active }),
      });
      await load();
    });
  }

  async function deleteProduct(id: string) {
    await run(async () => {
      await adminFetch(`/products/${id}`, { method: 'DELETE' });
      await load();
    });
  }

  async function uploadPhoto(p: Product, file: File) {
    setError(null);
    setUploading(p.id);
    try {
      const supabase = createClient();
      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      const path = `${p.id}/${Date.now()}.${ext}`;
      const up = await supabase.storage
        .from(PHOTO_BUCKET)
        .upload(path, file, { upsert: true, contentType: file.type });
      if (up.error) throw up.error;
      const publicUrl = supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path).data.publicUrl;
      await adminFetch(`/products/${p.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ photo_url: publicUrl }),
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Photo upload failed');
    } finally {
      setUploading(null);
    }
  }

  async function expand(pid: string) {
    if (expanded === pid) {
      setExpanded(null);
      return;
    }
    setExpanded(pid);
    await run(async () => {
      const [u, r] = await Promise.all([
        adminFetch<Unit[]>(`/products/${pid}/units`),
        adminFetch<Rate[]>(`/products/${pid}/rates`),
      ]);
      setUnits((s) => ({ ...s, [pid]: u }));
      setRates((s) => ({ ...s, [pid]: r }));
    });
  }

  async function addUnit(pid: string, label: string, serial: string) {
    if (!label.trim()) return;
    await run(async () => {
      await adminFetch('/units', {
        method: 'POST',
        body: JSON.stringify({ product_id: pid, label, serial_number: serial || null }),
      });
      setUnits((s) => ({ ...s, [pid]: [] }));
      await expandReload(pid);
    });
  }

  async function setUnitStatus(pid: string, uid: string, status: string) {
    await run(async () => {
      await adminFetch(`/units/${uid}`, { method: 'PATCH', body: JSON.stringify({ status }) });
      await expandReload(pid);
    });
  }

  async function deleteUnit(pid: string, uid: string) {
    await run(async () => {
      await adminFetch(`/units/${uid}`, { method: 'DELETE' });
      await expandReload(pid);
    });
  }

  async function addRate(pid: string, minDays: string, rateType: string, value: string) {
    await run(async () => {
      await adminFetch('/rates', {
        method: 'POST',
        body: JSON.stringify({
          product_id: pid,
          min_days: Number(minDays),
          rate_type: rateType,
          value: Number(value),
        }),
      });
      await expandReload(pid);
    });
  }

  async function deleteRate(pid: string, rid: string) {
    await run(async () => {
      await adminFetch(`/rates/${rid}`, { method: 'DELETE' });
      await expandReload(pid);
    });
  }

  async function expandReload(pid: string) {
    const [u, r] = await Promise.all([
      adminFetch<Unit[]>(`/products/${pid}/units`),
      adminFetch<Rate[]>(`/products/${pid}/rates`),
    ]);
    setUnits((s) => ({ ...s, [pid]: u }));
    setRates((s) => ({ ...s, [pid]: r }));
  }

  return (
    <section className="flex flex-col gap-6">
      <h1 className="font-heading text-5xl uppercase tracking-wide">Inventory</h1>
      {error && (
        <p
          role="alert"
          className="font-mono text-sm bg-ind-danger text-ind-white p-3 border-4 border-ind-black"
        >
          {error}
        </p>
      )}

      {/* Create product */}
      <form onSubmit={createProduct} className="card-ind p-4 grid grid-cols-1 md:grid-cols-3 gap-3">
        <input
          className="input-ind"
          placeholder="Name"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          required
        />
        <input
          className="input-ind"
          placeholder="Category"
          value={form.category}
          onChange={(e) => setForm({ ...form, category: e.target.value })}
          required
        />
        <input
          className="input-ind"
          type="number"
          step="0.01"
          min="0"
          placeholder="Daily rate"
          value={form.daily_rate}
          onChange={(e) => setForm({ ...form, daily_rate: e.target.value })}
        />
        <select
          className="input-ind"
          value={form.booking_fee_mode}
          onChange={(e) => setForm({ ...form, booking_fee_mode: e.target.value })}
        >
          <option value="standard">standard</option>
          <option value="percent_down">percent_down</option>
        </select>
        <input
          className="input-ind"
          type="number"
          min="1"
          placeholder="Max days"
          value={form.max_rental_days}
          onChange={(e) => setForm({ ...form, max_rental_days: e.target.value })}
        />
        <label className="flex items-center gap-2 font-mono text-sm">
          <input
            type="checkbox"
            checked={form.requires_towing_ack}
            onChange={(e) => setForm({ ...form, requires_towing_ack: e.target.checked })}
          />
          Towable
        </label>
        <button type="submit" className="btn-primary md:col-span-3">
          Add Product
        </button>
      </form>

      {loading ? (
        <p className="font-mono text-sm text-ind-steel">Loading inventory…</p>
      ) : (
        <div className="flex flex-col gap-3">
          {products.map((p) => (
            <div key={p.id} className="card-ind p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  {/* Photo thumbnail + uploader (public product-photos bucket) */}
                  <label className="shrink-0 cursor-pointer group/photo" title="Upload / change photo">
                    <div className="w-20 h-16 bg-ind-concrete border-2 border-ind-black overflow-hidden flex items-center justify-center relative">
                      {p.photo_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={p.photo_url}
                          alt={p.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span className="hazard-stripes-light w-full h-full" aria-hidden="true" />
                      )}
                      <span className="absolute inset-0 flex items-center justify-center bg-ind-black/60 opacity-0 group-hover/photo:opacity-100 transition-opacity font-mono text-[9px] uppercase tracking-widest text-ind-yellow text-center">
                        {uploading === p.id ? 'Uploading…' : 'Change'}
                      </span>
                    </div>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={uploading === p.id}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void uploadPhoto(p, f);
                        e.target.value = '';
                      }}
                    />
                  </label>
                  <div>
                    <span className="font-mono text-[10px] uppercase tracking-widest text-ind-steel">
                      {p.category}
                    </span>
                    <h3 className="font-heading text-2xl uppercase tracking-wide leading-none">
                      {p.name}
                    </h3>
                    <span className="font-mono text-sm">
                      ${p.daily_rate.toFixed(2)}/day · {p.booking_fee_mode} · max{' '}
                      {p.max_rental_days}d{p.requires_towing_ack ? ' · towable' : ''}
                    </span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="btn-outline" onClick={() => toggleActive(p)}>
                    {p.active ? 'Active ✓' : 'Inactive'}
                  </button>
                  <button type="button" className="btn-outline" onClick={() => expand(p.id)}>
                    {expanded === p.id ? 'Hide' : 'Units & Rates'}
                  </button>
                  <button
                    type="button"
                    className="btn-outline border-ind-danger text-ind-danger"
                    onClick={() => deleteProduct(p.id)}
                  >
                    Delete
                  </button>
                </div>
              </div>

              {expanded === p.id && (
                <div className="mt-4 border-t-2 border-ind-black/10 pt-4 grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <UnitsPanel
                    units={units[p.id] ?? []}
                    onAdd={(l, s) => addUnit(p.id, l, s)}
                    onStatus={(uid, st) => setUnitStatus(p.id, uid, st)}
                    onDelete={(uid) => deleteUnit(p.id, uid)}
                  />
                  <RatesPanel
                    rates={rates[p.id] ?? []}
                    onAdd={(md, rt, v) => addRate(p.id, md, rt, v)}
                    onDelete={(rid) => deleteRate(p.id, rid)}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function UnitsPanel({
  units,
  onAdd,
  onStatus,
  onDelete,
}: {
  units: Unit[];
  onAdd: (label: string, serial: string) => void;
  onStatus: (uid: string, status: string) => void;
  onDelete: (uid: string) => void;
}) {
  const [label, setLabel] = useState('');
  const [serial, setSerial] = useState('');
  return (
    <div>
      <h4 className="font-heading text-xl uppercase tracking-wide mb-2">Units</h4>
      <ul className="flex flex-col gap-2 mb-3">
        {units.map((u) => (
          <li key={u.id} className="flex items-center justify-between gap-2 font-mono text-sm">
            <span>
              {u.label} {u.serial_number ? `(${u.serial_number})` : ''}
            </span>
            <span className="flex gap-2">
              <select
                className="border-2 border-ind-black bg-white px-1"
                value={u.status}
                onChange={(e) => onStatus(u.id, e.target.value)}
              >
                <option value="available">available</option>
                <option value="maintenance">maintenance</option>
                <option value="retired">retired</option>
              </select>
              <button
                type="button"
                className="text-ind-danger"
                onClick={() => onDelete(u.id)}
                aria-label={`Delete ${u.label}`}
              >
                ✕
              </button>
            </span>
          </li>
        ))}
        {units.length === 0 && <li className="font-mono text-xs text-ind-steel">No units.</li>}
      </ul>
      <div className="flex gap-2">
        <input
          className="input-ind flex-1"
          placeholder="Label"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
        <input
          className="input-ind flex-1"
          placeholder="Serial"
          value={serial}
          onChange={(e) => setSerial(e.target.value)}
        />
        <button
          type="button"
          className="btn-outline"
          onClick={() => {
            onAdd(label, serial);
            setLabel('');
            setSerial('');
          }}
        >
          Add
        </button>
      </div>
    </div>
  );
}

function RatesPanel({
  rates,
  onAdd,
  onDelete,
}: {
  rates: Rate[];
  onAdd: (minDays: string, rateType: string, value: string) => void;
  onDelete: (rid: string) => void;
}) {
  const [minDays, setMinDays] = useState('7');
  const [rateType, setRateType] = useState('percent_off');
  const [value, setValue] = useState('10');
  return (
    <div>
      <h4 className="font-heading text-xl uppercase tracking-wide mb-2">
        Rates <span className="font-mono text-[11px] text-ind-steel">(disabled at launch)</span>
      </h4>
      <ul className="flex flex-col gap-2 mb-3">
        {rates.map((r) => (
          <li key={r.id} className="flex items-center justify-between font-mono text-sm">
            <span>
              ≥{r.min_days}d · {r.rate_type} · {r.value}
            </span>
            <button type="button" className="text-ind-danger" onClick={() => onDelete(r.id)}>
              ✕
            </button>
          </li>
        ))}
        {rates.length === 0 && <li className="font-mono text-xs text-ind-steel">No rate tiers.</li>}
      </ul>
      <div className="flex gap-2">
        <input
          className="input-ind w-20"
          type="number"
          min="1"
          value={minDays}
          onChange={(e) => setMinDays(e.target.value)}
          aria-label="Min days"
        />
        <select
          className="input-ind"
          value={rateType}
          onChange={(e) => setRateType(e.target.value)}
        >
          <option value="percent_off">percent_off</option>
          <option value="flat_daily">flat_daily</option>
          <option value="weekly">weekly</option>
        </select>
        <input
          className="input-ind w-24"
          type="number"
          step="0.01"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-label="Value"
        />
        <button
          type="button"
          className="btn-outline"
          onClick={() => onAdd(minDays, rateType, value)}
        >
          Add
        </button>
      </div>
    </div>
  );
}
