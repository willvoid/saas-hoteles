import { describe, it, expect } from 'vitest';
import { rangesOverlap } from './dateRange';

describe('rangesOverlap', () => {
  it('returns false for same-day turnover (A ends when B starts)', () => {
    // The load-bearing case: a guest checks out on the 10th, another checks
    // in on the 10th. The room turns over that morning — no conflict.
    expect(rangesOverlap('2026-08-05', '2026-08-10', '2026-08-10', '2026-08-15')).toBe(false);
  });

  it('returns false for same-day turnover in the other direction', () => {
    expect(rangesOverlap('2026-08-10', '2026-08-15', '2026-08-05', '2026-08-10')).toBe(false);
  });

  it('returns true when B is fully contained within A', () => {
    expect(rangesOverlap('2026-08-01', '2026-08-31', '2026-08-10', '2026-08-15')).toBe(true);
  });

  it('returns true when A is fully contained within B', () => {
    expect(rangesOverlap('2026-08-10', '2026-08-15', '2026-08-01', '2026-08-31')).toBe(true);
  });

  it('returns true for a partial head overlap', () => {
    expect(rangesOverlap('2026-08-01', '2026-08-10', '2026-08-05', '2026-08-15')).toBe(true);
  });

  it('returns true for a partial tail overlap', () => {
    expect(rangesOverlap('2026-08-05', '2026-08-15', '2026-08-01', '2026-08-10')).toBe(true);
  });

  it('returns true for identical ranges', () => {
    expect(rangesOverlap('2026-08-10', '2026-08-15', '2026-08-10', '2026-08-15')).toBe(true);
  });

  it('returns false for adjacent ranges (no gap, no shared night)', () => {
    expect(rangesOverlap('2026-08-01', '2026-08-05', '2026-08-05', '2026-08-10')).toBe(false);
  });

  it('returns false for a zero-night range against any other range', () => {
    expect(rangesOverlap('2026-08-10', '2026-08-10', '2026-08-05', '2026-08-15')).toBe(false);
  });
});
