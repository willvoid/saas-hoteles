import { describe, expect, it, vi } from 'vitest';

vi.mock('../services/supabaseClient', () => ({ supabase: {} }));

import { currentMonthRange, isValidRange, toFinanzasError } from './useFinanzasPlataforma';

describe('currentMonthRange', () => {
  it('spans the first to the last day of the month', () => {
    expect(currentMonthRange(new Date('2026-10-17T15:00:00Z'))).toEqual({ desde: '2026-10-01', hasta: '2026-10-31' });
  });

  it('handles leap-year February', () => {
    expect(currentMonthRange(new Date('2028-02-10T15:00:00Z'))).toEqual({ desde: '2028-02-01', hasta: '2028-02-29' });
  });

  it('uses the Asuncion date near a UTC month boundary', () => {
    // 2026-11-01T01:00Z is still Oct 31 in Asuncion (UTC-3/-4).
    expect(currentMonthRange(new Date('2026-11-01T01:00:00Z'))).toEqual({ desde: '2026-10-01', hasta: '2026-10-31' });
  });
});

describe('isValidRange', () => {
  it('accepts desde <= hasta', () => {
    expect(isValidRange({ desde: '2026-10-01', hasta: '2026-10-01' })).toBe(true);
  });
  it('rejects reversed or empty ranges', () => {
    expect(isValidRange({ desde: '2026-10-02', hasta: '2026-10-01' })).toBe(false);
    expect(isValidRange({ desde: '', hasta: '2026-10-01' })).toBe(false);
  });
});

describe('toFinanzasError', () => {
  it('uses the Error message', () => {
    expect(toFinanzasError(new Error('x'), 'fb')).toBe('x');
  });
  it('falls back for unknown values', () => {
    expect(toFinanzasError('nope', 'fb')).toBe('fb');
  });
});
