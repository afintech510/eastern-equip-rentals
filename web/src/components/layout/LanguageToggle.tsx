'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

// Sitewide EN/ES swap. Sets the NEXT_LOCALE cookie and refreshes so server
// components re-render in the new locale (no URL change).
export default function LanguageToggle() {
  const t = useTranslations('lang');
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function setLocale(next: 'en' | 'es') {
    if (next === locale) return;
    document.cookie = `NEXT_LOCALE=${next}; path=/; max-age=31536000; samesite=lax`;
    startTransition(() => router.refresh());
  }

  return (
    <div
      className="flex items-center border-2 border-ind-yellow font-heading text-lg uppercase"
      role="group"
      aria-label={t('switchTo')}
    >
      {(['en', 'es'] as const).map((lng) => (
        <button
          key={lng}
          type="button"
          onClick={() => setLocale(lng)}
          disabled={pending}
          aria-pressed={locale === lng}
          className={`px-2 py-0.5 transition-colors ${
            locale === lng
              ? 'bg-ind-yellow text-ind-black'
              : 'text-ind-yellow hover:bg-ind-yellow/20'
          }`}
        >
          {t(lng)}
        </button>
      ))}
    </div>
  );
}
