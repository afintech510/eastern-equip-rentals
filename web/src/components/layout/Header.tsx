import Link from 'next/link';
import { useTranslations } from 'next-intl';
import LanguageToggle from './LanguageToggle';

// Sticky black header with hazard top-edge, the keystone rotating gear (§4.5),
// the placeholder wordmark lockup, primary nav, and the "Yard: ONLINE" pill.
// Only the logo swaps later — the gear + type lockup are LOCKED.
export default function Header() {
  const t = useTranslations();
  return (
    <header className="bg-ind-black text-ind-yellow border-b-8 border-ind-yellow sticky top-0 z-50">
      {/* Hazard stripe top edge */}
      <div className="h-2 w-full hazard-stripes" aria-hidden="true" />

      <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
        <Link href="/" className="flex items-center gap-4" aria-label="Eastern Pro Rentals — home">
          {/* Industrial gear — decorative, keystone motif (10s linear spin) */}
          <svg
            width="40"
            height="40"
            viewBox="0 0 24 24"
            fill="currentColor"
            className="text-ind-yellow animate-[spin_10s_linear_infinite] shrink-0"
            aria-hidden="true"
          >
            <path d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.06-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61 l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41 h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.73,8.87 C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.84,11.36,4.8,11.69,4.8,12s0.02,0.64,0.06,0.94l-2.03,1.58 c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54 c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.43-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96 c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.49-0.12-0.61L19.14,12.94z M12,15.6c-1.98,0-3.6-1.62-3.6-3.6 s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z" />
          </svg>
          <span className="flex flex-col">
            {/* Placeholder wordmark — final logo asset pending (§7 SOW) */}
            <span className="font-stencil text-3xl md:text-4xl leading-none tracking-widest text-ind-yellow">
              EASTERN PRO
            </span>
            <span className="font-mono text-sm font-bold uppercase tracking-[0.2em] text-ind-white">
              {t('brand.tagline')}
            </span>
          </span>
        </Link>

        <nav className="hidden md:flex gap-8 items-center" aria-label="Primary">
          <Link
            href="/equipment"
            className="font-heading text-2xl uppercase tracking-wider text-ind-white hover:text-ind-yellow transition-colors"
          >
            {t('nav.inventory')}
          </Link>
          <Link
            href="/dumpsters"
            className="font-heading text-2xl uppercase tracking-wider text-ind-white hover:text-ind-yellow transition-colors"
          >
            {t('nav.dumpsters')}
          </Link>
          <Link
            href="/account"
            className="font-heading text-2xl uppercase tracking-wider text-ind-white hover:text-ind-yellow transition-colors"
          >
            {t('nav.activeJobs')}
          </Link>
          <span className="flex items-center gap-3 bg-ind-yellow text-ind-black px-4 py-1 border-2 border-ind-yellow">
            <span
              className="w-3 h-3 bg-ind-danger animate-pulse border border-ind-black"
              aria-hidden="true"
            />
            <span className="text-lg font-heading uppercase font-bold tracking-wide">
              {t('nav.yardOnline')}
            </span>
          </span>
          <LanguageToggle />
        </nav>

        {/* Mobile: language toggle (nav lives in the bottom bar) */}
        <div className="md:hidden">
          <LanguageToggle />
        </div>
      </div>
    </header>
  );
}
