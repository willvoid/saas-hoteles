import type { Periodo } from '../types/finanzas';

/** The business day is always Paraguay's, never the browser's or UTC's. */
const ZONA_NEGOCIO = 'America/Asuncion';

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

const formatoFecha = new Intl.DateTimeFormat('en-CA', {
  timeZone: ZONA_NEGOCIO,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Today's calendar date as 'YYYY-MM-DD' in America/Asuncion. `now` is
 *  injectable for tests. */
export function fechaNegocioHoy(now: Date = new Date()): string {
  const partes = formatoFecha.formatToParts(now);
  const valor = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? '';
  return `${valor('year')}-${valor('month')}-${valor('day')}`;
}

/** Year and month of an ISO date or timestamp (date part only). */
export function periodoDe(fecha: string): Periodo {
  const [anio, mes] = fecha.slice(0, 10).split('-').map(Number);
  return { anio, mes };
}

/** Whether the month containing `fecha` is locked. */
export function estaCerrado(periodos: Periodo[], fecha: string): boolean {
  const { anio, mes } = periodoDe(fecha);
  return periodos.some((p) => p.anio === anio && p.mes === mes);
}

/** True when the month starts after the current business month (cannot be
 *  closed yet; fn_cerrar_mes rejects it with 22023). */
export function esMesFuturo(anio: number, mes: number, now: Date = new Date()): boolean {
  const actual = periodoDe(fechaNegocioHoy(now));
  return anio > actual.anio || (anio === actual.anio && mes > actual.mes);
}

/** "Marzo 2026". */
export function etiquetaPeriodo(anio: number, mes: number): string {
  return `${MESES[mes - 1] ?? mes} ${anio}`;
}
