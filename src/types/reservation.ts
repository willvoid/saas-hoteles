// ─── Cabecera de la reserva ───────────────────────────────────────────────────
export interface Reserva {
  id_reserva: number;
  created_at: string;
  codigo_reserva: string | null;
  fecha_entrada: string;
  fecha_salida: string;
  estado: ReservaEstado;
  fk_cliente: number;
  fk_usuario: number | null;
  origen: string | null;
  observaciones: string | null;
  total_estimado: number;
  // joins opcionales
  clientes?: { razon_social: string; documento: string };
  usuario?: { nombre: string };
}

/** Conjunto canónico de estados de una reserva (fuente de verdad). */
export const RESERVA_ESTADOS = [
  'Pendiente',
  'Confirmada',
  'Check-in',
  'Check-out',
  'Cancelada',
] as const;

/**
 * Unión estricta de estados válidos. Se deriva de RESERVA_ESTADOS para que el
 * compilador enforce el set (antes degradaba a `string` por un `| string` final,
 * lo que anulaba todo chequeo de tipos sobre el estado).
 */
export type ReservaEstado = (typeof RESERVA_ESTADOS)[number];

// ─── Detalle de la reserva (habitaciones y tarifas) ──────────────────────────
export interface DetalleReserva {
  id_detalle: number;
  created_at: string;
  fk_reserva: number;
  fk_habitacion: number;
  fk_tarifa: number;
  cantidad_adultos: number;
  cantidad_ninos: number;
  precio_unitario: number;
  subtotal: number;
  estado: string | null;
  // joins opcionales
  habitaciones?: Habitacion;
  tarifas?: Tarifa;
}

// ─── Huéspedes por detalle ────────────────────────────────────────────────────
export interface HuespedReserva {
  id_huesped: number;
  created_at: string;
  fk_detalle_reserva: number;
  nombre_completo: string;
  documento: string | null;
  fk_tipo_documento: number;
  nacionalidad: string | null;
  es_titular: boolean;
}

// ─── Historial / Bitácora ─────────────────────────────────────────────────────
export interface HistorialEstancia {
  id_historial: number;
  fk_reserva: number;
  tipo_movimiento: string;
  descripcion: string | null;
  fecha_movimiento: string | null;
  fk_usuario: number;
  // join opcional
  usuario?: { nombre: string };
}

// ─── Habitaciones (esquema real de BD) ────────────────────────────────────────
export interface Habitacion {
  id: number;
  created_at: string;
  numero_habitacion: number;
  fk_tipo_habitacion: number;
  fk_piso: number;
  descripcion: string | null;
  // joins opcionales
  tipo_habitacion?: TipoHabitacion;
  pisos?: { id: number; nombre?: string };
}

export interface TipoHabitacion {
  id: number;
  nombre: string;
  descripcion: string;
  capacidad: number;
}

// ─── Tarifas (esquema real de BD) ─────────────────────────────────────────────
export interface Tarifa {
  id: number;
  created_at: string;
  nombre: string;
  precio_base: number;
  fk_tipo_habitacion: number;
  estado: string;
  fecha_inicio: string;
  fecha_fin: string | null;
  // join opcional
  tipo_habitacion?: TipoHabitacion;
}
