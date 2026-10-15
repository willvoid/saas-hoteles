import { ivaContenido } from './facturaTotals';

/**
 * Totals of an expense. Amounts INCLUDE VAT, like invoices. Mirrors the
 * BEFORE INSERT trigger `tg_fn_gasto_antes` (migration 0019): iva_10 =
 * round(gravado_10 / 11), iva_5 = round(gravado_5 / 21), total = sum of the
 * three amounts. The database recomputes them, so this is only for previews.
 */
export interface GastoMontos {
  gravado_10: number;
  gravado_5: number;
  exenta: number;
}

export interface GastoTotales {
  iva_10: number;
  iva_5: number;
  total: number;
  /** total minus the contained VAT (what the posting debits to the category). */
  base_neta: number;
}

export function calcularTotalesGasto(montos: GastoMontos): GastoTotales {
  const iva_10 = ivaContenido(montos.gravado_10, 10);
  const iva_5 = ivaContenido(montos.gravado_5, 5);
  const total = montos.gravado_10 + montos.gravado_5 + montos.exenta;
  return { iva_10, iva_5, total, base_neta: total - iva_10 - iva_5 };
}
