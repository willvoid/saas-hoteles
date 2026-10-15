import type { LineaFactura } from '../types/factura';

/**
 * Motor de totales de una factura. Convención paraguaya: los precios YA incluyen
 * el IVA (IVA incluido). Por línea:
 *   - tasa 10 → aporta a total_gravado_10; IVA de la línea = subtotal / 11
 *   - tasa 5  → aporta a total_gravado_5;  IVA de la línea = subtotal / 21
 *   - tasa 0  → aporta a total_exenta;     IVA de la línea = 0
 *
 * El IVA total se suma después de redondear por línea para evitar deriva de
 * centésimos. No hay descuentos: el total general es la suma de los subtotales.
 *
 * Módulo puro (sin React/Supabase) para testearlo en entorno node.
 */

export interface LineaCalculada extends LineaFactura {
  /** cantidad * precioUnitario (IVA incluido). */
  subtotal: number;
  /** Tasa persistida en detalle_factura.iva_aplicado (10 | 5 | 0). */
  iva_aplicado: number;
  /** IVA contenido en el subtotal de la línea (redondeado). */
  ivaLinea: number;
}

export interface FacturaTotales {
  lineas: LineaCalculada[];
  total_gravado_10: number;
  total_gravado_5: number;
  total_exenta: number;
  total_iva: number;
  total_general: number;
}

/** IVA contenido en un monto IVA-incluido, según la tasa. */
export function ivaContenido(subtotal: number, rate: number): number {
  if (rate === 10) return Math.round(subtotal / 11);
  if (rate === 5) return Math.round(subtotal / 21);
  return 0;
}

/** Calcula totales de la factura a partir de las líneas. */
export function calcularTotales(lineas: LineaFactura[]): FacturaTotales {
  let total_gravado_10 = 0;
  let total_gravado_5 = 0;
  let total_exenta = 0;
  let total_iva = 0;

  const calculadas: LineaCalculada[] = lineas.map((l) => {
    const subtotal = l.cantidad * l.precioUnitario;
    const ivaLinea = ivaContenido(subtotal, l.ivaRate);

    if (l.ivaRate === 10) total_gravado_10 += subtotal;
    else if (l.ivaRate === 5) total_gravado_5 += subtotal;
    else total_exenta += subtotal;

    total_iva += ivaLinea;

    return { ...l, subtotal, iva_aplicado: l.ivaRate, ivaLinea };
  });

  const total_general = total_gravado_10 + total_gravado_5 + total_exenta;

  return {
    lineas: calculadas,
    total_gravado_10,
    total_gravado_5,
    total_exenta,
    total_iva,
    total_general,
  };
}

/** Vuelto a devolver: nunca negativo. */
export function calcularVuelto(efectivo: number, total: number): number {
  return Math.max(0, efectivo - total);
}
