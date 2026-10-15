import type { ReactNode } from 'react';
import { Modal } from '../Modal';

interface ConfirmarAnulacionModalProps {
  isOpen: boolean;
  titulo: string;
  /** What is about to be annulled and its consequences. */
  children: ReactNode;
  /** Database message of a failed attempt, shown verbatim. */
  error: string | null;
  saving: boolean;
  onConfirm: () => void;
  onClose: () => void;
  confirmLabel?: string;
}

/** Confirmation dialog for annulling a ledger document. Ledger rows are never
 *  deleted; the refusal reasons (active payments, closed month) come from the
 *  database and are displayed as is. */
export function ConfirmarAnulacionModal({
  isOpen,
  titulo,
  children,
  error,
  saving,
  onConfirm,
  onClose,
  confirmLabel = 'Sí, anular',
}: ConfirmarAnulacionModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={titulo}>
      <div style={{ color: 'var(--text-primary)', fontSize: 15 }}>{children}</div>
      {error && (
        <div className="fin-error-box" role="alert" style={{ marginTop: 16 }}>
          {error}
        </div>
      )}
      <div className="fin-form-actions" style={{ marginTop: 20 }}>
        <button type="button" className="btn-ghost" onClick={onClose} disabled={saving}>
          Cancelar
        </button>
        <button type="button" className="btn-primary-sm fin-btn-danger" onClick={onConfirm} disabled={saving}>
          {saving ? 'Anulando…' : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
