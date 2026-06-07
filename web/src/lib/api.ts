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

export type Reservation = {
  rental_id: string;
  booking_fee_amount: number;
  card_service_fee: number;
  booking_fee_client_secret: string | null;
  hold_expires_at: string;
};

export type ReservationGate = {
  rental_id: string;
  status: string;
  paid: boolean;
  license_ok: boolean;
  contract_signed: boolean;
  waiver_signed: boolean;
  booking_fee_amount: number;
  balance_due: number;
  total: number;
  start_date: string;
  end_date: string;
  product_name: string | null;
};

// Authenticated calls — pass the Supabase access token.
export async function createReservation(
  token: string,
  body: {
    product_id: string;
    start_date: string;
    end_date: string;
    fulfillment?: 'pickup' | 'delivery';
    delivery_address?: string;
    towing_ack?: boolean;
  },
): Promise<{ reservation: Reservation } | { error: QuoteError }> {
  const res = await fetch(`${apiBase()}/api/v1/reservations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    cache: 'no-store',
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const detail = data?.detail ?? {};
    return {
      error: { code: detail.code ?? 'ERROR', message: detail.message ?? 'Reservation failed' },
    };
  }
  return { reservation: data as Reservation };
}

export async function getReservation(
  token: string,
  rentalId: string,
): Promise<ReservationGate | null> {
  const res = await fetch(`${apiBase()}/api/v1/reservations/${rentalId}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!res.ok) return null;
  return res.json() as Promise<ReservationGate>;
}

export type MeProfile = {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  license_status: 'none' | 'pending' | 'approved' | 'rejected';
  loyalty_tier: string;
};

export type MyRental = {
  id: string;
  status: string;
  start_date: string;
  end_date: string;
  total: number;
  booking_fee_amount: number;
  balance_amount: number;
  product_name: string | null;
};

export type DocItem = {
  doc_type: 'contract' | 'waiver';
  status: string;
  signing_url: string | null;
};

async function authJSON<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${apiBase()}/api/v1${path}`, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      Authorization: `Bearer ${token}`,
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
    },
    cache: 'no-store',
  });
  if (res.status === 204) return undefined as T;
  if (!res.ok) throw new Error(`API ${res.status} ${path}`);
  return res.json() as Promise<T>;
}

export const getMe = (token: string) => authJSON<MeProfile>(token, '/me');
export const updateMe = (token: string, patch: Record<string, unknown>) =>
  authJSON(token, '/me', { method: 'PATCH', body: JSON.stringify(patch) });
export const registerLicense = (token: string, storage_path: string) =>
  authJSON(token, '/license', { method: 'POST', body: JSON.stringify({ storage_path }) });
export const getMyRentals = (token: string) => authJSON<MyRental[]>(token, '/me/rentals');
export const getDocuments = (token: string, rentalId: string) =>
  authJSON<DocItem[]>(token, `/rentals/${rentalId}/documents`);

export function getAvailability(
  productId: string,
  start: string,
  end: string,
): Promise<Availability> {
  return getJSON<Availability>(`/products/${productId}/availability?start=${start}&end=${end}`, {
    cache: 'no-store',
  });
}
