import type { SerieMensualItem } from '../services/superadminFinanzasService';

export interface BarGroup {
  mes: string;
  label: string;
  ingresos: number;
  egresos: number;
  ingresosHeight: number;
  egresosHeight: number;
}

export interface MonthlyBars {
  groups: BarGroup[];
  /** Value mapped to the full plot height (never 0). */
  max: number;
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** '2026-03' or '2026-03-01' to 'mar 26'; unparseable input is returned as is. */
export function monthLabel(mes: string): string {
  const m = /^(\d{4})-(\d{2})/.exec(mes);
  if (!m) return mes;
  const idx = Number(m[2]) - 1;
  if (idx < 0 || idx > 11) return mes;
  return `${MESES[idx]} ${m[1].slice(2)}`;
}

/** Maps the monthly series to bar heights in [0, plotHeight]. */
export function buildMonthlyBars(serie: SerieMensualItem[], plotHeight: number): MonthlyBars {
  const peak = serie.reduce((acc, s) => Math.max(acc, s.ingresos, s.egresos), 0);
  const max = peak > 0 ? peak : 1;
  const h = (v: number) => (v > 0 ? (v / max) * plotHeight : 0);
  return {
    max,
    groups: serie.map((s) => ({
      mes: s.mes,
      label: monthLabel(s.mes),
      ingresos: s.ingresos,
      egresos: s.egresos,
      ingresosHeight: h(s.ingresos),
      egresosHeight: h(s.egresos),
    })),
  };
}
