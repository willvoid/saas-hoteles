// Cargos del folio atribuidos a una habitación de la reserva.
//
// `cargos_folio.fk_detalle_reserva` dice a qué habitación (fila de
// detalle_reservas) pertenece un cargo; NULL es un cargo general de la reserva
// o un alojamiento agregado anterior a la atribución por habitación (legacy).
//
// Sin imports de React/Supabase: sólo la cuenta, para poder testearla.

import { esCargoDeAlojamiento } from './alojamiento';

/** Mínimo que necesitamos de cada habitación de la reserva (subconjunto de FilaAlojamiento). */
export interface FilaHabitacion {
  idDetalle: number;
  /** Número de la habitación tal como lo muestra el resto de la UI. */
  habitacion: string;
  tipo: string;
  /** Lo que deben sumar sus cargos de alojamiento. */
  subtotal: number;
}

/** Opción del selector de habitación del cargo manual. `null` = general. */
export interface OpcionHabitacionCargo {
  idDetalle: number | null;
  etiqueta: string;
}

/** Forma mínima de un cargo para ordenarlo por habitación. */
export interface CargoConHabitacion {
  fk_detalle_reserva?: number | null;
}

export const ETIQUETA_GENERAL = 'General';
export const ETIQUETA_GENERAL_RESERVA = 'General de la reserva';
export const ETIQUETA_HABITACION_RETIRADA = 'Hab. retirada';

const etiquetaNumero = (habitacion: string) => `Hab. ${habitacion}`;

/**
 * Texto corto de la habitación de un cargo: "General" si no tiene,
 * "Hab. 101" si es una habitación asignada, o "Hab. retirada" si apunta a
 * una habitación que ya no está en la reserva.
 */
export function etiquetaHabitacion(
  fkDetalleReserva: number | null | undefined,
  habitaciones: ReadonlyArray<FilaHabitacion>,
): string {
  if (fkDetalleReserva == null) return ETIQUETA_GENERAL;
  const fila = habitaciones.find((h) => h.idDetalle === fkDetalleReserva);
  return fila ? etiquetaNumero(fila.habitacion) : ETIQUETA_HABITACION_RETIRADA;
}

/**
 * Opciones del selector del cargo manual: "General de la reserva" más una por
 * habitación. Con menos de dos habitaciones no hay nada que elegir, así que
 * devuelve una lista vacía (el selector se oculta y el cargo queda general).
 */
export function opcionesHabitacionCargo(habitaciones: ReadonlyArray<FilaHabitacion>): OpcionHabitacionCargo[] {
  if (habitaciones.length < 2) return [];
  return [
    { idDetalle: null, etiqueta: ETIQUETA_GENERAL_RESERVA },
    ...habitaciones.map((h) => {
      const tipo = h.tipo && h.tipo !== '-' ? ` · ${h.tipo}` : '';
      return { idDetalle: h.idDetalle, etiqueta: `${etiquetaNumero(h.habitacion)}${tipo}` };
    }),
  ];
}

/** True si la selección sigue siendo válida entre las opciones ofrecidas (null siempre lo es salvo sin selector). */
export function esHabitacionValida(
  seleccion: number | null,
  opciones: ReadonlyArray<OpcionHabitacionCargo>,
): boolean {
  if (opciones.length === 0) return seleccion === null;
  return opciones.some((o) => o.idDetalle === seleccion);
}

/**
 * Ordena los cargos: primero los generales, luego por habitación en el orden
 * de la reserva y al final los de habitaciones retiradas. Estable dentro de
 * cada grupo; devuelve una copia.
 */
export function ordenarCargosPorHabitacion<T extends CargoConHabitacion>(
  cargos: ReadonlyArray<T>,
  habitaciones: ReadonlyArray<FilaHabitacion>,
): T[] {
  const rango = (c: T): number => {
    if (c.fk_detalle_reserva == null) return -1;
    const i = habitaciones.findIndex((h) => h.idDetalle === c.fk_detalle_reserva);
    return i === -1 ? Number.MAX_SAFE_INTEGER : i;
  };
  return cargos
    .map((cargo, orden) => ({ cargo, orden, rango: rango(cargo) }))
    .sort((a, b) => a.rango - b.rango || a.orden - b.orden)
    .map((x) => x.cargo);
}

/**
 * La columna "Habitación" sólo aporta cuando hay más de una habitación o ya
 * hay cargos atribuidos; en una reserva simple sería ruido.
 */
export function mostrarColumnaHabitacion(
  cargos: ReadonlyArray<CargoConHabitacion>,
  habitaciones: ReadonlyArray<FilaHabitacion>,
): boolean {
  return habitaciones.length > 1 || cargos.some((c) => c.fk_detalle_reserva != null);
}

// ════════════════════════════════════════════════════════════════════════════
// Consistencia cargo de alojamiento vs. desglose de habitaciones
// ════════════════════════════════════════════════════════════════════════════

/** Forma mínima de un cargo del folio para detectar desfases de alojamiento. */
export interface CargoParaDesfase extends CargoConHabitacion {
  monto_total: number | string;
  estado?: string | null;
  concepto?: { nombre?: string | null } | null;
}

export interface DesfaseAlojamiento {
  /**
   * `habitacion`: cargo propio de una habitación asignada que difiere (o falta).
   * `general`: el cargo agregado (fk NULL) no coincide con las habitaciones que cubre.
   * `retirada`: cargo de una habitación que ya no está en la reserva.
   */
  tipo: 'habitacion' | 'general' | 'retirada';
  idDetalle: number | null;
  /** Número de habitación, sólo para `tipo: 'habitacion'`. */
  habitacion: string | null;
  cargado: number;
  calculado: number;
}

export interface ResultadoDesfaseAlojamiento {
  /**
   * `sin-cargo`: el folio no tiene alojamiento cargado (nada que comparar).
   * `legacy`: un cargo agregado (fk NULL) y ninguno por habitación.
   * `por-habitacion`: hay al menos un cargo atribuido a una habitación.
   */
  modo: 'sin-cargo' | 'legacy' | 'por-habitacion';
  desfases: DesfaseAlojamiento[];
  hayDesfase: boolean;
}

/**
 * Compara los cargos de alojamiento del folio contra el desglose de la
 * reserva. Cada habitación se compara con el cargo que lleva su
 * `fk_detalle_reserva`; el cargo agregado (NULL) cubre las habitaciones que no
 * tienen cargo propio. Así un folio legacy se compara entero contra el total,
 * como antes, y uno mixto (agregado + habitación sumada después) sigue siendo
 * coherente.
 */
export function detectarDesfaseAlojamiento(
  cargos: ReadonlyArray<CargoParaDesfase>,
  habitaciones: ReadonlyArray<FilaHabitacion>,
): ResultadoDesfaseAlojamiento {
  const alojamiento = cargos.filter(
    (c) => c.estado !== 'INACTIVO' && esCargoDeAlojamiento(c.concepto?.nombre),
  );
  if (alojamiento.length === 0) return { modo: 'sin-cargo', desfases: [], hayDesfase: false };

  const monto = (c: CargoParaDesfase) => Number(c.monto_total) || 0;
  const propios = alojamiento.filter((c) => c.fk_detalle_reserva != null);
  const agregados = alojamiento.filter((c) => c.fk_detalle_reserva == null);
  const modo = propios.length > 0 ? 'por-habitacion' : 'legacy';
  const desfases: DesfaseAlojamiento[] = [];

  let calculadoSinCargoPropio = 0;
  for (const fila of habitaciones) {
    const suyos = propios.filter((c) => c.fk_detalle_reserva === fila.idDetalle);
    if (suyos.length === 0) {
      if (agregados.length > 0) {
        // El cargo agregado (legacy) cubre las habitaciones sin cargo propio.
        calculadoSinCargoPropio += fila.subtotal;
      } else if (fila.subtotal > 0) {
        // Hay cargos por habitación pero a ésta (que debería cobrar) le falta el suyo.
        desfases.push({
          tipo: 'habitacion',
          idDetalle: fila.idDetalle,
          habitacion: fila.habitacion,
          cargado: 0,
          calculado: fila.subtotal,
        });
      }
      continue;
    }
    const cargado = suyos.reduce((acc, c) => acc + monto(c), 0);
    if (cargado !== fila.subtotal) {
      desfases.push({
        tipo: 'habitacion',
        idDetalle: fila.idDetalle,
        habitacion: fila.habitacion,
        cargado,
        calculado: fila.subtotal,
      });
    }
  }

  if (agregados.length > 0) {
    const cargado = agregados.reduce((acc, c) => acc + monto(c), 0);
    if (cargado !== calculadoSinCargoPropio) {
      desfases.push({ tipo: 'general', idDetalle: null, habitacion: null, cargado, calculado: calculadoSinCargoPropio });
    }
  }

  for (const c of propios) {
    if (!habitaciones.some((h) => h.idDetalle === c.fk_detalle_reserva)) {
      desfases.push({
        tipo: 'retirada',
        idDetalle: c.fk_detalle_reserva as number,
        habitacion: null,
        cargado: monto(c),
        calculado: 0,
      });
    }
  }

  return { modo, desfases, hayDesfase: desfases.length > 0 };
}
