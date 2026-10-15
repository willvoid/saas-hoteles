import { describe, expect, it } from 'vitest';
import { calcularTotalesGasto } from './gastoTotals';
import { ivaContenido } from './facturaTotals';

describe('calcularTotalesGasto', () => {
  it('splits VAT out of VAT-inclusive amounts (10% over 11, 5% over 21)', () => {
    const t = calcularTotalesGasto({ gravado_10: 110000, gravado_5: 21000, exenta: 5000 });
    expect(t.iva_10).toBe(10000);
    expect(t.iva_5).toBe(1000);
    expect(t.total).toBe(136000);
    expect(t.base_neta).toBe(125000);
  });

  it('rounds each VAT amount separately like the DB trigger', () => {
    // 100000 / 11 = 9090.909 -> 9091 ; 10000 / 21 = 476.19 -> 476
    const t = calcularTotalesGasto({ gravado_10: 100000, gravado_5: 10000, exenta: 0 });
    expect(t.iva_10).toBe(9091);
    expect(t.iva_5).toBe(476);
    expect(t.base_neta).toBe(110000 - 9091 - 476);
  });

  it('rounds half up like Postgres round() on positive numerics', () => {
    // 5.5 / 11 = 0.5 -> 1 ; 10.5 / 21 = 0.5 -> 1
    const t = calcularTotalesGasto({ gravado_10: 5.5, gravado_5: 10.5, exenta: 0 });
    expect(t.iva_10).toBe(1);
    expect(t.iva_5).toBe(1);
  });

  it('exempt-only expenses carry no VAT', () => {
    const t = calcularTotalesGasto({ gravado_10: 0, gravado_5: 0, exenta: 80000 });
    expect(t).toEqual({ iva_10: 0, iva_5: 0, total: 80000, base_neta: 80000 });
  });

  it('empty input totals zero', () => {
    expect(calcularTotalesGasto({ gravado_10: 0, gravado_5: 0, exenta: 0 }).total).toBe(0);
  });

  it('reuses the invoice VAT formula', () => {
    expect(calcularTotalesGasto({ gravado_10: 33333, gravado_5: 0, exenta: 0 }).iva_10).toBe(
      ivaContenido(33333, 10),
    );
    expect(ivaContenido(21000, 5)).toBe(1000);
    expect(ivaContenido(5000, 0)).toBe(0);
  });
});
