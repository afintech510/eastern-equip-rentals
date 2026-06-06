import { Black_Ops_One, Teko, Saira, Share_Tech_Mono } from 'next/font/google';

// §4.5 typography — loaded via next/font (self-hosted, no CDN <link>) for
// production performance. Each exposes a CSS variable consumed by Tailwind's
// fontFamily tokens (tailwind.config.ts).

export const stencil = Black_Ops_One({
  weight: '400',
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-stencil',
});

export const heading = Teko({
  weight: ['500', '700'],
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-heading',
});

export const body = Saira({
  weight: ['400', '600', '700'],
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-body',
});

export const mono = Share_Tech_Mono({
  weight: '400',
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-mono',
});

// Convenience: every font variable, ready to spread onto <html>.
export const fontVariables = `${stencil.variable} ${heading.variable} ${body.variable} ${mono.variable}`;
