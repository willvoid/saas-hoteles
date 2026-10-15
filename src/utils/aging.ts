import type { BucketVencimiento } from '../types/finanzas';

/** Aging buckets in display order; same boundaries as fn_rep_cxc / fn_rep_cxp. */
export const BUCKETS_VENCIMIENTO: readonly BucketVencimiento[] = [
  'vigente',
  '1-30',
  '31-60',
  '61-90',
  '+90',
];

const MS_POR_DIA = 86_400_000;

/** 'YYYY-MM-DD' (or a timestamp starting with it) to a UTC day number. */
function aDiaUtc(fecha: string): number {
  const [y, m, d] = fecha.slice(0, 10).split('-').map(Number);
  return Date.UTC(y, m - 1, d) / MS_POR_DIA;
}

/** Days past due at the cutoff date; 0 while not yet due (or due today). */
export function diasVencido(vencimiento: string, corte: string): number {
  return Math.max(0, aDiaUtc(corte) - aDiaUtc(vencimiento));
}

/** vigente = 0 days; 1-30; 31-60; 61-90; +90 (91 and beyond). */
export function bucketVencimiento(dias: number): BucketVencimiento {
  if (dias <= 0) return 'vigente';
  if (dias <= 30) return '1-30';
  if (dias <= 60) return '31-60';
  if (dias <= 90) return '61-90';
  return '+90';
}

export interface GrupoAging<T> {
  bucket: BucketVencimiento;
  filas: T[];
  total: number;
}

/** Groups CxC/CxP rows by their bucket, summing `saldo_pendiente`. All five
 *  buckets are always returned, in order, so tables keep a stable shape. */
export function agruparPorBucket<T extends { bucket: BucketVencimiento; saldo_pendiente: number }>(
  filas: T[],
): { grupos: GrupoAging<T>[]; total: number } {
  const grupos: GrupoAging<T>[] = BUCKETS_VENCIMIENTO.map((bucket) => ({
    bucket,
    filas: [],
    total: 0,
  }));
  let total = 0;
  for (const fila of filas) {
    const grupo = grupos.find((g) => g.bucket === fila.bucket);
    if (!grupo) continue;
    grupo.filas.push(fila);
    grupo.total += fila.saldo_pendiente;
    total += fila.saldo_pendiente;
  }
  return { grupos, total };
}
