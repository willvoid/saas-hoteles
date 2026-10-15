import { useCallback, useEffect, useMemo, useState } from 'react';
import { periodoService } from '../services/periodoService';
import { mensajeDeError } from '../utils/facturaCredito';
import { estaCerrado, etiquetaPeriodo, periodoDe } from '../utils/periodoContable';
import type { Periodo, PeriodoCerrado } from '../types/finanzas';

interface PeriodosCerrados {
  periodos: Periodo[];
  /** Full rows (who and when closed), for the closing panel. */
  registros: PeriodoCerrado[];
  /** Label of the closed month containing `fecha` ("Marzo 2026"), or null when it is open. */
  periodoCerradoDe: (fecha: string) => string | null;
  loading: boolean;
  /** Message of a failed load; forms ignore it, the closing panel shows it. */
  error: string | null;
  refetch: () => void;
}

/** Loads the locked months so forms can warn before the database refuses a
 *  write. A failed load leaves the list empty: the database still enforces the
 *  lock and its message is shown on submit. */
export function usePeriodosCerrados(): PeriodosCerrados {
  const [registros, setRegistros] = useState<PeriodoCerrado[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recarga, setRecarga] = useState(0);

  useEffect(() => {
    let cancelled = false;
    periodoService
      .getPeriodosCerrados()
      .then((rows) => {
        if (cancelled) return;
        setRegistros(rows);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setRegistros([]);
        setError(mensajeDeError(err, 'No se pudieron cargar los períodos cerrados.'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [recarga]);

  const periodos = useMemo(() => registros.map((r) => ({ anio: r.anio, mes: r.mes })), [registros]);

  const periodoCerradoDe = (fecha: string): string | null => {
    if (!fecha || !estaCerrado(periodos, fecha)) return null;
    const { anio, mes } = periodoDe(fecha);
    return etiquetaPeriodo(anio, mes);
  };

  const refetch = useCallback(() => setRecarga((n) => n + 1), []);

  return { periodos, registros, periodoCerradoDe, loading, error, refetch };
}
