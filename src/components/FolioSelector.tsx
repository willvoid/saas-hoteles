import type { FolioCerradoItem } from '../types/factura';
import { formatGs } from '../utils/currency';
import '../index.css';

interface FolioSelectorProps {
  folios: FolioCerradoItem[];
  value: number | '';
  onChange: (idFolio: number | '') => void;
  loading?: boolean;
  /** Cuando no hay cliente elegido todavía: deshabilita el selector y muestra este texto. */
  disabledHint?: string;
}

/**
 * Selector de folios cerrados de un cliente puntual (presentación pura, sin
 * fetch propio — la página que lo usa carga la lista según el cliente elegido
 * y se la pasa por props, igual que AutocompleteClientes/AutocompleteConceptos).
 */
export default function FolioSelector({ folios, value, onChange, loading, disabledHint }: FolioSelectorProps) {
  const disabled = !!disabledHint || !!loading;

  return (
    <div className="input-group" style={{ marginBottom: 0 }}>
      <label htmlFor="folio-cerrado-select">Folio cerrado</label>
      <select
        id="folio-cerrado-select"
        className="input-field"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value ? Number(e.target.value) : '')}
      >
        <option value="">{loading ? 'Cargando…' : 'Seleccioná un folio…'}</option>
        {folios.map((f) => {
          const entrada = f.reserva?.fecha_entrada ? new Date(f.reserva.fecha_entrada).toLocaleDateString() : '';
          const salida = f.reserva?.fecha_salida ? new Date(f.reserva.fecha_salida).toLocaleDateString() : '';
          const rango = entrada && salida ? `${entrada} – ${salida}` : entrada || salida;
          return (
            <option key={f.id_folio} value={f.id_folio}>
              #{f.id_folio}{rango ? ` · ${rango}` : ''} · {formatGs(f.total_acumulado)}
            </option>
          );
        })}
      </select>
      {disabledHint && (
        <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 8 }}>{disabledHint}</p>
      )}
      {!disabledHint && !loading && folios.length === 0 && (
        <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 8 }}>
          Este cliente no tiene folios cerrados pendientes de facturar.
        </p>
      )}
    </div>
  );
}
