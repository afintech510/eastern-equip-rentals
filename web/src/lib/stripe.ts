import { loadStripe, type Stripe } from '@stripe/stripe-js';

// Singleton Stripe.js loader (publishable key is baked at build time).
let promise: Promise<Stripe | null> | null = null;

export function getStripe(): Promise<Stripe | null> {
  if (!promise) {
    const pk = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    promise = pk ? loadStripe(pk) : Promise.resolve(null);
  }
  return promise;
}
