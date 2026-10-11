import { RESERVA_ESTADOS, type ReservaEstado } from '../types/reservation';

// Re-export para tener un único punto de entrada de todo lo relativo a la
// máquina de estados de una reserva.
export { RESERVA_ESTADOS, type ReservaEstado };

/**
 * Estados válidos al CREAR una reserva. El Check-in no se elige acá: se hace
 * desde el detalle de la reserva, que es donde se abre el folio y se carga el
 * alojamiento. Tampoco se puede nacer en un estado terminal (Check-out /
 * Cancelada).
 */
export const INITIAL_ESTADOS: ReservaEstado[] = ['Pendiente', 'Confirmada'];

/**
 * Máquina de estados: destinos válidos desde cada estado.
 * Check-out y Cancelada son terminales (sin salida).
 */
const ALLOWED_TRANSITIONS: Record<ReservaEstado, ReservaEstado[]> = {
  'Pendiente': ['Confirmada', 'Check-in', 'Cancelada'],
  'Confirmada': ['Check-in', 'Cancelada'],
  'Check-in': ['Check-out'],
  'Check-out': [],
  'Cancelada': [],
};

/** Estados que exigen confirmación explícita del usuario antes de aplicarse. */
export const CRITICAL_ESTADOS: ReservaEstado[] = ['Check-in', 'Check-out', 'Cancelada'];

/**
 * Normaliza un estado de la DB al valor canónico. La DB guarda texto libre con
 * casing inconsistente (ej. 'PENDIENTE', 'ACTIVA'), así que la comparación es
 * case-insensitive. Devuelve null si no matchea ningún estado conocido.
 */
export function toCanonicalEstado(estado: string | null | undefined): ReservaEstado | null {
  if (!estado) return null;
  const match = RESERVA_ESTADOS.find(e => e.toLowerCase() === estado.toLowerCase());
  return match ?? null;
}

/**
 * True si la reserva ya pasó por el Check-out. Una vez cerrada la estancia
 * sólo se puede consultar: ni la reserva ni sus detalles (habitaciones,
 * huéspedes) se pueden seguir modificando.
 */
export function esReservaCerrada(estado: string | null | undefined): boolean {
  return toCanonicalEstado(estado) === 'Check-out';
}

/** Destinos válidos desde `from` (para renderizar botones de acción). */
export function getAllowedTargets(from: string | null | undefined): ReservaEstado[] {
  const canonical = toCanonicalEstado(from);
  if (!canonical) return [];
  return ALLOWED_TRANSITIONS[canonical];
}

/**
 * True solo si `from → to` es una transición permitida. Una transición hacia el
 * mismo estado (`from === to`) no es una transición y devuelve false.
 */
export function canTransition(
  from: string | null | undefined,
  to: string | null | undefined,
): boolean {
  const canonicalFrom = toCanonicalEstado(from);
  const canonicalTo = toCanonicalEstado(to);
  if (!canonicalFrom || !canonicalTo) return false;
  if (canonicalFrom === canonicalTo) return false;
  return ALLOWED_TRANSITIONS[canonicalFrom].includes(canonicalTo);
}

/** True si pasar a `to` requiere un diálogo de confirmación. */
export function requiresConfirmation(to: string | null | undefined): boolean {
  const canonical = toCanonicalEstado(to);
  return canonical != null && CRITICAL_ESTADOS.includes(canonical);
}

export interface TransitionCopy {
  /** Texto del botón de acción. */
  actionLabel: string;
  /** Título del diálogo de confirmación. */
  title: string;
  /** Mensaje del diálogo de confirmación. */
  message: string;
  /** Texto del botón que confirma la acción. */
  confirmLabel: string;
  /** Severidad visual: 'danger' para acciones destructivas/terminales. */
  variant: 'default' | 'danger';
}

const TRANSITION_COPY: Record<ReservaEstado, TransitionCopy> = {
  'Pendiente': {
    actionLabel: 'Marcar Pendiente',
    title: 'Marcar como Pendiente',
    message: '¿Volver la reserva a estado Pendiente?',
    confirmLabel: 'Marcar Pendiente',
    variant: 'default',
  },
  'Confirmada': {
    actionLabel: 'Confirmar',
    title: 'Confirmar reserva',
    message: '¿Confirmar esta reserva?',
    confirmLabel: 'Confirmar',
    variant: 'default',
  },
  'Check-in': {
    actionLabel: 'Check-in',
    title: 'Confirmar Check-in',
    message: 'El huésped ingresará y se abrirá un folio para la estadía. ¿Continuar?',
    confirmLabel: 'Hacer Check-in',
    variant: 'default',
  },
  'Check-out': {
    actionLabel: 'Check-out',
    title: 'Confirmar Check-out',
    message: 'Se cerrará la estadía. Es un estado final y no se puede revertir. ¿Continuar?',
    confirmLabel: 'Hacer Check-out',
    variant: 'danger',
  },
  'Cancelada': {
    actionLabel: 'Cancelar reserva',
    title: 'Cancelar reserva',
    message: 'La reserva quedará cancelada. Es un estado final y no se puede revertir. ¿Continuar?',
    confirmLabel: 'Cancelar reserva',
    variant: 'danger',
  },
};

/** Copy (labels y mensajes) para la transición hacia `to`. */
export function getTransitionCopy(to: ReservaEstado): TransitionCopy {
  return TRANSITION_COPY[to];
}
