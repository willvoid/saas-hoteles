import { Modal } from './Modal';
import { formatGs } from '../utils/currency';
import { formatearMinutos } from '../utils/recargoHorario';
import { COLORS, tint } from '../constants/colors';

interface RecargoDialogProps {
  isOpen: boolean;
  title: string;
  /** Plain confirmation text shown when there is nothing to charge. */
  message: string;
  confirmLabel: string;
  variant?: 'default' | 'danger';
  /** "Late check-out" / "Early check-in": names the surcharge in the copy. */
  etiquetaRecargo: string;
  calculando: boolean;
  errorCalculo: string | null;
  errorEnvio: string | null;
  enviando: boolean;
  minutosExceso: number;
  montoSugerido: number;
  hayRecargo: boolean;
  montoTexto: string;
  exonerar: boolean;
  motivo: string;
  motivoRequerido: boolean;
  puedeConfirmar: boolean;
  onMontoChange: (texto: string) => void;
  onExonerarChange: (valor: boolean) => void;
  onMotivoChange: (texto: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Check-in / check-out confirmation. With nothing to charge it is the usual
 * confirmation; with a suggested surcharge it also lets reception accept,
 * edit or exonerate it (a reason is mandatory for the last two).
 * Presentational: all state and rules live in `useEstanciaConRecargo`.
 */
export function RecargoDialog({
  isOpen,
  title,
  message,
  confirmLabel,
  variant = 'default',
  etiquetaRecargo,
  calculando,
  errorCalculo,
  errorEnvio,
  enviando,
  minutosExceso,
  montoSugerido,
  hayRecargo,
  montoTexto,
  exonerar,
  motivo,
  motivoRequerido,
  puedeConfirmar,
  onMontoChange,
  onExonerarChange,
  onMotivoChange,
  onConfirm,
  onCancel,
}: RecargoDialogProps) {
  const dangerStyle =
    variant === 'danger' ? { color: COLORS.error, borderColor: tint('error', 0.4) } : undefined;
  const montoNumerico = Number(montoTexto) || 0;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onCancel}
      title={title}
      maxWidth={hayRecargo ? 480 : 440}
      footer={
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button className="btn-ghost" onClick={onCancel} disabled={enviando}>
            Cancelar
          </button>
          <button
            className={variant === 'danger' ? 'btn-ghost' : 'btn-primary-sm'}
            style={dangerStyle}
            onClick={onConfirm}
            disabled={!puedeConfirmar}
          >
            {enviando ? 'Procesando...' : confirmLabel}
          </button>
        </div>
      }
    >
      {calculando && (
        <p style={{ margin: 0, color: 'var(--text-secondary)' }}>Calculando recargo por horario...</p>
      )}

      {errorCalculo && (
        <div className="status-message status-error" style={{ marginBottom: 0 }}>
          {errorCalculo}
        </div>
      )}

      {!calculando && !errorCalculo && !hayRecargo && (
        <p style={{ margin: 0, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{message}</p>
      )}

      {!calculando && !errorCalculo && hayRecargo && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div
            style={{
              padding: '12px 14px',
              borderRadius: '10px',
              background: tint('warning', 0.1),
              border: `1px solid ${tint('warning', 0.3)}`,
              color: COLORS.warningLight,
              fontSize: '14px',
              lineHeight: 1.5,
            }}
          >
            {etiquetaRecargo}: {formatearMinutos(minutosExceso)} fuera del horario. Recargo sugerido:{' '}
            <strong>{formatGs(montoSugerido)}</strong>.
          </div>

          <div className="input-group" style={{ marginBottom: 0 }}>
            <label htmlFor="recargo-monto">Monto del recargo (Gs)</label>
            <input
              id="recargo-monto"
              type="text"
              inputMode="numeric"
              className="input-field"
              value={exonerar ? '0' : montoTexto}
              onChange={(e) => onMontoChange(e.target.value)}
              disabled={exonerar || enviando}
            />
            {!exonerar && (
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                Se cargará {formatGs(montoNumerico)} al folio.
              </span>
            )}
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={exonerar}
              onChange={(e) => onExonerarChange(e.target.checked)}
              disabled={enviando}
            />
            Exonerar el recargo (no cobrar)
          </label>

          <div className="input-group" style={{ marginBottom: 0 }}>
            <label htmlFor="recargo-motivo">Motivo{motivoRequerido ? ' *' : ' (opcional)'}</label>
            <textarea
              id="recargo-motivo"
              className="input-field"
              rows={3}
              value={motivo}
              onChange={(e) => onMotivoChange(e.target.value)}
              placeholder={
                motivoRequerido
                  ? 'Explicá por qué se modifica o exonera el recargo...'
                  : 'Solo hace falta si cambiás el monto o lo exonerás.'
              }
              disabled={enviando}
              style={{ resize: 'vertical' }}
            />
            {motivoRequerido && !motivo.trim() && (
              <span className="field-error">El motivo es obligatorio para modificar o exonerar el recargo.</span>
            )}
          </div>
        </div>
      )}

      {errorEnvio && (
        <div className="status-message status-error" style={{ marginTop: '16px', marginBottom: 0 }}>
          {errorEnvio}
        </div>
      )}
    </Modal>
  );
}
