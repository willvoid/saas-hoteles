import { agruparPorBucket } from './aging';
import { formatGs } from './currency';
import { ETIQUETA_TIPO_FONDO } from './finanzasForm';
import { etiquetaPeriodo, periodoDe } from './periodoContable';
import type {
  FilaCxc,
  FilaCxp,
  FilaFlujoFondos,
  FilaLibroIva,
  FilaMovimientoFondo,
  FilaResultado,
} from '../types/finanzas';

// Pure helpers for the finance reports and summary: totals, KPIs and the
// table shapes shared by the screens and the PDF export. No React, no Supabase.

const suma = (valores: number[]): number => valores.reduce((s, v) => s + v, 0);

// ─── Totals and KPIs ─────────────────────────────────────────────────────────

export interface TotalesResultado {
  ingresos: number;
  egresos: number;
  /** ingresos - egresos; negative means a loss. */
  resultado: number;
}

export function totalesResultado(rows: FilaResultado[]): TotalesResultado {
  const ingresos = suma(rows.filter((r) => r.tipo === 'ingreso').map((r) => r.monto));
  const egresos = suma(rows.filter((r) => r.tipo === 'egreso').map((r) => r.monto));
  return { ingresos, egresos, resultado: ingresos - egresos };
}

type ColumnaIva = Exclude<keyof FilaLibroIva, 'mes'>;
export type TotalesLibroIva = Record<ColumnaIva, number>;

const COLUMNAS_IVA: ColumnaIva[] = [
  'base_ventas_10',
  'base_ventas_5',
  'base_ventas_exentas',
  'iva_debito',
  'compras_gravadas_10',
  'compras_gravadas_5',
  'compras_exentas',
  'iva_credito',
  'iva_a_pagar',
];

export function totalesLibroIva(rows: FilaLibroIva[]): TotalesLibroIva {
  const totales = {} as TotalesLibroIva;
  for (const col of COLUMNAS_IVA) totales[col] = suma(rows.map((r) => r[col]));
  return totales;
}

export function saldoTotalFondos(rows: FilaFlujoFondos[]): number {
  return suma(rows.map((r) => r.saldo_final));
}

interface ConVencimiento {
  saldo_pendiente: number;
  dias_vencido: number;
}

/** Sum of the balances that are already past due. */
export function vencidoTotal(rows: ConVencimiento[]): number {
  return suma(rows.filter((r) => r.dias_vencido > 0).map((r) => r.saldo_pendiente));
}

/** The `n` oldest overdue rows (most days past due first); never mutates. */
export function masVencidos<T extends ConVencimiento>(rows: T[], n: number): T[] {
  return rows
    .filter((r) => r.dias_vencido > 0)
    .sort((a, b) => b.dias_vencido - a.dias_vencido)
    .slice(0, n);
}

// ─── Table shapes (screen summary + PDF) ─────────────────────────────────────

export interface TablaReporte {
  titulo: string;
  /** Short lines printed above the table (totals, result). */
  resumen: string[];
  head: string[];
  body: string[][];
  foot?: string[];
  /** Landscape for wide tables. */
  orientacion?: 'p' | 'l';
}

const etiquetaMes = (mes: string): string => {
  const { anio, mes: m } = periodoDe(mes);
  return etiquetaPeriodo(anio, m);
};

export function tablaResultado(rows: FilaResultado[]): TablaReporte {
  const t = totalesResultado(rows);
  return {
    titulo: 'Ingresos vs egresos',
    resumen: [
      `Total ingresos: ${formatGs(t.ingresos)}`,
      `Total egresos: ${formatGs(t.egresos)}`,
      `Resultado (${t.resultado < 0 ? 'pérdida' : 'ganancia'}): ${formatGs(Math.abs(t.resultado))}`,
    ],
    head: ['Mes', 'Categoría', 'Tipo', 'Monto'],
    body: rows.map((r) => [
      etiquetaMes(r.mes),
      r.categoria,
      r.tipo === 'ingreso' ? 'Ingreso' : 'Egreso',
      formatGs(r.monto),
    ]),
  };
}

/** Receivable or payable aging, rows ordered by bucket as returned by the RPC. */
export function tablaAging(tipo: 'cxc' | 'cxp', rows: FilaCxc[] | FilaCxp[]): TablaReporte {
  const filas = rows.map((r) =>
    'cliente' in r
      ? { bucket: r.bucket, parte: r.cliente, doc: `Factura ${r.nro}`, venc: r.fecha_vencimiento, dias: r.dias_vencido, saldo: r.saldo_pendiente }
      : { bucket: r.bucket, parte: r.proveedor, doc: r.nro_comprobante ?? `Gasto ${r.id_gasto}`, venc: r.fecha_vencimiento, dias: r.dias_vencido, saldo: r.saldo_pendiente },
  );
  const { grupos, total } = agruparPorBucket(
    filas.map((f) => ({ ...f, saldo_pendiente: f.saldo })),
  );
  const body = grupos.flatMap((g) =>
    g.filas.map((f) => [g.bucket, f.parte, f.doc, f.venc, String(f.dias), formatGs(f.saldo)]),
  );
  return {
    titulo: tipo === 'cxc' ? 'Cuentas por cobrar' : 'Cuentas por pagar',
    resumen: grupos.map((g) => `${g.bucket}: ${formatGs(g.total)}`),
    head: ['Tramo', tipo === 'cxc' ? 'Cliente' : 'Proveedor', 'Comprobante', 'Vencimiento', 'Días vencido', 'Saldo'],
    body,
    foot: ['Total', '', '', '', '', formatGs(total)],
  };
}

export function tablaFlujoFondos(rows: FilaFlujoFondos[]): TablaReporte {
  return {
    titulo: 'Flujo de fondos',
    resumen: [`Saldo total: ${formatGs(saldoTotalFondos(rows))}`],
    head: ['Fondo', 'Tipo', 'Saldo inicial', 'Ingresos', 'Egresos', 'Saldo final'],
    body: rows.map((r) => [
      r.fondo,
      ETIQUETA_TIPO_FONDO[r.tipo],
      formatGs(r.saldo_inicial),
      formatGs(r.ingresos),
      formatGs(r.egresos),
      formatGs(r.saldo_final),
    ]),
    foot: [
      'Total',
      '',
      formatGs(suma(rows.map((r) => r.saldo_inicial))),
      formatGs(suma(rows.map((r) => r.ingresos))),
      formatGs(suma(rows.map((r) => r.egresos))),
      formatGs(saldoTotalFondos(rows)),
    ],
  };
}

export function tablaMovimientosFondo(fondo: string, rows: FilaMovimientoFondo[]): TablaReporte {
  return {
    titulo: `Movimientos de ${fondo}`,
    resumen: [],
    head: ['Fecha', 'Asiento', 'Descripción', 'Ingreso', 'Egreso', 'Saldo'],
    body: rows.map((r) => [
      r.fecha,
      String(r.nro_asiento),
      r.descripcion,
      r.debe ? formatGs(r.debe) : '-',
      r.haber ? formatGs(r.haber) : '-',
      formatGs(r.saldo_acumulado),
    ]),
  };
}

export function tablaLibroIva(anio: number, rows: FilaLibroIva[]): TablaReporte {
  const t = totalesLibroIva(rows);
  return {
    titulo: `Libro IVA ${anio}`,
    resumen: [`IVA a pagar del año: ${formatGs(t.iva_a_pagar)}`],
    head: [
      'Mes',
      'Ventas 10%',
      'Ventas 5%',
      'Ventas exentas',
      'IVA débito',
      'Compras 10%',
      'Compras 5%',
      'Compras exentas',
      'IVA crédito',
      'IVA a pagar',
    ],
    body: rows.map((r) => [
      etiquetaPeriodo(anio, r.mes),
      formatGs(r.base_ventas_10),
      formatGs(r.base_ventas_5),
      formatGs(r.base_ventas_exentas),
      formatGs(r.iva_debito),
      formatGs(r.compras_gravadas_10),
      formatGs(r.compras_gravadas_5),
      formatGs(r.compras_exentas),
      formatGs(r.iva_credito),
      formatGs(r.iva_a_pagar),
    ]),
    foot: [
      'Total',
      formatGs(t.base_ventas_10),
      formatGs(t.base_ventas_5),
      formatGs(t.base_ventas_exentas),
      formatGs(t.iva_debito),
      formatGs(t.compras_gravadas_10),
      formatGs(t.compras_gravadas_5),
      formatGs(t.compras_exentas),
      formatGs(t.iva_credito),
      formatGs(t.iva_a_pagar),
    ],
    orientacion: 'l',
  };
}
