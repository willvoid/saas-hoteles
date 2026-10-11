// Pin the test runner to a negative-UTC-offset zone that observes DST
// transitions historically (America/Asuncion) so the noon-anchor regression
// test below is meaningful regardless of the host machine's local timezone.
process.env.TZ = 'America/Asuncion';

import { describe, it, expect } from 'vitest';
import {
  calculateNights,
  calculateNightsForNewDetalle,
  calculateRoomSubtotal,
  calculateReservationTotal,
  deriveNightsFromSubtotal,
} from './pricing';

describe('calculateNights', () => {
  it('computes a normal multi-night range', () => {
    expect(calculateNights('2026-07-15', '2026-07-18')).toBe(3);
  });

  it('computes a single night', () => {
    expect(calculateNights('2026-07-15', '2026-07-16')).toBe(1);
  });

  it('returns 0 for a same-day range', () => {
    expect(calculateNights('2026-07-15', '2026-07-15')).toBe(0);
  });

  it('returns 0 for an inverted range, not a negative number', () => {
    expect(calculateNights('2026-07-18', '2026-07-15')).toBe(0);
  });

  it('returns 0 for unparseable input', () => {
    expect(calculateNights('not-a-date', '2026-07-15')).toBe(0);
    expect(calculateNights('2026-07-15', 'garbage')).toBe(0);
  });

  it('handles a month boundary', () => {
    expect(calculateNights('2026-07-30', '2026-08-02')).toBe(3);
  });

  it('handles a year boundary', () => {
    expect(calculateNights('2026-12-30', '2027-01-02')).toBe(3);
  });

  it('handles a span crossing a DST transition in a negative-UTC-offset zone', () => {
    // Paraguay historically ended DST in late March/early April.
    // A stay spanning that transition must still count whole nights,
    // which is exactly why the noon-anchor + Math.round idiom exists:
    // flooring here would silently lose a night.
    expect(calculateNights('2026-03-20', '2026-04-05')).toBe(16);
  });
});

describe('calculateNightsForNewDetalle', () => {
  it('uses the full reservation range when not in Check-in', () => {
    expect(calculateNightsForNewDetalle('2026-07-15', '2026-07-20', false, '2026-07-17')).toBe(5);
  });

  it('charges only the remaining nights when added mid-stay during Check-in', () => {
    // 5-night stay (07-15 -> 07-20), room added on day 3 (07-18): 2 nights left.
    expect(calculateNightsForNewDetalle('2026-07-15', '2026-07-20', true, '2026-07-18')).toBe(2);
  });

  it('matches the full range when added the same day as check-in', () => {
    expect(calculateNightsForNewDetalle('2026-07-15', '2026-07-20', true, '2026-07-15')).toBe(5);
  });

  it('returns 0 when added on the checkout date itself', () => {
    expect(calculateNightsForNewDetalle('2026-07-15', '2026-07-20', true, '2026-07-20')).toBe(0);
  });

  it('clamps to 0 when today is after the checkout date', () => {
    expect(calculateNightsForNewDetalle('2026-07-15', '2026-07-20', true, '2026-07-25')).toBe(0);
  });
});

describe('deriveNightsFromSubtotal', () => {
  it('recovers the full-range nights when the subtotal reflects them', () => {
    expect(deriveNightsFromSubtotal(600000, 200000)).toBe(3);
  });

  it('recovers partial nights charged for a room added mid-stay', () => {
    // Same unit price as the full-range case above, but only 2 nights were
    // ever charged (room added during Check-in, mid-stay).
    expect(deriveNightsFromSubtotal(400000, 200000)).toBe(2);
  });

  it('returns 0 when the unit price is 0', () => {
    expect(deriveNightsFromSubtotal(0, 0)).toBe(0);
  });

  it('returns 0 when the unit price is negative', () => {
    expect(deriveNightsFromSubtotal(600000, -200000)).toBe(0);
  });
});

describe('calculateRoomSubtotal', () => {
  it('multiplies price by nights', () => {
    expect(calculateRoomSubtotal(200000, 3)).toBe(600000);
  });

  it('returns 0 for zero nights', () => {
    expect(calculateRoomSubtotal(200000, 0)).toBe(0);
  });

  it('clamps a negative nights input to 0', () => {
    expect(calculateRoomSubtotal(200000, -1)).toBe(0);
  });
});

describe('calculateReservationTotal', () => {
  it('returns 0 for an empty array', () => {
    expect(calculateReservationTotal([])).toBe(0);
  });

  it('sums a single room', () => {
    expect(calculateReservationTotal([{ subtotal: 600000 }])).toBe(600000);
  });

  it('sums multiple rooms', () => {
    expect(calculateReservationTotal([{ subtotal: 600000 }, { subtotal: 450000 }])).toBe(1050000);
  });

  it('treats a null subtotal as 0', () => {
    expect(calculateReservationTotal([{ subtotal: 600000 }, { subtotal: null }])).toBe(600000);
  });
});
