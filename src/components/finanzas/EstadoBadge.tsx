import type { CSSProperties } from 'react';
import { COLORS } from '../../constants/colors';

interface EstadoBadgeProps {
  etiqueta: string;
  color?: string;
}

/** Pill with a status label, same look as the other lists (`status-badge`). */
export function EstadoBadge({ etiqueta, color = COLORS.textSecondary }: EstadoBadgeProps) {
  return (
    <span className="status-badge" style={{ '--badge-color': color } as CSSProperties}>
      {etiqueta}
    </span>
  );
}

/** Badge for `estado` of ledger documents (REGISTRADO / ANULADO). */
export function EstadoDocumentoBadge({ estado }: { estado: string }) {
  const anulado = estado === 'ANULADO';
  return (
    <EstadoBadge
      etiqueta={anulado ? 'Anulado' : 'Registrado'}
      color={anulado ? COLORS.error : COLORS.success}
    />
  );
}

/** Badge for the `activo` flag of catalog rows. */
export function ActivoBadge({ activo }: { activo: boolean }) {
  return (
    <EstadoBadge etiqueta={activo ? 'Activo' : 'Inactivo'} color={activo ? COLORS.success : COLORS.error} />
  );
}
