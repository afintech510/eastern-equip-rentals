'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const items = [
  { href: '/equipment', label: 'Inventory' },
  { href: '/account', label: 'Account' },
  { href: '/login', label: 'Login' },
];

// Mobile fixed bottom nav (paired with `pb-20 md:pb-0` on <body>, §4.5).
export default function MobileNav() {
  const pathname = usePathname();

  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-50 bg-ind-black border-t-8 border-ind-yellow"
      aria-label="Mobile"
    >
      <div className="h-1 w-full hazard-stripes" aria-hidden="true" />
      <ul className="flex justify-around">
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={`flex items-center justify-center py-4 font-heading text-xl uppercase tracking-wider transition-colors ${
                  active ? 'text-ind-yellow' : 'text-ind-white hover:text-ind-yellow'
                }`}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
