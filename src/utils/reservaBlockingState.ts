// Pure predicate for whether a `reservas.estado` value should block a room
// from being offered in the date-range availability picker. No
// React/Supabase imports — kept out of roomOccupancyService.ts on purpose:
// this module is exercised under `environment: 'node'`, and a
// `supabaseClient` import anywhere in the module graph would fight that.

/** States that block a room from appearing available for a date range. */
export const BLOCKING_RESERVA_STATES = ['pendiente', 'confirmada', 'check-in'];

/** Trims and lowercases; anything not a string normalizes to ''. */
export function normalizeEstado(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

/** Whether a normalized `estado` string is one of the blocking states. */
export function isBlockingEstado(value: unknown): boolean {
  return BLOCKING_RESERVA_STATES.includes(normalizeEstado(value));
}

/**
 * PostgREST embed row shape. The `reservas` embed comes back as either an
 * object or a single-element array depending on the query shape — the same
 * variance `getCleanStatus` in roomStatus.ts exists to handle.
 */
interface DetalleReservaRow {
  reservas: { estado?: unknown } | Array<{ estado?: unknown }> | null | undefined;
}

/**
 * Whether a `detalle_reservas` row (with its embedded `reservas`) has a
 * blocking estado. Normalizes case/whitespace client-side rather than
 * trusting the database literal, because an unpredicted casing (e.g. from a
 * web-origin RPC) must still block — the failure mode of getting this wrong
 * is overselling a room.
 */
export function rowHasBlockingEstado(row: DetalleReservaRow): boolean {
  const reserva = Array.isArray(row.reservas) ? row.reservas[0] : row.reservas;
  return isBlockingEstado(reserva?.estado);
}
