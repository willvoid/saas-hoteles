import { describe, it, expect } from 'vitest';
import { calcularTotales, calcularVuelto } from './facturaTotals';
import type { LineaFactura } from '../types/factura';

const linea = (over: Partial<LineaFactura>): LineaFactura => ({
  fk_concepto: 1,
  descripcion: 'x',
  cantidad: 1,
  precioUnitario: 0,
  ivaRate: 10,
  ...over,
});

describe('calcularTotales', () => {
  it('computes a single 10% line (IVA included = subtotal / 11)', () => {
    const t = calcularTotales([linea({ precioUnitario: 110000, ivaRate: 10 })]);
    expect(t.total_gravado_10).toBe(110000);
    expect(t.total_gravado_5).toBe(0);
    expect(t.total_exenta).toBe(0);
    expect(t.total_iva).toBe(10000); // 110000 / 11
    expect(t.total_general).toBe(110000);
    expect(t.lineas[0].subtotal).toBe(110000);
    expect(t.lineas[0].iva_aplicado).toBe(10);
  });

  it('computes a single 5% line (IVA included = subtotal / 21)', () => {
    const t = calcularTotales([linea({ precioUnitario: 105000, ivaRate: 5 })]);
    expect(t.total_gravado_5).toBe(105000);
    expect(t.total_iva).toBe(5000); // 105000 / 21
    expect(t.total_general).toBe(105000);
  });

  it('treats rate 0 as exenta with no IVA', () => {
    const t = calcularTotales([linea({ precioUnitario: 50000, ivaRate: 0 })]);
    expect(t.total_exenta).toBe(50000);
    expect(t.total_iva).toBe(0);
    expect(t.total_general).toBe(50000);
  });

  it('aggregates a mixed invoice and sums per-line rounded IVA', () => {
    const t = calcularTotales([
      linea({ precioUnitario: 110000, ivaRate: 10 }),
      linea({ precioUnitario: 105000, ivaRate: 5 }),
      linea({ precioUnitario: 50000, ivaRate: 0 }),
    ]);
    expect(t.total_gravado_10).toBe(110000);
    expect(t.total_gravado_5).toBe(105000);
    expect(t.total_exenta).toBe(50000);
    expect(t.total_iva).toBe(15000);
    expect(t.total_general).toBe(265000);
  });

  it('multiplies by cantidad', () => {
    const t = calcularTotales([linea({ cantidad: 3, precioUnitario: 11000, ivaRate: 10 })]);
    expect(t.lineas[0].subtotal).toBe(33000);
    expect(t.total_iva).toBe(3000);
  });

  it('rounds IVA per line (edge case)', () => {
    // 100 / 11 = 9.09 → 9
    const t = calcularTotales([linea({ precioUnitario: 100, ivaRate: 10 })]);
    expect(t.total_iva).toBe(9);
  });

  it('total is the plain sum of subtotals (no discounts)', () => {
    const t = calcularTotales([
      linea({ precioUnitario: 110000, ivaRate: 10 }),
      linea({ precioUnitario: 50000, ivaRate: 0 }),
    ]);
    expect(t.total_general).toBe(160000);
  });

  it('handles an empty invoice', () => {
    const t = calcularTotales([]);
    expect(t.total_general).toBe(0);
    expect(t.total_iva).toBe(0);
    expect(t.lineas).toEqual([]);
  });
});

describe('calcularVuelto', () => {
  it('returns change when cash exceeds total', () => {
    expect(calcularVuelto(120000, 110000)).toBe(10000);
  });

  it('is zero when cash equals or is below total', () => {
    expect(calcularVuelto(110000, 110000)).toBe(0);
    expect(calcularVuelto(100000, 110000)).toBe(0);
  });
});
