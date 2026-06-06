import type { Metadata } from 'next';
import './globals.css';
import { fontVariables } from '@/lib/fonts';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import MobileNav from '@/components/layout/MobileNav';

export const metadata: Metadata = {
  title: 'Eastern Rentals — Heavy Equipment Rentals',
  description:
    'Reserve heavy equipment online. Earthmoving, landscaping, and pneumatic iron — dispatch ready.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={fontVariables}>
      {/* pb-20 md:pb-0 reserves room for the mobile fixed bottom nav (§4.5) */}
      <body className="min-h-screen flex flex-col font-body pb-20 md:pb-0">
        <Header />
        <main className="flex-grow max-w-7xl mx-auto w-full px-4 py-8">{children}</main>
        <Footer />
        <MobileNav />
      </body>
    </html>
  );
}
