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
        <p className="font-mono text-xs text-ind-steel self-end">
          &copy; {new Date().getFullYear()} {t('rights')}
        </p>
      </div>
    </footer>
  );
}
