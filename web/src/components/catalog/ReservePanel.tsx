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

  async function onRangeChange(range: { start: string; end: string } | null) {
    if (!range) {
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
      start_date: range.start,
      end_date: range.end,
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

  return (
    <div className="flex flex-col gap-4">
      <AvailabilityCalendar
        productId={productId}
        maxRentalDays={maxRentalDays}
        onRangeChange={onRangeChange}
      />
      <QuoteSummary quote={quote} error={error} loading={loading} hasRange={hasRange} />
    </div>
  );
}
