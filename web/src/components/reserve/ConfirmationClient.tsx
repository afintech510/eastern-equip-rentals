'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { getReservation, type ReservationGate } from '@/lib/api';
import { createClient } from '@/lib/supabase/client';

export default function ConfirmationClient({ rentalId }: { rentalId: string }) {
  const t = useTranslations('reserve');
  const locale = useLocale();
  const money = useMemo(
    () =>
      new Intl.NumberFormat(locale === 'es' ? 'es-US' : 'en-US', {
        style: 'currency',
        currency: 'USD',
      }),
    [locale],
  );
  const [gate, setGate] = useState<ReservationGate | null>(null);
  const [tries, setTries] = useState(0);

  // Poll a few times — the webhook flips status to "reserved" server-side just
  // after the redirect, so the first read may still show pending_fee.
  useEffect(() => {
    let active = true;
    async function load() {
      const { data } = await createClient().auth.getSession();
      const token = data.session?.access_token;
      if (!token) return;
      const g = await getReservation(token, rentalId);
      if (!active) return;
      setGate(g);
      if (g && g.status === 'pending_fee' && tries < 5) {
        setTimeout(() => setTries((n) => n + 1), 1500);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [rentalId, tries]);

  const confirmed = gate ? gate.status !== 'pending_fee' : false;

  const steps: { key: string; done: boolean }[] = gate
    ? [
        { key: 'stepPaid', done: gate.paid },
        { key: 'stepLicense', done: gate.license_ok },
        { key: 'stepContract', done: gate.contract_signed },
        { key: 'stepWaiver', done: gate.waiver_signed },
      ]
    : [];

  return (
    <section className="animate-powerOn flex flex-col gap-6 max-w-2xl mx-auto w-full">
      <div className="card-ind p-6">
        <div className="h-2 w-full hazard-stripes -mt-6 -mx-6 mb-4" aria-hidden="true" />
        <h1 className="font-heading text-5xl uppercase tracking-wide leading-none">
          {t('confirmTitle')}
        </h1>
        <p className="font-mono text-sm mt-3">
          {confirmed ? t('confirmReserved') : t('confirmPending')}
        </p>
        {gate?.product_name && (
          <p className="font-mono text-sm text-ind-steel mt-1">
            {gate.product_name} · {t('dates', { start: gate.start_date, end: gate.end_date })}
          </p>
        )}
      </div>

      {gate && (
        <div className="card-ind p-6">
          <h2 className="font-heading text-3xl uppercase tracking-wide mb-4">{t('whatsNext')}</h2>
          <ul className="flex flex-col gap-3">
            {steps.map((s) => (
              <li key={s.key} className="flex items-center gap-3 font-mono text-sm">
                <span
                  className={`w-5 h-5 border-2 border-ind-black flex items-center justify-center text-xs ${
                    s.done ? 'bg-ind-yellow' : 'hazard-stripes-light'
                  }`}
                  aria-hidden="true"
                >
                  {s.done ? '✓' : ''}
                </span>
                <span className={s.done ? 'line-through text-ind-steel' : ''}>{t(s.key)}</span>
              </li>
            ))}
          </ul>
          <p className="font-mono text-sm mt-4 border-t-2 border-ind-black/10 pt-3">
            {t('balanceLine', { amount: money.format(gate.balance_due) })}
          </p>
          <p className="font-mono text-[11px] text-ind-steel uppercase tracking-widest mt-2">
            {t('nextNote')}
          </p>
        </div>
      )}

      <Link href="/account" className="btn-secondary self-start">
        {t('goAccount')}
      </Link>
    </section>
  );
}
