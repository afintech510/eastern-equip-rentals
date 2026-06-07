import type { MetadataRoute } from 'next';

const BASE = process.env.NEXT_PUBLIC_BASE_URL || 'https://rentals.benchworksai.com';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // Keep auth-gated and admin/checkout surfaces out of the index.
        disallow: [
          '/admin/',
          '/account',
          '/reserve/',
          '/auth/',
          '/login',
          '/register',
          '/reset-password',
          '/forgot-password',
        ],
      },
    ],
    sitemap: `${BASE}/sitemap.xml`,
  };
}
