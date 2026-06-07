'use client';

import { useCallback, useEffect, useState } from 'react';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { adminFetch } from '@/lib/admin-api';
import { getStripe } from '@/lib/stripe';

type Detail = {
  id: string;
  status: string;
  start_date: string;
  end_date: string;
  fulfillment: string;
  delivery_address: string | null;
  rental_subtotal: number;
  total: number;
  balance_amount: number;
  booking_fee_amount: number;
  deposit_amount: number;
  deposit_strategy: 'hold' | 'charge';
  gate: { paid: boolean; license_ok: boolean; contract_signed: boolean; waiver_signed: boolean };
  deposit_state: string;
  customer: { name: string; email: string; license_status: string };
  unit: { label: string; serial_number: string | null } | null;
  has_card_on_file: boolean;
};

const money = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);

export default function RentalPOS({ rentalId }: { rentalId: string }) {
  const [d, setD] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [balanceMethod, setBalanceMethod] = useState<'card_on_file' | 'cash' | 'other'>(
    'card_on_file',
  );
  const [showCard, setShowCard] = useState(false);
  const [capAmt, setCapAmt] = useState('');

  const load = useCallback(async () => {
    setError(null);
    try {
      const detail = await adminFetch<Detail>(`/rentals/${rentalId}`);
      setD(detail);
      setCapAmt(String(detail.deposit_amount));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Load failed');
    }
  }, [rentalId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setBusy(false);
    }
  }

  if (!d) {
    return <p className="font-mono text-sm text-ind-steel">{error ?? 'Loading…'}</p>;
  }

  const gateOk = d.gate.paid && d.gate.license_ok && d.gate.contract_signed && d.gate.waiver_signed;
  const canHandover = ['reserved', 'ready_for_pickup'].includes(d.status) && gateOk;
  const gateItems: [string, boolean][] = [
    ['Booking fee paid', d.gate.paid],
    ['License approved', d.gate.license_ok],
    ['Contract signed', d.gate.contract_signed],
    ['Waiver signed', d.gate.waiver_signed],
  ];

  return (
    <section className="flex flex-col gap-5 max-w-2xl">
      <div className="card-ind p-5">
        <div className="h-2 w-full hazard-stripes -mt-5 -mx-5 mb-4" aria-hidden="true" />
        <div className="flex flex-wrap justify-between gap-2">
          <h1 className="font-heading text-4xl uppercase tracking-wide leading-none">
            {d.unit?.label ?? 'Rental'}
          </h1>
          <span className="uppercase bg-ind-black text-ind-yellow px-2 py-1 text-xs font-mono self-start">
            {d.status.replace(/_/g, ' ')}
          </span>
        </div>
        <p className="font-mono text-sm mt-2">
          {d.customer.name} · {d.customer.email}
        </p>
        <p className="font-mono text-sm text-ind-steel">
          {d.start_date} → {d.end_date} ·{' '}
          {d.fulfillment === 'delivery' ? `Delivery: ${d.delivery_address}` : 'Pickup'}
          {d.unit?.serial_number ? ` · SN ${d.unit.serial_number}` : ''}
        </p>
        <div className="font-mono text-sm mt-3 border-t-2 border-ind-black/10 pt-3 flex flex-col gap-1">
          <Row label="Subtotal" value={money(d.rental_subtotal)} />
          <Row label="Total" value={money(d.total)} />
          <Row label="Balance due at pickup" value={money(d.balance_amount)} />
          <Row label={`Deposit (${d.deposit_strategy})`} value={money(d.deposit_amount)} />
          <Row label="Deposit state" value={d.deposit_state} />
        </div>
      </div>

      {error && (
        <p
          role="alert"
          className="font-mono text-sm bg-ind-danger text-ind-white p-3 border-4 border-ind-black"
        >
          {error}
        </p>
      )}

      {/* Release gate */}
      <div className="card-ind p-5">
        <h2 className="font-heading text-2xl uppercase tracking-wide mb-3">Release Gate</h2>
        <ul className="flex flex-col gap-2">
          {gateItems.map(([label, ok]) => (
            <li key={label} className="flex items-center gap-3 font-mono text-sm">
              <span
                className={`w-5 h-5 border-2 border-ind-black flex items-center justify-center text-xs ${ok ? 'bg-ind-yellow' : 'hazard-stripes-light'}`}
              >
                {ok ? '✓' : ''}
              </span>
              {label}
            </li>
          ))}
        </ul>
      </div>

      {/* Handover (pre-pickup) */}
      {['reserved', 'ready_for_pickup'].includes(d.status) && (
        <div className="card-ind p-5 flex flex-col gap-4">
          <h2 className="font-heading text-2xl uppercase tracking-wide">Handover · POS</h2>

          <div className="font-mono text-sm">
            Card on file:{' '}
            <strong className={d.has_card_on_file ? '' : 'text-ind-danger'}>
              {d.has_card_on_file ? 'yes' : 'none'}
            </strong>
            <button
              type="button"
              className="btn-outline ml-3"
              onClick={() => setShowCard((s) => !s)}
            >
              {showCard ? 'Cancel' : d.has_card_on_file ? 'Use different card' : 'Add card'}
            </button>
          </div>

          {showCard && (
            <CardSetup
              rentalId={rentalId}
              onDone={() => {
                setShowCard(false);
                void load();
              }}
            />
          )}

          <div>
            <span className="font-heading uppercase tracking-wide text-sm">Balance method</span>
            <div className="flex gap-2 mt-1">
              {(['card_on_file', 'cash', 'other'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setBalanceMethod(m)}
                  className={`btn-outline ${balanceMethod === m ? 'bg-ind-black text-ind-yellow border-ind-black' : ''}`}
                >
                  {m.replace(/_/g, ' ')}
                </button>
              ))}
            </div>
          </div>

          {!gateOk && (
            <p className="font-mono text-xs text-ind-danger uppercase">
              Gate not satisfied — cannot hand over.
            </p>
          )}
          {!d.has_card_on_file && (
            <p className="font-mono text-xs text-ind-danger uppercase">
              Add a card on file to place the deposit.
            </p>
          )}
          <button
            type="button"
            className="btn-primary disabled:opacity-50"
            disabled={busy || !canHandover || !d.has_card_on_file}
            onClick={() =>
              run(() =>
                adminFetch(`/rentals/${rentalId}/handover`, {
                  method: 'POST',
                  body: JSON.stringify({ balance_method: balanceMethod }),
                }),
              )
            }
          >
            {busy ? 'Processing…' : 'Complete Handover'}
          </button>
          <p className="font-mono text-[11px] text-ind-steel">
            Deposit {money(d.deposit_amount)} ({d.deposit_strategy}) on the card on file, then
            balance {money(d.balance_amount)} ({balanceMethod.replace(/_/g, ' ')}), then mark
            active.
          </p>
        </div>
      )}

      {/* Return */}
      {d.status === 'active' && (
        <div className="card-ind p-5 flex flex-col gap-3">
          <h2 className="font-heading text-2xl uppercase tracking-wide">Return</h2>
          <button
            type="button"
            className="btn-primary disabled:opacity-50"
            disabled={busy}
            onClick={() => run(() => adminFetch(`/rentals/${rentalId}/return`, { method: 'POST' }))}
          >
            Mark Returned
          </button>
        </div>
      )}

      {/* Deposit settlement */}
      {(d.status === 'returned' || d.status === 'closed') && (
        <div className="card-ind p-5 flex flex-col gap-3">
          <h2 className="font-heading text-2xl uppercase tracking-wide">Deposit Settlement</h2>
          <p className="font-mono text-sm">State: {d.deposit_state}</p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              className="input-ind w-32"
              value={capAmt}
              onChange={(e) => setCapAmt(e.target.value)}
              aria-label="Amount"
            />
            <button
              type="button"
              className="btn-outline"
              disabled={busy}
              onClick={() =>
                run(() =>
                  adminFetch(`/rentals/${rentalId}/deposit`, {
                    method: 'POST',
                    body: JSON.stringify({ action: 'capture', amount: Number(capAmt) }),
                  }),
                )
              }
            >
              Capture
            </button>
            <button
              type="button"
              className="btn-outline"
              disabled={busy}
              onClick={() =>
                run(() =>
                  adminFetch(`/rentals/${rentalId}/deposit`, {
                    method: 'POST',
                    body: JSON.stringify({ action: 'release' }),
                  }),
                )
              }
            >
              Release
            </button>
            <button
              type="button"
              className="btn-outline border-ind-danger text-ind-danger"
              disabled={busy}
              onClick={() =>
                run(() =>
                  adminFetch(`/rentals/${rentalId}/deposit`, {
                    method: 'POST',
                    body: JSON.stringify({ action: 'refund', amount: Number(capAmt) }),
                  }),
                )
              }
            >
              Refund
            </button>
          </div>
          <p className="font-mono text-[11px] text-ind-steel">
            Capture (full/partial) for damage, Release a hold, or Refund a charged deposit.
          </p>
        </div>
      )}
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span>{label}</span>
      <span className="whitespace-nowrap">{value}</span>
    </div>
  );
}

function CardSetup({ rentalId, onDone }: { rentalId: string; onDone: () => void }) {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    adminFetch<{ client_secret: string }>(`/rentals/${rentalId}/setup-card`, { method: 'POST' })
      .then((r) => setClientSecret(r.client_secret))
      .catch((e) => setErr(e instanceof Error ? e.message : 'Setup failed'));
  }, [rentalId]);

  if (err) return <p className="font-mono text-sm text-ind-danger">{err}</p>;
  if (!clientSecret) return <p className="font-mono text-sm text-ind-steel">Loading card form…</p>;
  return (
    <Elements
      stripe={getStripe()}
      options={{
        clientSecret,
        appearance: { theme: 'flat', variables: { colorPrimary: '#111111' } },
      }}
    >
      <SetupForm onDone={onDone} />
    </Elements>
  );
}

function SetupForm({ onDone }: { onDone: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setBusy(true);
    setMsg(null);
    const { error } = await stripe.confirmSetup({ elements, redirect: 'if_required' });
    setBusy(false);
    if (error) {
      setMsg(error.message ?? 'Card could not be saved');
      return;
    }
    onDone();
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-3 border-2 border-ind-black p-3">
      <PaymentElement />
      {msg && <p className="font-mono text-sm text-ind-danger">{msg}</p>}
      <button type="submit" className="btn-primary disabled:opacity-50" disabled={!stripe || busy}>
        {busy ? 'Saving…' : 'Save Card'}
      </button>
    </form>
  );
}
