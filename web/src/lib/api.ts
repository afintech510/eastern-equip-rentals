// API base helper. On the server (SSR / docker) prefer the internal URL so the
// web container can reach the api container by name; in the browser use the
// public URL (same-origin /api via nginx in prod, or localhost in dev).
export function apiBase(): string {
  if (typeof window === 'undefined') {
    return (
      process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8009'
    );
  }
  return process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8009';
}

export type Product = {
  id: string;
  name: string;
  category: string;
  description: string | null;
  photo_url: string | null;
  daily_rate: number;
  booking_fee_mode: 'standard' | 'percent_down';
  requires_towing_ack: boolean;
  max_rental_days: number;
  active: boolean;
};

export type Availability = { available: boolean; units_free: number };

export type CalendarDay = { date: string; available: boolean; units_free: number };
export type CalendarMonth = { month: string; total_units: number; days: CalendarDay[] };

async function getJSON<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${apiBase()}/api/v1${path}`, init);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`API ${res.status} ${path}: ${body.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

export function getProducts(category?: string): Promise<Product[]> {
  const q = category ? `?category=${encodeURIComponent(category)}` : '';
  // Catalog changes rarely; revalidate periodically.
  return getJSON<Product[]>(`/products${q}`, { next: { revalidate: 60 } });
}

export function getProduct(id: string): Promise<Product> {
  return getJSON<Product>(`/products/${id}`, { next: { revalidate: 60 } });
}

export function getCalendar(productId: string, month: string): Promise<CalendarMonth> {
  // Availability is live — never cache.
  return getJSON<CalendarMonth>(`/products/${productId}/calendar?month=${month}`, {
    cache: 'no-store',
  });
}

export type Quote = {
  rental_subtotal: number;
  discount_amount: number;
  delivery_fee: number;
  delivery_in_radius: boolean;
  tax_amount: number;
  total: number;
  booking_fee_amount: number;
  balance_due: number;
  card_service_fee_pct: number;
  deposit_amount: number;
  deposit_strategy: 'hold' | 'charge';
  requires_towing_ack: boolean;
  available: boolean;
  rental_days: number;
};

export type QuoteError = { code: string; message: string };

// Returns the quote, or a typed error (e.g. MAX_DURATION, DELIVERY_UNAVAILABLE).
export async function postQuote(body: {
  product_id: string;
  start_date: string;
  end_date: string;
  fulfillment?: 'pickup' | 'delivery';
  delivery_address?: string;
}): Promise<{ quote: Quote } | { error: QuoteError }> {
  const res = await fetch(`${apiBase()}/api/v1/quote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const detail = data?.detail ?? {};
    return { error: { code: detail.code ?? 'ERROR', message: detail.message ?? 'Quote failed' } };
  }
  return { quote: data as Quote };
}

export function getAvailability(
  productId: string,
  start: string,
  end: string,
): Promise<Availability> {
  return getJSON<Availability>(`/products/${productId}/availability?start=${start}&end=${end}`, {
    cache: 'no-store',
  });
}
