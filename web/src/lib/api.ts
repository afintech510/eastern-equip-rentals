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

export function getAvailability(
  productId: string,
  start: string,
  end: string,
): Promise<Availability> {
  return getJSON<Availability>(`/products/${productId}/availability?start=${start}&end=${end}`, {
    cache: 'no-store',
  });
}
