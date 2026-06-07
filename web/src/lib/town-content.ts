import type { Town } from '@/lib/api';

// Hand-written, town-specific angles so each landing page is genuinely unique
// (no near-duplicate thin content — M-003).
const TOWN_ANGLE: Record<string, string> = {
  'center-moriches':
    'Our yard is right here in Center Moriches, so same-day pickups and short-notice swaps are easy — no long haul to get iron on your site.',
  mastic:
    'From septic digs to driveway regrades, Mastic crews lean on our skid steers and mini excavator for tight residential lots.',
  'mastic-beach':
    'Flood-prone yards and waterfront builds in Mastic Beach mean grading and debris hauling — our dumpsters and loaders are built for it.',
  'east-moriches':
    'Landscapers and custom-home builders in East Moriches use our chipper and trailers for clean, fast brush and material handling.',
  manorville:
    'Bigger lots and acreage in Manorville call for serious earthmoving — reserve a skid steer or excavator by the day.',
  eastport:
    'Nursery rows, drainage, and hardscape prep in Eastport are a fit for our compact track loaders and tow-behind gear.',
  shirley:
    'Renovations and teardown cleanups across Shirley move faster with a roll-off dumpster dropped and a loader on site.',
  moriches:
    'Dock work, yard cleanouts, and small site prep in Moriches — grab the right machine without owning it.',
};

export type TownContent = {
  title: string;
  metaDescription: string;
  hero: string;
  intro: string;
  body: string[];
};

export function townContent(t: Town): TownContent {
  const angle =
    TOWN_ANGLE[t.slug] ??
    `Serving ${t.name} and the surrounding Moriches-area towns with reliable heavy equipment rentals.`;
  const dist =
    t.distance_from_yard_miles != null
      ? `${Number(t.distance_from_yard_miles).toFixed(0)} miles from our Center Moriches yard`
      : 'a short drive from our Center Moriches yard';

  return {
    title: `Equipment Rental in ${t.name}, NY | Eastern Rentals`,
    metaDescription: `Rent skid steers, a mini excavator, a wood chipper, trailers, and roll-off dumpsters in ${t.name}, NY. Online booking, delivery or pickup. ${dist}.`,
    hero: `Heavy Equipment Rental — ${t.name}, NY`,
    intro: angle,
    body: [
      `${t.name} contractors, landscapers, and homeowners can reserve heavy equipment online and pick it up — or have it delivered — usually the next day. We're ${dist}.`,
      `Available for ${t.name}: compact track (skid) steers, a mini excavator, a tow-behind wood chipper, a concrete mixer, equipment trailers, and 20-yard roll-off dumpsters. Pay a small booking fee online to lock your dates; the balance is due at pickup.`,
      `Delivery is available within 40 miles of Center Moriches (a flat $199 covers the first 10 miles). Not sure which machine fits the job in ${t.name}? Browse the fleet and the live availability calendar.`,
    ],
  };
}

export function localBusinessJsonLd(t: Town, baseUrl: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'EquipmentRentalAgency',
    name: 'Eastern Rentals',
    description: `Heavy equipment rentals serving ${t.name}, NY and the Moriches area.`,
    url: `${baseUrl}/rent/${t.slug}`,
    areaServed: { '@type': 'City', name: `${t.name}, NY` },
    address: {
      '@type': 'PostalAddress',
      addressLocality: 'Center Moriches',
      addressRegion: 'NY',
      postalCode: '11934',
      addressCountry: 'US',
    },
    ...(t.lat && t.lng
      ? { geo: { '@type': 'GeoCoordinates', latitude: t.lat, longitude: t.lng } }
      : {}),
  };
}
