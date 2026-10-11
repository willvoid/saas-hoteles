// Pure pricing math shared by the admin and public booking flows.
// No React/Supabase/domain imports — keeps this module trivially testable.

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Computes the number of nights between two `YYYY-MM-DD` dates.
 *
 * Anchors both dates at noon (`T12:00:00`) rather than midnight, matching the
 * existing convention used elsewhere in the app (see ReservationDetail.tsx).
 * This avoids the DST/negative-UTC-offset rollback that makes a bare
 * `new Date('YYYY-MM-DD')` land a day early in zones like America/Asunción.
 *
 * Because the noon anchor can put the diff at slightly under/over a whole
 * number of days across a DST transition, the result is rounded (not
 * floored) to the nearest day.
 *
 * Returns 0 for same-day, inverted, or unparseable ranges.
 */
export function calculateNights(checkIn: string, checkOut: string): number {
  const start = new Date(`${checkIn}T12:00:00`);
  const end = new Date(`${checkOut}T12:00:00`);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return 0;
  }

  const diffMs = end.getTime() - start.getTime();
  const nights = Math.round(diffMs / MS_PER_DAY);

  return Math.max(0, nights);
}

/**
 * Nights to charge when creating a NEW detalle (room line) on a reservation.
 * If the reservation is already in Check-in, the stay for this room starts
 * today (partial stay) rather than at the reservation's original check-in
 * date — the guest occupying this new room wasn't there for nights already
 * elapsed. Editing an existing detalle is unaffected; this only applies to
 * brand-new room lines.
 */
export function calculateNightsForNewDetalle(
  fechaEntrada: string,
  fechaSalida: string,
  isCheckIn: boolean,
  today: string
): number {
  const start = isCheckIn ? today : fechaEntrada;
  return calculateNights(start, fechaSalida);
}

/**
 * Recovers the nights a detalle (room line) was actually charged for, from
 * its persisted subtotal and unit price. `detalle_reservas` has no
 * nights/date column of its own — a room added mid-stay via
 * calculateNightsForNewDetalle may have been charged fewer nights than the
 * reservation's full range, so reversing its charge (e.g. on delete) must
 * derive the real nights instead of assuming the full range. Returns 0 when
 * the unit price is missing or non-positive, to avoid dividing by zero.
 */
export function deriveNightsFromSubtotal(subtotal: number, unitPrice: number): number {
  if (!unitPrice || unitPrice <= 0) return 0;
  return Math.round(subtotal / unitPrice);
}

/** Per-room subtotal: unit price times nights stayed. Negative nights clamp to 0. */
export function calculateRoomSubtotal(unitPrice: number, nights: number): number {
  return unitPrice * Math.max(0, nights);
}

/** Sums the subtotal of every room row, treating a null subtotal as 0. */
export function calculateReservationTotal(
  rooms: ReadonlyArray<{ subtotal: number | null }>
): number {
  return rooms.reduce((total, room) => total + (room.subtotal || 0), 0);
}
