import { useCallback, useEffect, useRef, useState } from 'react';

interface ReporteState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

// Generic loader for one report function (e.g. reporteFinanzasService.getCxc).
// `params` are serialized to decide when to reload, so an inline object does
// not loop; pass null to stay idle (e.g. until a fund is chosen). A response
// that arrives after the params changed (or after unmount) is ignored.
export function useReporteFinanzas<P, T>(
  cargar: (params: P) => Promise<T>,
  params: P | null,
): ReporteState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(params !== null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const cargarRef = useRef(cargar);
  cargarRef.current = cargar;
  const paramsRef = useRef(params);
  paramsRef.current = params;

  const clave = JSON.stringify(params);

  useEffect(() => {
    const actuales = paramsRef.current;
    if (actuales === null) {
      setData(null);
      setError(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    cargarRef.current(actuales)
      .then((rows) => {
        if (!cancelled) setData(rows);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setData(null);
          setError(err instanceof Error ? err.message : 'No se pudo cargar el reporte.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [clave, attempt]);

  const refetch = useCallback(() => setAttempt((n) => n + 1), []);

  return { data, loading, error, refetch };
}
