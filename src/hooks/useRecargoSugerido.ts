import { useEffect, useState } from 'react';
import { horarioService, type RecargoSugerido } from '../services/horarioService';
import type { TipoRecargo } from '../utils/recargoHorario';

interface EstadoRecargoSugerido {
  sugerido: RecargoSugerido | null;
  loading: boolean;
  error: string | null;
}

interface Resultado {
  clave: string;
  sugerido: RecargoSugerido | null;
  error: string | null;
}

/**
 * Asks the database for the late check-out / early check-in surcharge of a
 * reservation. Runs each time `activo` turns on (the dialog opens), so the
 * suggestion always reflects the current hour.
 */
export function useRecargoSugerido(
  idReserva: number | null,
  tipo: TipoRecargo | null,
  activo: boolean,
): EstadoRecargoSugerido {
  const [resultado, setResultado] = useState<Resultado | null>(null);

  const clave = activo && idReserva != null && tipo != null ? `${idReserva}:${tipo}` : null;

  useEffect(() => {
    if (clave === null || idReserva == null || tipo == null) return;
    let cancelled = false;
    horarioService
      .calcularRecargo(idReserva, tipo)
      .then((sugerido) => {
        if (!cancelled) setResultado({ clave, sugerido, error: null });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const error = err instanceof Error && err.message ? err.message : 'No se pudo calcular el recargo.';
        setResultado({ clave, sugerido: null, error });
      });
    return () => {
      cancelled = true;
      // Forget it on close so the next opening recalculates for the new hour.
      setResultado(null);
    };
  }, [clave, idReserva, tipo]);

  const vigente = clave !== null && resultado?.clave === clave ? resultado : null;
  return {
    sugerido: vigente?.sugerido ?? null,
    loading: clave !== null && vigente === null,
    error: vigente?.error ?? null,
  };
}
