import { describe, expect, it } from 'vitest';
import { buildMonthlyBars, monthLabel } from './monthlyBars';

describe('buildMonthlyBars', () => {
  it('returns no groups and a safe max for empty data', () => {
    const r = buildMonthlyBars([], 100);
    expect(r.groups).toEqual([]);
    expect(r.max).toBeGreaterThan(0);
  });

  it('scales to the largest value with zero heights for all-zero data', () => {
    const r = buildMonthlyBars([{ mes: '2026-03', ingresos: 0, egresos: 0 }], 100);
    expect(r.groups[0].ingresosHeight).toBe(0);
    expect(r.groups[0].egresosHeight).toBe(0);
    expect(Number.isFinite(r.max)).toBe(true);
  });

  it('gives the max value the full plot height and others proportionally', () => {
    const r = buildMonthlyBars(
      [
        { mes: '2026-01', ingresos: 1000, egresos: 500 },
        { mes: '2026-02', ingresos: 250, egresos: 0 },
      ],
      200,
    );
    expect(r.groups[0].ingresosHeight).toBe(200);
    expect(r.groups[0].egresosHeight).toBe(100);
    expect(r.groups[1].ingresosHeight).toBe(50);
    expect(r.groups[1].egresosHeight).toBe(0);
  });

  it('clamps negative values to zero height', () => {
    const r = buildMonthlyBars([{ mes: '2026-01', ingresos: -5, egresos: 10 }], 100);
    expect(r.groups[0].ingresosHeight).toBe(0);
  });
});

describe('monthLabel', () => {
  it('formats YYYY-MM and YYYY-MM-DD as short Spanish month', () => {
    expect(monthLabel('2026-03')).toBe('mar 26');
    expect(monthLabel('2026-12-01')).toBe('dic 26');
  });
  it('returns the input when unparseable', () => {
    expect(monthLabel('x')).toBe('x');
  });
});
