import { useCallback, useEffect, useState } from 'react';
import {
  anularMovimiento,
  createMovimiento,
  getFinanzasResumen,
  listCategorias,
  listMovimientos,
  setCategoriaActiva,
  updateMovimiento,
  upsertCategoria,
} from '../services/superadminFinanzasService';
import type {
  Categoria,
  CategoriaInput,
  DateRange,
  FinanzasResumen,
  Movimiento,
  MovimientoChanges,
  MovimientoInput,
} from '../services/superadminFinanzasService';
import { fechaNegocioHoy } from '../utils/periodoContable';

export const toFinanzasError = (err: unknown, fallback: string): string =>
  err instanceof Error && err.message ? err.message : fallback;

// First to last day of the current month, using the Asuncion calendar date.
export function currentMonthRange(now: Date = new Date()): DateRange {
  const today = fechaNegocioHoy(now);
  const [y, m] = today.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const mm = String(m).padStart(2, '0');
  return { desde: `${y}-${mm}-01`, hasta: `${y}-${mm}-${String(last).padStart(2, '0')}` };
}

export const isValidRange = (r: DateRange): boolean => !!r.desde && !!r.hasta && r.desde <= r.hasta;

export interface MutationResult {
  ok: boolean;
  message?: string;
}

export function useFinanzasPlataforma() {
  const [range, setRange] = useState<DateRange>(() => currentMonthRange());
  const [resumen, setResumen] = useState<FinanzasResumen | null>(null);
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!isValidRange(range)) {
      setError('El rango de fechas no es válido.');
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([getFinanzasResumen(range.desde, range.hasta), listMovimientos(range), listCategorias()])
      .then(([r, m, c]) => {
        if (cancelled) return;
        setResumen(r);
        setMovimientos(m);
        setCategorias(c);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(toFinanzasError(err, 'No se pudieron cargar las finanzas.'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [range, attempt]);

  const refetch = useCallback(() => setAttempt((n) => n + 1), []);

  // Runs a mutation, then refreshes. Errors are returned, not thrown.
  const mutate = useCallback(
    async (action: () => Promise<unknown>, fallback: string): Promise<MutationResult> => {
      setBusy(true);
      try {
        await action();
        refetch();
        return { ok: true };
      } catch (err) {
        return { ok: false, message: toFinanzasError(err, fallback) };
      } finally {
        setBusy(false);
      }
    },
    [refetch],
  );

  const create = useCallback(
    (input: MovimientoInput) => mutate(() => createMovimiento(input), 'No se pudo crear el movimiento.'),
    [mutate],
  );
  const update = useCallback(
    (id: string, changes: MovimientoChanges) =>
      mutate(() => updateMovimiento(id, changes), 'No se pudo actualizar el movimiento.'),
    [mutate],
  );
  const anular = useCallback(
    (id: string) => mutate(() => anularMovimiento(id), 'No se pudo anular el movimiento.'),
    [mutate],
  );
  const saveCategoria = useCallback(
    (input: CategoriaInput) => mutate(() => upsertCategoria(input), 'No se pudo guardar la categoría.'),
    [mutate],
  );
  const toggleCategoria = useCallback(
    (id: string, activo: boolean) =>
      mutate(() => setCategoriaActiva(id, activo), 'No se pudo actualizar la categoría.'),
    [mutate],
  );

  return {
    range,
    setRange,
    resumen,
    movimientos,
    categorias,
    loading,
    error,
    busy,
    refetch,
    create,
    update,
    anular,
    upsertCategoria: saveCategoria,
    setCategoriaActiva: toggleCategoria,
  };
}
