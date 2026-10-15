import { useEffect, useState } from 'react';
import { periodoService } from '../services/periodoService';
import { estaCerrado, etiquetaPeriodo, periodoDe } from '../utils/periodoContable';
import type { Periodo } from '../types/finanzas';

interface PeriodosCerrados {
  periodos: Periodo[];
  /** Label of the closed month containing `fecha` ("Marzo 2026"), or null when it is open. */
  periodoCerradoDe: (fecha: string) => string | null;
}

/** Loads the locked months once so forms can warn before the database refuses
 *  a write. A failed load leaves the list empty: the database still enforces
 *  the lock and its message is shown on submit. */
export function usePeriodosCerrados(): PeriodosCerrados {
  const [periodos, setPeriodos] = useState<Periodo[]>([]);

  useEffect(() => {
    let cancelled = false;
    periodoService
      .getPeriodosCerrados()
      .then((rows) => {
        if (!cancelled) setPeriodos(rows.map((r) => ({ anio: r.anio, mes: r.mes })));
      })
      .catch(() => {
        if (!cancelled) setPeriodos([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const periodoCerradoDe = (fecha: string): string | null => {
    if (!fecha || !estaCerrado(periodos, fecha)) return null;
    const { anio, mes } = periodoDe(fecha);
    return etiquetaPeriodo(anio, mes);
  };

  return { periodos, periodoCerradoDe };
}
