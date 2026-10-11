import { FACTURA_ESTADOS, type FacturaEstado } from '../types/factura';

// Punto único de entrada de la máquina de estados de una factura.
export { FACTURA_ESTADOS, type FacturaEstado };

/**
 * Máquina de estados: destinos válidos desde cada estado.
 * ANULADA es terminal. No hay reversión: una factura anulada no vuelve.
 */
const ALLOWED_TRANSITIONS: Record<FacturaEstado, FacturaEstado[]> = {
  'EMITIDA': ['ANULADA'],
  'ANULADA': [],
};

/** Estados que exigen confirmación explícita antes de aplicarse. */
export const CRITICAL_ESTADOS: FacturaEstado[] = ['ANULADA'];

/**
 * Normaliza un estado de la DB al valor canónico (case-insensitive). Devuelve
 * null si no matchea ningún estado conocido.
 */
export function toCanonicalEstado(
  estado: string | null | undefined,
): FacturaEstado | null {
  if (!estado) return null;
  const match = FACTURA_ESTADOS.find((e) => e.toLowerCase() === estado.toLowerCase());
  return match ?? null;
}

/** Destinos válidos desde `from` (para renderizar acciones). */
export function getAllowedTargets(from: string | null | undefined): FacturaEstado[] {
  const canonical = toCanonicalEstado(from);
  if (!canonical) return [];
  return ALLOWED_TRANSITIONS[canonical];
}

/**
 * True sólo si `from → to` es una transición permitida. `from === to` no es una
 * transición y devuelve false.
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
  actionLabel: string;
  title: string;
  message: string;
  confirmLabel: string;
  variant: 'default' | 'danger';
}

const TRANSITION_COPY: Record<FacturaEstado, TransitionCopy> = {
  'EMITIDA': {
    actionLabel: 'Emitir',
    title: 'Emitir factura',
    message: '¿Emitir esta factura?',
    confirmLabel: 'Emitir',
    variant: 'default',
  },
  'ANULADA': {
    actionLabel: 'Anular',
    title: 'Anular factura',
    message: 'La factura quedará anulada. Es un estado final y no se puede revertir. ¿Continuar?',
    confirmLabel: 'Anular factura',
    variant: 'danger',
  },
};

/** Copy (labels y mensajes) para la transición hacia `to`. */
export function getTransitionCopy(to: FacturaEstado): TransitionCopy {
  return TRANSITION_COPY[to];
}
