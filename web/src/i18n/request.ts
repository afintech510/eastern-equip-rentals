import { getRequestConfig } from 'next-intl/server';
import { cookies } from 'next/headers';

export const LOCALES = ['en', 'es'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'en';
export const LOCALE_COOKIE = 'NEXT_LOCALE';

// Cookie-based locale (no URL routing) — the sitewide toggle just sets a cookie.
export default getRequestConfig(async () => {
  const cookie = cookies().get(LOCALE_COOKIE)?.value;
  const locale: Locale = (LOCALES as readonly string[]).includes(cookie ?? '')
    ? (cookie as Locale)
    : DEFAULT_LOCALE;

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
