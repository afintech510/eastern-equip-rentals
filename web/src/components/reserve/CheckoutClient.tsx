'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { createReservation, postQuote, type Product, type Quote } from '@/lib/api';
import { createClient } from '@/lib/supabase/client';
import { getStripe } from '@/lib/stripe';

export default function CheckoutClient({
  product,
  start,
  end,
  fulfillment = 'pickup',
  deliveryAddress = '',
}: {
  product: Product;
  start: string;
  end: string;
  fulfillment?: 'pickup' | 'delivery';
  deliveryAddress?: string;
}) {
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

  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [towingAck, setTowingAck] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [rentalId, setRentalId] = useState<string | null>(null);
  const [charge, setCharge] = useState<{ fee: number; card: number } | null>(null);

  useEffect(() => {
    createClient()
      .auth.getSession()
      .then(({ data }) => setToken(data.session?.access_token ?? null));
    postQuote({
      product_id: product.id,
      start_date: start,
      end_date: end,
      fulfillment,
      ...(fulfillment === 'delivery' ? { delivery_address: deliveryAddress } : {}),
    }).then((r) => ('quote' in r ? setQuote(r.quote) : setError(r.error.message)));
  }, [product.id, start, end, fulfillment, deliveryAddress]);

  async function proceed() {
    setError(null);
    if (product.requires_towing_ack && !towingAck) {
      setError(t('towingRequired'));
      return;
    }
    if (!token) return;
    setCreating(true);
    const res = await createReservation(token, {
      product_id: product.id,
      start_date: start,
      end_date: end,
      fulfillment,
      ...(fulfillment === 'delivery' ? { delivery_address: deliveryAddress } : {}),
      towing_ack: towingAck,
    });
    setCreating(false);
    if ('error' in res) {
      setError(res.error.message);
      return;
    }
    setRentalId(res.reservation.rental_id);
    setCharge({ fee: res.reservation.booking_fee_amount, card: res.reservation.card_service_fee });
    setClientSecret(res.reservation.booking_fee_client_secret);
  }

  if (token === null) {
    return (
      <div className="card-ind p-6 flex flex-col gap-4 items-start">
        <div className="h-2 w-full hazard-stripes -mt-6 -mx-6 mb-2" aria-hidden="true" />
        <p className="font-mono">{t('loginRequired')}</p>
        <Link
          href={`/login?next=${encodeURIComponent(`/reserve/${product.id}?start=${start}&end=${end}&fulfillment=${fulfillment}${fulfillment === 'delivery' ? `&address=${encodeURIComponent(deliveryAddress)}` : ''}`)}`}
          className="btn-primary"
        >
          {t('logIn')}
        </Link>
      </div>
    );
  }

  const dueNow = charge ? charge.fee + charge.card : (quote?.booking_fee_amount ?? 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="card-ind p-5">
        <div className="h-2 w-full hazard-stripes -mt-5 -mx-5 mb-4" aria-hidden="true" />
        <h2 className="font-heading text-3xl uppercase tracking-wide">{t('summary')}</h2>
        <p className="font-mono text-sm text-ind-steel mt-1">{product.name}</p>
        <p className="font-mono text-sm">{t('dates', { start, end })}</p>
        <p className="font-mono text-sm text-ind-steel">
          {fulfillment === 'delivery'
            ? t('deliveryTo', { address: deliveryAddress })
            : t('pickupYard')}
        </p>

        {error && (
          <p
            role="alert"
            className="font-mono text-sm bg-ind-danger text-ind-white p-3 border-4 border-ind-black mt-3"
          >
            {error}
          </p>
        )}

        {quote && (
          <div className="font-mono text-sm flex flex-col gap-2 mt-4 border-t-2 border-ind-black/10 pt-3">
            {quote.delivery_fee > 0 && (
              <Row label={t('deliveryFee')} value={money.format(quote.delivery_fee)} />
            )}
            <Row label={t('bookingFee')} value={money.format(quote.booking_fee_amount)} />
            <Row
              label={t('cardFee')}
              value={money.format(quote.booking_fee_amount * quote.card_service_fee_pct)}
            />
            <div className="border-t-2 border-ind-black my-1" />
            <Row label={t('dueNow')} value={money.format(dueNow)} bold />
            <Row label={t('balanceAtPickup')} value={money.format(quote.balance_due)} />
          </div>
        )}
      </div>

      {!clientSecret ? (
        <div className="card-ind p-5 flex flex-col gap-4">
          {product.requires_towing_ack && (
            <label className="flex items-start gap-3 font-mono text-sm">
              <input
                type="checkbox"
                checked={towingAck}
                onChange={(e) => setTowingAck(e.target.checked)}
                className="mt-1 w-5 h-5"
              />
              <span>{t('towingAck')}</span>
            </label>
          )}
          <button
            type="button"
            className="btn-primary"
            onClick={proceed}
            disabled={creating || !quote}
          >
            {creating ? t('creating') : t('proceed')}
          </button>
        </div>
      ) : (
        <Elements
          stripe={getStripe()}
          options={{
            clientSecret,
            appearance: { theme: 'flat', variables: { colorPrimary: '#111111' } },
          }}
        >
          <PaymentForm rentalId={rentalId!} amountLabel={money.format(dueNow)} holdMinutes={15} />
        </Elements>
      )}
    </div>
  );
}

function PaymentForm({
  rentalId,
  amountLabel,
  holdMinutes,
}: {
  rentalId: string;
  amountLabel: string;
  holdMinutes: number;
}) {
  const t = useTranslations('reserve');
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setSubmitting(true);
    setMessage(null);
    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/reserve/confirmation/${rentalId}`,
      },
    });
    // If we get here, confirmation failed (otherwise the user is redirected).
    setSubmitting(false);
    setMessage(error?.message ?? t('payError'));
  }

  return (
    <form onSubmit={onSubmit} className="card-ind p-5 flex flex-col gap-4">
      <p className="font-mono text-[11px] text-ind-steel uppercase tracking-widest">
        {t('holdNote', { minutes: holdMinutes })}
      </p>
      <PaymentElement />
      {message && (
        <p
          role="alert"
          className="font-mono text-sm bg-ind-danger text-ind-white p-3 border-4 border-ind-black"
        >
          {message}
        </p>
      )}
      <button type="submit" className="btn-primary" disabled={!stripe || submitting}>
        {submitting ? t('paying') : t('payNow', { amount: amountLabel })}
      </button>
    </form>
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
