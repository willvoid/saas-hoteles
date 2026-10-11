import { supabase } from './supabaseClient';
import { rowHasBlockingEstado, isBlockingEstado } from '../utils/reservaBlockingState';

// Estados que marcan una habitación como ocupada. Son los literales que escribe
// la app hoy: 'Check-in' en ReservationForm y 'Activo' en ReservationDetail.
const RESERVA_OCUPADA = 'Check-in';
const DETALLE_ACTIVO = 'Activo';

/** 'YYYY-MM-DD' en hora local. toISOString() daría la fecha UTC, que a la noche ya es el día siguiente. */
export const getLocalToday = (): string => new Date().toLocaleDateString('en-CA');

const addDays = (isoDate: string, n: number): string => {
  const d = new Date(`${isoDate}T00:00:00`);
  d.setDate(d.getDate() + n);
  return d.toLocaleDateString('en-CA');
};

const toIdSet = (rows: DetalleHabitacionRow[]): Set<number> =>
  new Set(rows.map(r => r.fk_habitacion).filter((id): id is number => id != null));

export interface DateRangeAvailabilityQuery {
  fechaEntrada: string; // 'YYYY-MM-DD'
  fechaSalida: string; // 'YYYY-MM-DD'
  /** The reservation being edited. Its own rooms must not read as occupied
   *  by itself. */
  excludeReservaId?: number;
}

interface ReservaRangeRow {
  id_reserva: number;
  estado: string | null;
}

interface DetalleHabitacionRow {
  fk_habitacion: number | null;
}

export const RoomOccupancyService = {
  /**
   * Ids de las habitaciones ocupadas en `fecha` (por defecto hoy).
   * Ocupada = tiene un detalle activo en una reserva con check-in cuyo rango cubre la fecha.
   */
  getHabitacionesOcupadas: async (fecha: string = getLocalToday()): Promise<Set<number>> => {
    // Se compara fecha_entrada contra el día siguiente en vez de usar <= fecha para que
    // el rango también sea correcto si la columna fuese timestamp y no date.
    const manana = addDays(fecha, 1);

    // El !inner es lo que convierte el embed en INNER JOIN. Sin él los filtros sobre
    // reservas.* sólo vacían el objeto embebido y la fila de detalle_reservas vuelve igual.
    const { data, error } = await supabase
      .from('detalle_reservas')
      .select('fk_habitacion, reservas!inner(estado, fecha_entrada, fecha_salida)')
      .eq('estado', DETALLE_ACTIVO)
      .eq('reservas.estado', RESERVA_OCUPADA)
      .lt('reservas.fecha_entrada', manana)
      .gt('reservas.fecha_salida', fecha);

    if (!error) return toIdSet(data || []);

    console.error('Error consultando ocupación (embed), usando fallback:', error);

    const { data: reservas, error: reservasError } = await supabase
      .from('reservas')
      .select('id_reserva')
      .eq('estado', RESERVA_OCUPADA)
      .lt('fecha_entrada', manana)
      .gt('fecha_salida', fecha);

    if (reservasError) throw reservasError;

    const ids = ((reservas || []) as Pick<ReservaRangeRow, 'id_reserva'>[]).map(r => r.id_reserva);
    if (ids.length === 0) return new Set();

    const { data: detalles, error: detallesError } = await supabase
      .from('detalle_reservas')
      .select('fk_habitacion')
      .eq('estado', DETALLE_ACTIVO)
      .in('fk_reserva', ids);

    if (detallesError) throw detallesError;

    return toIdSet(detalles || []);
  },

  /**
   * Ids de las habitaciones ocupadas para el RANGO [fechaEntrada, fechaSalida)
   * de una reserva — no "ocupada ahora", sino "ocupada durante esas fechas".
   *
   * Distinta pregunta que `getHabitacionesOcupadas`: esa función responde
   * "¿hay alguien físicamente en la habitación hoy?" (correcta para Gestión
   * de Habitaciones) y no debe tocarse. Esta responde "¿esa habitación ya
   * está comprometida para estas fechas?" (correcta para el picker de una
   * reserva). Mostrar la respuesta de la primera en el picker sobrevendería
   * habitaciones confirmadas para fechas futuras.
   *
   * Bloquean los estados 'Pendiente', 'Confirmada' y 'Check-in', comparados
   * sin distinguir mayúsculas/minúsculas del lado del cliente (ver
   * `reservaBlockingState.ts`): el `.in()` de PostgREST es sensible a
   * mayúsculas y un `estado` con casing inesperado (p. ej. escrito por el RPC
   * de reservas web) dejaría de bloquear en silencio, sobrevendiendo la
   * habitación.
   */
  getHabitacionesOcupadasEnRango: async (
    query: DateRangeAvailabilityQuery
  ): Promise<Set<number>> => {
    const { fechaEntrada, fechaSalida, excludeReservaId } = query;

    // El !inner es lo que convierte el embed en INNER JOIN. Sin él los filtros sobre
    // reservas.* sólo vacían el objeto embebido y la fila de detalle_reservas vuelve igual.
    let embedQuery = supabase
      .from('detalle_reservas')
      .select('fk_habitacion, fk_reserva, reservas!inner(estado, fecha_entrada, fecha_salida)')
      .eq('estado', DETALLE_ACTIVO)
      .lt('reservas.fecha_entrada', fechaSalida)
      .gt('reservas.fecha_salida', fechaEntrada);

    // Filtra sobre la tabla base (fk_reserva), no a través del embed: así
    // aplica siempre, sin depender de cómo el !inner combine los filtros.
    if (excludeReservaId != null) {
      embedQuery = embedQuery.neq('fk_reserva', excludeReservaId);
    }

    const { data, error } = await embedQuery;

    if (!error) {
      return toIdSet((data || []).filter(rowHasBlockingEstado));
    }

    console.error('Error consultando ocupación por rango (embed), usando fallback:', error);

    let reservasQuery = supabase
      .from('reservas')
      .select('id_reserva, estado')
      .lt('fecha_entrada', fechaSalida)
      .gt('fecha_salida', fechaEntrada);

    if (excludeReservaId != null) {
      reservasQuery = reservasQuery.neq('id_reserva', excludeReservaId);
    }

    const { data: reservas, error: reservasError } = await reservasQuery;

    if (reservasError) throw reservasError;

    const ids = ((reservas || []) as ReservaRangeRow[])
      .filter(r => isBlockingEstado(r.estado))
      .map(r => r.id_reserva);

    if (ids.length === 0) return new Set();

    const { data: detalles, error: detallesError } = await supabase
      .from('detalle_reservas')
      .select('fk_habitacion')
      .eq('estado', DETALLE_ACTIVO)
      .in('fk_reserva', ids);

    if (detallesError) throw detallesError;

    return toIdSet((detalles || []) as DetalleHabitacionRow[]);
  }
};
