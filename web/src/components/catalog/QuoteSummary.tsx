'use client';

import { useLocale, useTranslations } from 'next-intl';
import type { Quote, QuoteError } from '@/lib/api';

export default function QuoteSummary({
  quote,
  error,
  loading,
  hasRange,
}: {
  quote: Quote | null;
  error: QuoteError | null;
  loading: boolean;
  hasRange: boolean;
}) {
  const t = useTranslations('quote');
  const locale = useLocale();
  const money = (n: number) =>
    new Intl.NumberFormat(locale === 'es' ? 'es-US' : 'en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(n);

  return (
    <div className="card-ind p-5">
      <div className="h-2 w-full hazard-stripes -mt-5 -mx-5 mb-5" aria-hidden="true" />
      <h3 className="font-heading text-3xl uppercase tracking-wide mb-3">{t('title')}</h3>

      {!hasRange ? (
        <p className="font-mono text-sm text-ind-steel">{t('selectDates')}</p>
      ) : loading ? (
        <p className="font-mono text-sm text-ind-steel">{t('loading')}</p>
      ) : error ? (
        <p className="font-mono text-sm text-ind-danger">
          {error.code === 'MAX_DURATION' ? error.message : t('unavailable')}
        </p>
      ) : quote && !quote.available ? (
        <p className="font-mono text-sm text-ind-danger">{t('unavailable')}</p>
      ) : quote ? (
        <div className="font-mono text-sm flex flex-col gap-2">
          <Row
            label={`${t('subtotal')} · ${t('days', { days: quote.rental_days })}`}
            value={money(quote.rental_subtotal)}
          />
          <Row label={t('tax')} value={money(quote.tax_amount)} />
          <div className="border-t-2 border-ind-black my-1" />
          <Row label={t('total')} value={money(quote.total)} bold />
          <div className="bg-ind-yellow border-2 border-ind-black p-2 mt-2 flex flex-col gap-1">
            <Row label={t('bookingFee')} value={money(quote.booking_fee_amount)} bold />
            <p className="text-[11px] leading-tight">{t('bookingFeeNote')}</p>
          </div>
          <Row label={t('balanceDue')} value={money(quote.balance_due)} />
          <Row label={t('deposit')} value={money(quote.deposit_amount)} />
          <p className="text-[11px] text-ind-steel leading-tight">
            {t('depositNote', { strategy: quote.deposit_strategy })}
          </p>
          {quote.requires_towing_ack && (
            <p className="text-[11px] text-ind-danger font-bold uppercase leading-tight mt-1">
              {t('towingNote')}
            </p>
          )}

          <button
            type="button"
            className="btn-primary mt-3 disabled:opacity-50"
            disabled
            title={t('reserveNote')}
          >
            {t('reserveCta')}
          </button>
          <p className="text-[11px] text-ind-steel uppercase tracking-widest">{t('reserveNote')}</p>
        </div>
      ) : null}
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between gap-4 ${bold ? 'font-bold text-lg' : ''}`}>
      <span>{label}</span>
      <span className="whitespace-nowrap">{value}</span>
    </div>
  );
}
