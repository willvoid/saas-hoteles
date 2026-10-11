// Pure tarifa resolution shared by the admin and public booking flows.
// No React/Supabase/domain imports — keeps this module trivially testable.
//
// Dates are compared as 'YYYY-MM-DD' strings, never as `Date` objects.
// Lexicographic comparison on this format equals chronological comparison,
// which removes the timezone question entirely rather than defending
// against it (see dateRange.ts for the same convention). Do not "fix" this
// back to `new Date(...)` — that reintroduces the DST/negative-UTC-offset
// rollback this module was written to avoid.

/** Minimal shape `resolveTarifaForStay` needs. Real `Tarifa` rows satisfy this structurally. */
export interface TarifaCandidate {
  id: number;
  fk_tipo_habitacion: number;
  estado: string;
  fecha_inicio: string;
  fecha_fin: string | null;
}

const normalizeEstado = (estado: unknown): string =>
  typeof estado === 'string' ? estado.trim().toLowerCase() : '';

/**
 * Resolves the tarifa that applies to a stay starting on `fechaEntrada`,
 * for the given room type.
 *
 * Matching rules, in order:
 * 1. `fk_tipo_habitacion` must match `tipoHabitacionId`.
 * 2. `estado` normalized (trim + lowercase) must equal `'activa'`.
 * 3. `fecha_inicio <= fechaEntrada && (fecha_fin == null || fechaEntrada <= fecha_fin)`
 *    — both bounds inclusive.
 *
 * When more than one tarifa matches, the tie-break is: latest `fecha_inicio`
 * wins, then highest `id` — a seasonal tarifa opened later is treated as the
 * more specific override.
 *
 * Returns `null` when nothing matches. Returning `null` is the point:
 * callers MUST surface it (clear stale price/tarifa, show a warning), never
 * swallow it silently.
 */
export function resolveTarifaForStay<T extends TarifaCandidate>(
  tarifas: readonly T[],
  tipoHabitacionId: number,
  fechaEntrada: string
): T | null {
  const candidates = tarifas.filter(t => {
    if (t.fk_tipo_habitacion !== tipoHabitacionId) return false;
    if (normalizeEstado(t.estado) !== 'activa') return false;
    if (t.fecha_inicio > fechaEntrada) return false;
    if (t.fecha_fin != null && fechaEntrada > t.fecha_fin) return false;
    return true;
  });

  if (candidates.length === 0) return null;

  return candidates.reduce((best, current) => {
    if (current.fecha_inicio !== best.fecha_inicio) {
      return current.fecha_inicio > best.fecha_inicio ? current : best;
    }
    return current.id > best.id ? current : best;
  });
}
