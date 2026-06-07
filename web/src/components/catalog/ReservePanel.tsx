'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import AvailabilityCalendar from '@/components/catalog/AvailabilityCalendar';
import QuoteSummary from '@/components/catalog/QuoteSummary';
import { postQuote, type Quote, type QuoteError } from '@/lib/api';

type Fulfillment = 'pickup' | 'delivery';

// Calendar + fulfillment (pickup/delivery) + live server-authoritative quote.
export default function ReservePanel({
  productId,
  maxRentalDays,
}: {
  productId: string;
  maxRentalDays: number;
}) {
  const t = useTranslations('quote');
  const [quote, setQuote] = useState<Quote | null>(null);
  const [error, setError] = useState<QuoteError | null>(null);
  const [loading, setLoading] = useState(false);
  const [range, setRange] = useState<{ start: string; end: string } | null>(null);
  const [fulfillment, setFulfillment] = useState<Fulfillment>('pickup');
  const [address, setAddress] = useState('');

  async function runQuote(r: { start: string; end: string } | null, f: Fulfillment, addr: string) {
    if (!r) {
      setQuote(null);
      setError(null);
      return;
    }
    if (f === 'delivery' && !addr.trim()) {
      // Need an address before we can price delivery.
      setQuote(null);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    const result = await postQuote({
      product_id: productId,
      start_date: r.start,
      end_date: r.end,
      fulfillment: f,
      ...(f === 'delivery' ? { delivery_address: addr } : {}),
    });
    setLoading(false);
    if ('error' in result) {
      setError(result.error);
      setQuote(null);
    } else {
      setQuote(result.quote);
    }
  }

  function onRangeChange(next: { start: string; end: string } | null) {
    setRange(next);
    void runQuote(next, fulfillment, address);
  }

  function chooseFulfillment(f: Fulfillment) {
    setFulfillment(f);
    void runQuote(range, f, address);
  }

  const reserveHref =
    range && quote?.available
      ? `/reserve/${productId}?start=${range.start}&end=${range.end}&fulfillment=${fulfillment}` +
        (fulfillment === 'delivery' ? `&address=${encodeURIComponent(address)}` : '')
      : null;

  return (
    <div className="flex flex-col gap-4">
      {/* Fulfillment */}
      <div className="card-ind p-4 flex flex-col gap-3">
        <span className="font-heading text-xl uppercase tracking-wide">{t('fulfillment')}</span>
        <div className="flex gap-2">
          {(['pickup', 'delivery'] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => chooseFulfillment(f)}
              aria-pressed={fulfillment === f}
              className={`btn-outline flex-1 ${fulfillment === f ? 'bg-ind-black text-ind-yellow border-ind-black' : ''}`}
            >
              {t(f)}
            </button>
          ))}
        </div>
        {fulfillment === 'delivery' && (
          <div className="flex flex-col gap-2">
            <input
              className="input-ind"
              placeholder={t('address')}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              onBlur={() => runQuote(range, fulfillment, address)}
            />
            {range && !address.trim() && (
              <p className="font-mono text-xs text-ind-steel">{t('enterAddress')}</p>
            )}
          </div>
        )}
      </div>

      <AvailabilityCalendar
        productId={productId}
        maxRentalDays={maxRentalDays}
        onRangeChange={onRangeChange}
      />
      <QuoteSummary
        quote={quote}
        error={error}
        loading={loading}
        hasRange={!!range}
        reserveHref={reserveHref}
      />
    </div>
  );
}
