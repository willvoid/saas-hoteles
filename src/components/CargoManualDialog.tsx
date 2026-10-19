import { Modal } from './Modal';
import AutocompleteConceptos from './AutocompleteConceptos';
import { formatGs } from '../utils/currency';
import type { OpcionHabitacionCargo } from '../utils/cargosPorHabitacion';

interface ConceptoOpcion {
  id_concepto: number;
  nombre: string;
  arancel?: number | null;
}

interface CargoManualDialogProps {
  isOpen: boolean;
  subtitulo: string;
  conceptos: ConceptoOpcion[];
  /**
   * Habitaciones a las que se puede atribuir el cargo (la primera, con
   * `idDetalle: null`, es "General de la reserva"). Vacío = sin selector.
   */
  opcionesHabitacion: OpcionHabitacionCargo[];
  /** Habitación elegida (`id_detalle`); null = general de la reserva. */
  fkDetalleReserva: number | null;
  fkConcepto: string | number;
  cantidad: string;
  precio: string;
  motivo: string;
  maxMotivo: number;
  total: number;
  guardando: boolean;
  puedeGuardar: boolean;
  error: string | null;
  onConceptoChange: (valor: string | number) => void;
  onHabitacionChange: (idDetalle: number | null) => void;
  onCantidadChange: (texto: string) => void;
  onPrecioChange: (texto: string) => void;
  onMotivoChange: (texto: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Free charge reception adds to an open folio: concept, quantity, unit price
 * and a mandatory reason, optionally attributed to one room of the
 * reservation. Presentational: rules live in `useCargoManual`.
 */
export function CargoManualDialog({
  isOpen,
  subtitulo,
  conceptos,
  opcionesHabitacion,
  fkDetalleReserva,
  fkConcepto,
  cantidad,
  precio,
  motivo,
  maxMotivo,
  total,
  guardando,
  puedeGuardar,
  error,
  onConceptoChange,
  onHabitacionChange,
  onCantidadChange,
  onPrecioChange,
  onMotivoChange,
  onConfirm,
  onCancel,
}: CargoManualDialogProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onCancel}
      title="Cargo manual"
      maxWidth={480}
      footer={
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button className="btn-ghost" onClick={onCancel} disabled={guardando}>
            Cancelar
          </button>
          <button className="btn-primary-sm" onClick={onConfirm} disabled={!puedeGuardar}>
            {guardando ? 'Guardando...' : 'Agregar cargo'}
          </button>
        </div>
      }
    >
      <p style={{ margin: '0 0 16px', fontSize: '13px', color: 'var(--text-secondary)' }}>{subtitulo}</p>

      {error && <div className="status-message status-error" style={{ marginBottom: '16px' }}>{error}</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div className="input-group" style={{ marginBottom: 0 }}>
          <label>Concepto *</label>
          <AutocompleteConceptos conceptos={conceptos} value={fkConcepto} onChange={onConceptoChange} lockOnSelect />
        </div>

        {opcionesHabitacion.length > 0 && (
          <div className="input-group" style={{ marginBottom: 0 }}>
            <label htmlFor="cargo-manual-habitacion">Habitación</label>
            <select
              id="cargo-manual-habitacion"
              className="input-field"
              value={fkDetalleReserva === null ? '' : String(fkDetalleReserva)}
              onChange={(e) => onHabitacionChange(e.target.value === '' ? null : Number(e.target.value))}
              disabled={guardando}
            >
              {opcionesHabitacion.map((o) => (
                <option key={o.idDetalle ?? 'general'} value={o.idDetalle === null ? '' : String(o.idDetalle)}>
                  {o.etiqueta}
                </option>
              ))}
            </select>
          </div>
        )}

        <div style={{ display: 'flex', gap: '14px' }}>
          <div className="input-group" style={{ marginBottom: 0, flex: '0 0 110px' }}>
            <label htmlFor="cargo-manual-cantidad">Cantidad *</label>
            <input
              id="cargo-manual-cantidad"
              type="text"
              inputMode="numeric"
              className="input-field"
              value={cantidad}
              onChange={(e) => onCantidadChange(e.target.value)}
              disabled={guardando}
            />
          </div>
          <div className="input-group" style={{ marginBottom: 0, flex: 1 }}>
            <label htmlFor="cargo-manual-precio">Precio unitario (Gs) *</label>
            <input
              id="cargo-manual-precio"
              type="text"
              inputMode="numeric"
              className="input-field"
              value={precio}
              onChange={(e) => onPrecioChange(e.target.value)}
              placeholder="Ej. 50000"
              disabled={guardando}
            />
          </div>
        </div>

        <div className="input-group" style={{ marginBottom: 0 }}>
          <label htmlFor="cargo-manual-motivo">Motivo *</label>
          <textarea
            id="cargo-manual-motivo"
            className="input-field"
            rows={3}
            value={motivo}
            onChange={(e) => onMotivoChange(e.target.value)}
            placeholder="Por qué se agrega este cargo..."
            disabled={guardando}
            style={{ resize: 'vertical' }}
          />
          <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
            {motivo.length}/{maxMotivo}
          </span>
        </div>

        <div style={{ textAlign: 'right', color: 'var(--text-secondary)' }}>
          Total del cargo: <strong style={{ color: 'var(--text-primary)' }}>{formatGs(total)}</strong>
        </div>
      </div>
    </Modal>
  );
}
