'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { adminFetch } from '@/lib/admin-api';

type License = {
  id: string;
  customer_name: string | null;
  customer_email: string | null;
  status: string;
  view_url: string | null;
  created_at: string;
};

export default function LicenseReview() {
  const t = useTranslations('adminlic');
  const [rows, setRows] = useState<License[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(await adminFetch<License[]>('/licenses?status=pending'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Load failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function decide(id: string, decision: 'approved' | 'rejected') {
    try {
      await adminFetch(`/licenses/${id}/decision`, {
        method: 'POST',
        body: JSON.stringify({ decision, reason: reasons[id] || null }),
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed');
    }
  }

  return (
    <section className="flex flex-col gap-4">
      <h1 className="font-heading text-5xl uppercase tracking-wide">{t('title')}</h1>
      {error && (
        <p
          role="alert"
          className="font-mono text-sm bg-ind-danger text-ind-white p-3 border-4 border-ind-black"
        >
          {error}
        </p>
      )}
      {loading ? (
        <p className="font-mono text-sm text-ind-steel">Loading…</p>
      ) : rows.length === 0 ? (
        <div className="card-ind p-8 text-center font-mono text-sm text-ind-steel">
          {t('empty')}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {rows.map((r) => (
            <div key={r.id} className="card-ind p-4 flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-mono text-sm">
                  <strong>{r.customer_name}</strong> · {r.customer_email}
                </div>
                {r.view_url && (
                  <a href={r.view_url} target="_blank" rel="noreferrer" className="btn-outline">
                    {t('view')}
                  </a>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  className="input-ind flex-1 min-w-[12rem]"
                  placeholder={t('reason')}
                  value={reasons[r.id] ?? ''}
                  onChange={(e) => setReasons((s) => ({ ...s, [r.id]: e.target.value }))}
                />
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => decide(r.id, 'approved')}
                >
                  {t('approve')}
                </button>
                <button
                  type="button"
                  className="btn-outline border-ind-danger text-ind-danger"
                  onClick={() => decide(r.id, 'rejected')}
                >
                  {t('reject')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
