// Pure date-range overlap math. No React/Supabase/domain imports — keeps
// this module trivially testable.
//
// Dates are compared as 'YYYY-MM-DD' strings, lexicographically, never as
// `Date` objects. Lexicographic order equals chronological order for this
// format, which removes the timezone question entirely rather than
// defending against it (see pricing.ts's noon-anchor idiom, which exists
// only because calculateNights does arithmetic — comparison needs none).
// Do not "fix" this back to `new Date(...)`.

/**
 * Whether date range [aStart, aEnd) overlaps date range [bStart, bEnd).
 *
 * Both ends are treated as half-open (exclusive checkout / exclusive end),
 * and the boundary is strict on both sides: `aStart < bEnd && aEnd > bStart`.
 * This means a same-day turnover — one stay's checkout equal to another
 * stay's check-in — does NOT count as an overlap. A `<=` comparison would
 * refuse every legitimate back-to-back booking.
 */
export function rangesOverlap(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string
): boolean {
  return aStart < aEnd && bStart < bEnd && aStart < bEnd && aEnd > bStart;
}
