import type { Metadata } from 'next';
import Script from 'next/script';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import './globals.css';
import { fontVariables } from '@/lib/fonts';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import MobileNav from '@/components/layout/MobileNav';

export const metadata: Metadata = {
  title: 'Eastern Pro Rentals — Heavy Equipment & Dumpster Rentals',
  description:
    'Reserve heavy equipment & dumpsters online. Earthmoving, landscaping, and pneumatic iron — dispatch ready.',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale} className={fontVariables}>
      {/* Apply the saved color theme before paint to avoid a flash (§4.5) */}
      <Script id="theme-init" strategy="beforeInteractive">
        {`try{var t=localStorage.getItem('er-theme');if(t){document.documentElement.setAttribute('data-theme',t)}}catch(e){}`}
      </Script>
      {/* pb-20 md:pb-0 reserves room for the mobile fixed bottom nav (§4.5) */}
      <body className="min-h-screen flex flex-col font-body pb-20 md:pb-0">
        <NextIntlClientProvider messages={messages}>
          <Header />
          <main className="flex-grow max-w-7xl mx-auto w-full px-4 py-8">{children}</main>
          <Footer />
          <MobileNav />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
