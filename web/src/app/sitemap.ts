import type { MetadataRoute } from 'next';
import { getProducts, getTowns } from '@/lib/api';

const BASE = process.env.NEXT_PUBLIC_BASE_URL || 'https://rentals.benchworksai.com';

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticUrls: MetadataRoute.Sitemap = [
    { url: `${BASE}/`, changeFrequency: 'weekly', priority: 1 },
    { url: `${BASE}/equipment`, changeFrequency: 'daily', priority: 0.9 },
    { url: `${BASE}/rent`, changeFrequency: 'weekly', priority: 0.7 },
  ];

  try {
    const [products, towns] = await Promise.all([getProducts(), getTowns()]);
    for (const p of products) {
      staticUrls.push({
        url: `${BASE}/equipment/${p.id}`,
        changeFrequency: 'daily',
        priority: 0.8,
      });
    }
    for (const t of towns) {
      staticUrls.push({ url: `${BASE}/rent/${t.slug}`, changeFrequency: 'weekly', priority: 0.8 });
    }
  } catch {
    // API unreachable at build — return the static set.
  }
  return staticUrls;
}
