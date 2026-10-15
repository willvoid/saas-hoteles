import { describe, expect, it } from 'vitest';
import { agruparPorBucket, bucketVencimiento, diasVencido } from './aging';

describe('bucketVencimiento', () => {
  it.each([
    [0, 'vigente'],
    [-5, 'vigente'],
    [1, '1-30'],
    [30, '1-30'],
    [31, '31-60'],
    [60, '31-60'],
    [61, '61-90'],
    [90, '61-90'],
    [91, '+90'],
    [400, '+90'],
  ])('%i days overdue -> %s', (dias, esperado) => {
    expect(bucketVencimiento(dias)).toBe(esperado);
  });
});

describe('diasVencido', () => {
  it('is the day difference between cutoff and due date', () => {
    expect(diasVencido('2026-03-01', '2026-03-31')).toBe(30);
    expect(diasVencido('2026-02-28', '2026-03-01')).toBe(1);
  });

  it('is 0 while not yet due or due today', () => {
    expect(diasVencido('2026-04-10', '2026-03-31')).toBe(0);
    expect(diasVencido('2026-03-31', '2026-03-31')).toBe(0);
  });

  it('is not skewed by month or year boundaries', () => {
    expect(diasVencido('2025-12-31', '2026-01-31')).toBe(31);
  });
});

describe('agruparPorBucket', () => {
  const filas = [
    { id: 1, bucket: 'vigente' as const, saldo_pendiente: 100 },
    { id: 2, bucket: '1-30' as const, saldo_pendiente: 50 },
    { id: 3, bucket: '1-30' as const, saldo_pendiente: 25 },
    { id: 4, bucket: '+90' as const, saldo_pendiente: 10 },
  ];

  it('always returns the five buckets in order, empty ones included', () => {
    const { grupos } = agruparPorBucket(filas);
    expect(grupos.map((g) => g.bucket)).toEqual(['vigente', '1-30', '31-60', '61-90', '+90']);
    expect(grupos[2]).toEqual({ bucket: '31-60', filas: [], total: 0 });
  });

  it('sums balances per bucket and overall', () => {
    const { grupos, total } = agruparPorBucket(filas);
    expect(grupos[1].total).toBe(75);
    expect(grupos[1].filas.map((f) => f.id)).toEqual([2, 3]);
    expect(total).toBe(185);
  });

  it('handles an empty list', () => {
    expect(agruparPorBucket([]).total).toBe(0);
  });
});
