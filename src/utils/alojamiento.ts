// Recálculo del alojamiento cuando cambian las fechas de una reserva.
//
// Las fechas son de la reserva completa, así que un cambio de check-in o
// check-out mueve las noches de TODAS sus habitaciones a la vez: hay que
// recalcular cada subtotal, el total estimado de la reserva y el cargo
// automático de "Alojamiento" del folio (si la estadía ya arrancó).
//
// Sin imports de React/Supabase: es sólo la cuenta, para poder testearla.

import { calculateNights, calculateRoomSubtotal } from './pricing';

/**
 * Nombre del concepto que folioService.getOrCrearConceptoAlojamiento busca o
 * crea para el cargo automático de noches de estadía.
 */
export const NOMBRE_CONCEPTO_ALOJAMIENTO = 'Alojamiento';

/**
 * True si un cargo del folio corresponde al concepto de Alojamiento. Ese
 * cargo lo administra exclusivamente ajustarCargoAlojamiento (a partir de las
 * fechas de la reserva): en el folio tiene su propia tabla de sólo lectura y
 * queda fuera de la lista de consumos.
 */
export function esCargoDeAlojamiento(nombreConcepto: string | null | undefined): boolean {
  return (nombreConcepto || '').trim().toLowerCase() === NOMBRE_CONCEPTO_ALOJAMIENTO.toLowerCase();
}

// ════════════════════════════════════════════════════════════════════════════
// Desglose del alojamiento (tabla propia dentro del folio)
// ════════════════════════════════════════════════════════════════════════════

/** Habitación asignada a la reserva, como la devuelve getDetalleReserva. */
export interface DetalleParaDesglose {
  id_detalle: number;
  fk_habitacion: number;
  precio_unitario: number | null;
  cantidad_adultos?: number | null;
  cantidad_ninos?: number | null;
  habitaciones?: {
    numero_habitacion?: number | string | null;
    tipo_habitacion?: { nombre?: string | null } | null;
  } | null;
  tarifas?: { nombre?: string | null } | null;
}

/** Una fila de la tabla de alojamiento: qué se cobra por cada habitación. */
export interface FilaAlojamiento {
  idDetalle: number;
  habitacion: string;
  tipo: string;
  tarifa: string;
  huespedes: number;
  precioPorNoche: number;
  noches: number;
  subtotal: number;
}

export interface DesgloseAlojamiento {
  filas: FilaAlojamiento[];
  /** Noches de la estadía, compartidas por todas las habitaciones. */
  noches: number;
  /** Suma de los subtotales: lo que debe valer el cargo de Alojamiento. */
  total: number;
}

/**
 * Arma el desglose del alojamiento: cada habitación asignada aporta
 * `precio por noche × noches de la estadía`, y el total es la suma de esos
 * subtotales. Las fechas son de la reserva completa, así que las noches son
 * las mismas para todas las habitaciones.
 *
 * El subtotal se recalcula acá en vez de leer el guardado en la fila, para
 * que la tabla siempre muestre lo que dice la fórmula.
 */
export function construirDesgloseAlojamiento(
  detalles: ReadonlyArray<DetalleParaDesglose>,
  fechaEntrada: string,
  fechaSalida: string,
): DesgloseAlojamiento {
  const noches = calculateNights(fechaEntrada, fechaSalida);

  const filas = detalles.map((d) => {
    const precioPorNoche = Number(d.precio_unitario) || 0;
    return {
      idDetalle: d.id_detalle,
      habitacion: `${d.habitaciones?.numero_habitacion ?? d.fk_habitacion}`,
      tipo: d.habitaciones?.tipo_habitacion?.nombre || '-',
      tarifa: d.tarifas?.nombre || '-',
      huespedes: (d.cantidad_adultos ?? 0) + (d.cantidad_ninos ?? 0),
      precioPorNoche,
      noches,
      subtotal: calculateRoomSubtotal(precioPorNoche, noches),
    };
  });

  return {
    filas,
    noches,
    total: filas.reduce((acc, f) => acc + f.subtotal, 0),
  };
}

export interface DetalleParaAjuste {
  id_detalle: number;
  precio_unitario: number | null;
  subtotal: number | null;
}

/**
 * Delta del cargo de Alojamiento de UNA habitación (el que lleva su
 * `fk_detalle_reserva`). Se le pasa tal cual a ajustarCargoAlojamiento junto
 * con el `id_detalle`.
 */
export interface AjusteCargoHabitacion {
  id_detalle: number;
  /** Delta de noches de esa habitación. */
  deltaCantidad: number;
  /** Delta de dinero de esa habitación. */
  deltaMonto: number;
}

export interface AjusteAlojamiento {
  /** Subtotales a persistir. Sólo las habitaciones cuyo monto efectivamente cambia. */
  cambios: { id_detalle: number; subtotal: number }[];
  /** Total estimado de la reserva ya recalculado con las noches nuevas. */
  totalEstimado: number;
  /**
   * Delta agregado de "noches-habitación" (noches × habitaciones). Es el que
   * corresponde a un único cargo de Alojamiento que suma todas las habitaciones
   * (folios legacy); los cargos por habitación usan `porHabitacion`.
   */
  deltaCantidad: number;
  /** Delta de dinero para el mismo cargo. */
  deltaMonto: number;
  /**
   * Los mismos deltas abiertos por habitación, para los cargos que se llevan
   * una fila por habitación. Sólo figuran las habitaciones que cambian; su
   * suma coincide con `deltaCantidad` y `deltaMonto`.
   */
  porHabitacion: AjusteCargoHabitacion[];
}

/**
 * Calcula todo lo que hay que mover cuando la estadía pasa de
 * `nochesAnteriores` a `nochesNuevas`.
 *
 * El delta de dinero se saca contra el subtotal realmente guardado en cada
 * habitación (no contra `precio × nochesAnteriores`): si algún subtotal quedó
 * desincronizado, este recálculo lo corrige en vez de arrastrar el desvío.
 */
export function calcularAjusteAlojamiento(
  detalles: ReadonlyArray<DetalleParaAjuste>,
  nochesAnteriores: number,
  nochesNuevas: number,
): AjusteAlojamiento {
  const cambios: { id_detalle: number; subtotal: number }[] = [];
  const porHabitacion: AjusteCargoHabitacion[] = [];
  const deltaNoches = nochesNuevas - nochesAnteriores;
  let totalEstimado = 0;
  let deltaMonto = 0;

  for (const detalle of detalles) {
    const precio = Number(detalle.precio_unitario) || 0;
    const subtotalNuevo = calculateRoomSubtotal(precio, nochesNuevas);
    const subtotalAnterior = Number(detalle.subtotal) || 0;

    totalEstimado += subtotalNuevo;

    if (subtotalNuevo !== subtotalAnterior) {
      cambios.push({ id_detalle: detalle.id_detalle, subtotal: subtotalNuevo });
      deltaMonto += subtotalNuevo - subtotalAnterior;
    }

    const deltaMontoHabitacion = subtotalNuevo - subtotalAnterior;
    if (deltaNoches !== 0 || deltaMontoHabitacion !== 0) {
      porHabitacion.push({
        id_detalle: detalle.id_detalle,
        deltaCantidad: deltaNoches,
        deltaMonto: deltaMontoHabitacion,
      });
    }
  }

  return {
    cambios,
    totalEstimado,
    deltaCantidad: deltaNoches * detalles.length,
    deltaMonto,
    porHabitacion,
  };
}
