import Link from 'next/link';
import { useTranslations } from 'next-intl';

// Themed footer — industrial dispatch voice (§4.5 copy voice).
export default function Footer() {
  const t = useTranslations('footer');
  return (
    <footer className="bg-ind-black text-ind-white border-t-8 border-ind-yellow mt-12">
      <div className="h-2 w-full hazard-stripes" aria-hidden="true" />
      <div className="max-w-7xl mx-auto px-4 py-8 flex flex-col md:flex-row justify-between gap-4">
        <div>
          <p className="font-stencil text-2xl tracking-widest text-ind-yellow">EASTERN</p>
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-ind-steel mt-1">
            {t('tagline')}
          </p>
        </div>
        <nav className="flex gap-6 md:self-center" aria-label="Footer">
          <Link
            href="/equipment"
            className="font-heading uppercase tracking-wider hover:text-ind-yellow"
          >
            {t('inventory')}
          </Link>
          <Link
            href="/dumpsters"
            className="font-heading uppercase tracking-wider hover:text-ind-yellow"
          >
            {t('dumpsters')}
          </Link>
          <Link
            href="/rent"
            className="font-heading uppercase tracking-wider hover:text-ind-yellow"
          >
            {t('serviceAreas')}
          </Link>
        </nav>
        <p className="font-mono text-xs text-ind-steel self-end">
          &copy; {new Date().getFullYear()} {t('rights')}
        </p>
      </div>
    </footer>
  );
}
