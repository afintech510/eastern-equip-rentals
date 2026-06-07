'use client';

import { useState } from 'react';
import AvailabilityCalendar from '@/components/catalog/AvailabilityCalendar';
import QuoteSummary from '@/components/catalog/QuoteSummary';
import { postQuote, type Quote, type QuoteError } from '@/lib/api';

// Calendar + live server-authoritative quote. Selecting a date range fetches a
// quote from /api/v1/quote (pickup). Reservation + payment land with Stripe.
export default function ReservePanel({
  productId,
  maxRentalDays,
}: {
  productId: string;
  maxRentalDays: number;
}) {
  const [quote, setQuote] = useState<Quote | null>(null);
  const [error, setError] = useState<QuoteError | null>(null);
  const [loading, setLoading] = useState(false);
  const [hasRange, setHasRange] = useState(false);
  const [range, setRange] = useState<{ start: string; end: string } | null>(null);

  async function onRangeChange(next: { start: string; end: string } | null) {
    setRange(next);
    if (!next) {
      setHasRange(false);
      setQuote(null);
      setError(null);
      return;
    }
    setHasRange(true);
    setLoading(true);
    setError(null);
    const result = await postQuote({
      product_id: productId,
      start_date: next.start,
      end_date: next.end,
      fulfillment: 'pickup',
    });
    setLoading(false);
    if ('error' in result) {
      setError(result.error);
      setQuote(null);
    } else {
      setQuote(result.quote);
    }
  }

  const reserveHref =
    range && quote?.available
      ? `/reserve/${productId}?start=${range.start}&end=${range.end}`
      : null;

  return (
    <div className="flex flex-col gap-4">
      <AvailabilityCalendar
        productId={productId}
        maxRentalDays={maxRentalDays}
        onRangeChange={onRangeChange}
      />
      <QuoteSummary
        quote={quote}
        error={error}
        loading={loading}
        hasRange={hasRange}
        reserveHref={reserveHref}
      />
    </div>
  );
}
