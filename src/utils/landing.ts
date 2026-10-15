import type { PublicPlan } from './plans';

// Builds a wa.me link from a raw phone value. Returns null when there is no
// usable number, so callers can hide the WhatsApp button instead of rendering
// a broken link.
export function buildWhatsAppUrl(rawNumber: string | undefined, message?: string): string | null {
  const digits = (rawNumber ?? '').replace(/\D/g, '');
  if (!digits) return null;
  const base = `https://wa.me/${digits}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}

// The "most popular" plan is the middle one (upper-middle for an even count).
// With a single plan there is nothing to compare against, so nothing is highlighted.
export function pickHighlightedPlan(plans: PublicPlan[]): string | null {
  if (plans.length < 2) return null;
  return plans[Math.floor(plans.length / 2)].codigo;
}
