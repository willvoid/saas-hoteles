import { useCallback, useEffect, useState } from 'react';
import { reporteFinanzasService } from '../services/reporteFinanzasService';
import { inicioDeAnio, rangoMesActual } from '../utils/finanzasForm';
import { fechaNegocioHoy, periodoDe } from '../utils/periodoContable';
import {
  masVencidos,
  saldoTotalFondos,
  totalesResultado,
  vencidoTotal,
} from '../utils/reporteFinanzas';
import type { TotalesResultado } from '../utils/reporteFinanzas';
import type { FilaCxc, FilaCxp } from '../types/finanzas';

/** One KPI source: its value, or the error that prevented it. */
export interface Parcial<T> {
  data: T | null;
  error: string | null;
}

export interface Pendientes<T> {
  total: number;
  vencido: number;
  /** The oldest overdue rows (at most 5). */
  masVencidos: T[];
}

export interface ResumenFinanzas {
  resultado: Parcial<TotalesResultado>;
  saldoFondos: Parcial<number>;
  porCobrar: Parcial<Pendientes<FilaCxc>>;
  porPagar: Parcial<Pendientes<FilaCxp>>;
  ivaDelMes: Parcial<number>;
}

const VACIO: Parcial<never> = { data: null, error: null };
const SIN_DATOS: ResumenFinanzas = {
  resultado: VACIO,
  saldoFondos: VACIO,
  porCobrar: VACIO,
  porPagar: VACIO,
  ivaDelMes: VACIO,
};

const CANTIDAD_VENCIDOS = 5;

const mensaje = (razon: unknown): string =>
  razon instanceof Error ? razon.message : 'No se pudo cargar este dato.';

/** Turns a settled promise into a KPI source, mapping the value on success. */
function parcial<T, R>(r: PromiseSettledResult<T>, mapear: (valor: T) => R): Parcial<R> {
  return r.status === 'fulfilled'
    ? { data: mapear(r.value), error: null }
    : { data: null, error: mensaje(r.reason) };
}

function pendientes<T extends FilaCxc | FilaCxp>(rows: T[]): Pendientes<T> {
  return {
    total: rows.reduce((s, r) => s + r.saldo_pendiente, 0),
    vencido: vencidoTotal(rows),
    masVencidos: masVencidos(rows, CANTIDAD_VENCIDOS),
  };
}

/**
 * Loads every KPI of the finance summary in parallel. allSettled (not all) so
 * one failing report only blanks its own card instead of the whole panel.
 */
export function useResumenFinanzas(): ResumenFinanzas & { loading: boolean; refetch: () => void } {
  const [resumen, setResumen] = useState<ResumenFinanzas>(SIN_DATOS);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const hoy = fechaNegocioHoy();
    const mes = rangoMesActual(hoy);
    const { anio, mes: numeroMes } = periodoDe(hoy);

    Promise.allSettled([
      reporteFinanzasService.getResultado(mes.desde, mes.hasta),
      reporteFinanzasService.getFlujoFondos(inicioDeAnio(hoy), hoy),
      reporteFinanzasService.getCxc(hoy),
      reporteFinanzasService.getCxp(hoy),
      reporteFinanzasService.getLibroIva(anio),
    ]).then(([resultado, fondos, cxc, cxp, iva]) => {
      if (cancelled) return;
      setResumen({
        resultado: parcial(resultado, totalesResultado),
        saldoFondos: parcial(fondos, saldoTotalFondos),
        porCobrar: parcial(cxc, pendientes),
        porPagar: parcial(cxp, pendientes),
        ivaDelMes: parcial(iva, (rows) => rows.find((r) => r.mes === numeroMes)?.iva_a_pagar ?? 0),
      });
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [attempt]);

  // `loading` starts true; a manual reload raises it again here, not in the effect.
  const refetch = useCallback(() => {
    setLoading(true);
    setAttempt((n) => n + 1);
  }, []);

  return { ...resumen, loading, refetch };
}
