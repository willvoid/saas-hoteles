/**
 * Late check-out / early check-in surcharge: client-side mirror of the SQL
 * function `calcular_recargo_horario` (migration 0022), used for the live
 * example of the settings screen and for the dialog's validation rules.
 *
 * The database stays the source of truth: the amount that is actually charged
 * is always computed there. This module only mirrors the formula so the
 * preview matches it.
 *
 * Pure module (no React / Supabase) so it can be tested in a node environment.
 */

export type MetodoRecargo = 'PORCENTAJE' | 'FIJO_HORA';
export type TipoRecargo = 'LATE_CHECKOUT' | 'EARLY_CHECKIN';

export interface ConfigHorarios {
  /** "HH:MM" (or "HH:MM:SS", as Postgres returns a `time`). */
  hora_checkin: string;
  hora_checkout: string;
  /** Minutes past the scheduled hour that are tolerated before any surcharge. */
  tolerancia_min: number;
  metodo_recargo: MetodoRecargo;
  /** PORCENTAJE: % (0-100) of the nightly rate. FIJO_HORA: Gs per hour. */
  valor_recargo: number;
}

/** What the database uses when an establishment has no configuration row. */
export const DEFAULT_CONFIG_HORARIOS: ConfigHorarios = {
  hora_checkin: '14:00',
  hora_checkout: '11:00',
  tolerancia_min: 30,
  metodo_recargo: 'PORCENTAJE',
  valor_recargo: 25,
};

export const TOLERANCIAS_MIN = [0, 15, 30, 60] as const;

/** "HH:MM" or "HH:MM:SS" → minutes since midnight, or null if it is not a time. */
export function horaAMinutos(hora: string | null | undefined): number | null {
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec((hora ?? '').trim());
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 23 || m > 59) return null;
  return h * 60 + m;
}

/** Normalizes a Postgres `time` ("14:00:00") to the "HH:MM" an <input type="time"> uses. */
export function horaCorta(hora: string | null | undefined): string {
  return (hora ?? '').trim().slice(0, 5);
}

/**
 * Whole minutes between the scheduled hour and the real one, in the direction
 * that costs money: after it for a late check-out, before it for an early
 * check-in. Clamped at 0.
 */
export function minutosDeExceso(tipo: TipoRecargo, horaProgramada: string, horaReal: string): number {
  const programada = horaAMinutos(horaProgramada);
  const real = horaAMinutos(horaReal);
  if (programada === null || real === null) return 0;
  const exceso = tipo === 'LATE_CHECKOUT' ? real - programada : programada - real;
  return Math.max(0, exceso);
}

export interface EntradaMonto {
  metodo: MetodoRecargo;
  valor: number;
  tarifaNoche: number;
  minutosExceso: number;
  toleranciaMin: number;
}

/**
 * Suggested surcharge in whole Gs. The tolerance only decides whether any
 * surcharge applies (excess strictly greater than the tolerance). FIJO_HORA
 * counts from the scheduled hour, not from the end of the tolerance, rounded
 * up to whole hours.
 */
export function calcularMontoRecargo({
  metodo,
  valor,
  tarifaNoche,
  minutosExceso,
  toleranciaMin,
}: EntradaMonto): number {
  if (![valor, tarifaNoche, minutosExceso, toleranciaMin].every(Number.isFinite)) return 0;
  if (minutosExceso <= toleranciaMin) return 0;
  const bruto =
    metodo === 'PORCENTAJE'
      ? (tarifaNoche * valor) / 100
      : Math.ceil(minutosExceso / 60) * valor;
  return Math.max(0, Math.round(bruto));
}

export interface PreviewRecargo {
  minutosExceso: number;
  monto: number;
}

/** Excess and surcharge for a real hour, e.g. the "Cargo calculado" example card. */
export function previewRecargo(
  config: ConfigHorarios,
  tipo: TipoRecargo,
  tarifaNoche: number,
  horaReal: string,
): PreviewRecargo {
  const programada = tipo === 'LATE_CHECKOUT' ? config.hora_checkout : config.hora_checkin;
  const exceso = minutosDeExceso(tipo, programada, horaReal);
  return {
    minutosExceso: exceso,
    monto: calcularMontoRecargo({
      metodo: config.metodo_recargo,
      valor: config.valor_recargo,
      tarifaNoche,
      minutosExceso: exceso,
      toleranciaMin: config.tolerancia_min,
    }),
  };
}

/** 0 → "0 min", 45 → "45 min", 120 → "2 h", 90 → "1 h 30 min". */
export function formatearMinutos(minutos: number): string {
  const total = Math.max(0, Math.round(Number.isFinite(minutos) ? minutos : 0));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}

/**
 * Same rule as `fn_estancia_con_recargo`: a reason is mandatory when the
 * surcharge is exonerated or the amount differs from the suggestion.
 */
export function requiereMotivo(entrada: {
  exonerar: boolean;
  montoFinal: number;
  montoSugerido: number;
}): boolean {
  return entrada.exonerar || Math.round(entrada.montoFinal) !== Math.round(entrada.montoSugerido);
}

/** Validation matching the table's CHECK constraints. Returns a Spanish message or null. */
export function validarConfigHorarios(config: ConfigHorarios): string | null {
  if (horaAMinutos(config.hora_checkin) === null) return 'Ingresá una hora de check-in válida.';
  if (horaAMinutos(config.hora_checkout) === null) return 'Ingresá una hora de check-out válida.';
  if (!Number.isInteger(config.tolerancia_min) || config.tolerancia_min < 0) {
    return 'La tolerancia debe ser un número de minutos mayor o igual a 0.';
  }
  if (!Number.isFinite(config.valor_recargo) || config.valor_recargo < 0) {
    return 'El valor del recargo no puede ser negativo.';
  }
  if (config.metodo_recargo === 'PORCENTAJE' && config.valor_recargo > 100) {
    return 'El porcentaje del recargo no puede superar el 100%.';
  }
  return null;
}

/**
 * Turns a Supabase/Postgres error of the surcharge RPCs and the settings table
 * into a Spanish message for the user. The RPCs already raise Spanish text for
 * 22023 (invalid input / reason required) and 55000 (wrong estado, closed
 * folio), so those pass through; the generic permission and not-found errors
 * come from RLS / lookups and are rewritten.
 */
export function traducirErrorRecargo(
  error: { code?: string | null; message?: string | null } | null | undefined,
  fallback = 'No se pudo completar la operación. Intentá de nuevo.',
): string {
  const mensaje = (error?.message ?? '').trim();
  switch (error?.code) {
    case '42501':
      return 'No tenés permisos para realizar esta operación, o la suscripción del hotel está vencida.';
    case 'P0002':
      return 'La reserva no existe o no tenés acceso a ella.';
    case '23505':
      return 'Ya existe una configuración de horarios para este establecimiento.';
    case '23514':
      return 'Hay valores fuera de rango en la configuración de horarios.';
    case '22023':
    case '55000':
      return mensaje || fallback;
    default:
      return mensaje || fallback;
  }
}

const ETIQUETAS_MOVIMIENTO: Record<string, string> = {
  RECARGO_APLICADO: 'Recargo aplicado',
  RECARGO_MODIFICADO: 'Recargo modificado',
  RECARGO_EXONERADO: 'Recargo exonerado',
  CARGO_MANUAL: 'Cargo manual',
};

/** Label of a `historial_estancia.tipo_movimiento`: friendly for the surcharge types, else underscores as spaces. */
export function etiquetaMovimiento(tipo: string): string {
  return ETIQUETAS_MOVIMIENTO[tipo] ?? tipo.replace(/_/g, ' ');
}
