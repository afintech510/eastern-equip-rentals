import type { Config } from 'tailwindcss';

// Industrial / Heavy-Equipment theme — ported verbatim from the approved
// prototype (spec §4.5). Only the brand logo changes later; tokens, fonts,
// shadows, and motifs are LOCKED.
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Primary action color — runtime-swappable via the --ind-yellow CSS
        // variable (RGB channels so /opacity modifiers keep working). Default
        // is CAT / safety yellow; see [data-theme] overrides in globals.css.
        'ind-yellow': 'rgb(var(--ind-yellow) / <alpha-value>)',
        'ind-black': '#111111', // steel / asphalt — text, borders
        'ind-concrete': '#D1D5DB', // page background
        'ind-steel': '#6B7280', // secondary UI / labels
        'ind-danger': '#DC2626', // hazard / destructive
        'ind-white': '#F3F4F6', // card / sheet surface
      },
      fontFamily: {
        // Wired to the next/font CSS variables defined in src/lib/fonts.ts
        stencil: ['var(--font-stencil)', 'cursive'],
        heading: ['var(--font-heading)', 'sans-serif'],
        body: ['var(--font-body)', 'sans-serif'],
        mono: ['var(--font-mono)', 'monospace'],
      },
      boxShadow: {
        heavy: '6px 6px 0px 0px #111111',
        'heavy-sm': '3px 3px 0px 0px #111111',
        'heavy-active': '0px 0px 0px 0px #111111',
      },
      keyframes: {
        powerOn: {
          '0%': { opacity: '0', transform: 'scaleY(0.98)', filter: 'brightness(2)' },
          '100%': { opacity: '1', transform: 'scaleY(1)', filter: 'brightness(1)' },
        },
      },
      animation: {
        powerOn: 'powerOn 0.3s cubic-bezier(0, 0, 0.2, 1)',
      },
    },
  },
  plugins: [],
};

export default config;
