import { useState } from 'react';
import { Save, Clock } from 'lucide-react';
import { formatGs } from '../utils/currency';
import {
  TOLERANCIAS_MIN,
  formatearMinutos,
  previewRecargo,
  type ConfigHorarios,
  type MetodoRecargo,
} from '../utils/recargoHorario';
import { COLORS, tint } from '../constants/colors';

interface ConfigHorariosFormProps {
  config: ConfigHorarios;
  /** False for roles that cannot write (RLS allows admin/gerente only). */
  canEdit: boolean;
  saving: boolean;
  dirty: boolean;
  error: string | null;
  success: string | null;
  onChange: (patch: Partial<ConfigHorarios>) => void;
  onSave: () => void;
}

const EJEMPLO_TARIFA = 300000;
const EJEMPLO_HORA_REAL = '13:00';

const radioRow: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' };

/**
 * "Horarios y recargos" settings of an establishment: normal check-in/out
 * hours, tolerance and surcharge method, with a live example card.
 * Presentational: loading and saving live in `useConfigHorarios`.
 */
export function ConfigHorariosForm({
  config,
  canEdit,
  saving,
  dirty,
  error,
  success,
  onChange,
  onSave,
}: ConfigHorariosFormProps) {
  // The example is illustrative only and is not persisted.
  const [tarifaEjemplo, setTarifaEjemplo] = useState(String(EJEMPLO_TARIFA));
  const [horaRealEjemplo, setHoraRealEjemplo] = useState(EJEMPLO_HORA_REAL);

  const deshabilitado = !canEdit || saving;
  const esPorcentaje = config.metodo_recargo === 'PORCENTAJE';
  const tolerancias = (TOLERANCIAS_MIN as readonly number[]).includes(config.tolerancia_min)
    ? [...TOLERANCIAS_MIN]
    : [...TOLERANCIAS_MIN, config.tolerancia_min].sort((a, b) => a - b);

  const tarifaNumerica = Number(tarifaEjemplo.replace(/[^\d]/g, '')) || 0;
  const ejemplo = previewRecargo(config, 'LATE_CHECKOUT', tarifaNumerica, horaRealEjemplo);

  const cambiarMetodo = (metodo: MetodoRecargo) => {
    if (metodo === config.metodo_recargo) return;
    // Each method has its own scale (% vs Gs/hour): start from a sensible value.
    onChange({ metodo_recargo: metodo, valor_recargo: metodo === 'PORCENTAJE' ? 25 : 20000 });
  };

  const onValorChange = (texto: string) => {
    const limpio = texto.replace(/[^\d.]/g, '');
    const numero = limpio === '' ? 0 : Number(limpio);
    onChange({ valor_recargo: Number.isFinite(numero) ? numero : 0 });
  };

  return (
    <div className="glass-panel" style={{ padding: '30px', maxWidth: '800px', margin: '0 auto' }}>
      {error && <div className="status-message status-error" style={{ marginBottom: '20px' }}>{error}</div>}
      {success && <div className="status-message status-success" style={{ marginBottom: '20px' }}>{success}</div>}
      {!canEdit && (
        <div className="status-message" style={{ marginBottom: '20px', color: 'var(--text-secondary)', border: '1px solid var(--glass-border)' }}>
          Solo un administrador o gerente puede modificar los horarios y recargos.
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (canEdit) onSave();
        }}
      >
        <div className="form-grid">
          <div className="input-group">
            <label htmlFor="hora_checkin">Hora normal de check-in</label>
            <input
              id="hora_checkin"
              type="time"
              className="input-field"
              value={config.hora_checkin}
              onChange={(e) => onChange({ hora_checkin: e.target.value })}
              disabled={deshabilitado}
            />
          </div>

          <div className="input-group">
            <label htmlFor="hora_checkout">Hora normal de check-out</label>
            <input
              id="hora_checkout"
              type="time"
              className="input-field"
              value={config.hora_checkout}
              onChange={(e) => onChange({ hora_checkout: e.target.value })}
              disabled={deshabilitado}
            />
          </div>

          <div className="input-group span-2">
            <label>Tolerancia antes de cobrar recargo</label>
            <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }} role="radiogroup" aria-label="Tolerancia">
              {tolerancias.map((min) => (
                <label key={min} style={radioRow}>
                  <input
                    type="radio"
                    name="tolerancia_min"
                    checked={config.tolerancia_min === min}
                    onChange={() => onChange({ tolerancia_min: min })}
                    disabled={deshabilitado}
                  />
                  {min === 0 ? 'Sin tolerancia' : formatearMinutos(min)}
                </label>
              ))}
            </div>
          </div>

          <div className="input-group span-2">
            <label>Cómo se calcula el recargo</label>
            <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }} role="radiogroup" aria-label="Método de recargo">
              <label style={radioRow}>
                <input
                  type="radio"
                  name="metodo_recargo"
                  checked={esPorcentaje}
                  onChange={() => cambiarMetodo('PORCENTAJE')}
                  disabled={deshabilitado}
                />
                Porcentaje de la tarifa por noche
              </label>
              <label style={radioRow}>
                <input
                  type="radio"
                  name="metodo_recargo"
                  checked={!esPorcentaje}
                  onChange={() => cambiarMetodo('FIJO_HORA')}
                  disabled={deshabilitado}
                />
                Importe fijo por hora
              </label>
            </div>
          </div>

          <div className="input-group span-2">
            <label htmlFor="valor_recargo">
              {esPorcentaje ? 'Porcentaje del recargo (%)' : 'Importe por hora (Gs)'}
            </label>
            <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
              {esPorcentaje && (
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={Math.min(100, config.valor_recargo)}
                  onChange={(e) => onChange({ valor_recargo: Number(e.target.value) })}
                  disabled={deshabilitado}
                  aria-label="Porcentaje del recargo"
                  style={{ flex: 1 }}
                />
              )}
              <input
                id="valor_recargo"
                type="text"
                inputMode="decimal"
                className="input-field"
                value={String(config.valor_recargo)}
                onChange={(e) => onValorChange(e.target.value)}
                disabled={deshabilitado}
                style={{ maxWidth: esPorcentaje ? '110px' : undefined }}
              />
            </div>
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              {esPorcentaje
                ? 'Se cobra una sola vez, sobre la tarifa por noche, si se pasa de la tolerancia.'
                : 'Se cuenta desde la hora normal, redondeando hacia arriba a horas completas.'}
            </span>
          </div>
        </div>

        {/* Live example */}
        <div
          style={{
            marginTop: '24px',
            padding: '18px 20px',
            borderRadius: '12px',
            background: tint('primary', 0.08),
            border: `1px solid ${tint('primary', 0.25)}`,
          }}
        >
          <h4 style={{ margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '15px' }}>
            <Clock size={16} color={COLORS.primaryLight} /> Ejemplo de late check-out
          </h4>
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '14px' }}>
            <div className="input-group" style={{ marginBottom: 0, flex: '1 1 140px' }}>
              <label htmlFor="ejemplo_tarifa">Tarifa por noche (Gs)</label>
              <input
                id="ejemplo_tarifa"
                type="text"
                inputMode="numeric"
                className="input-field"
                value={tarifaEjemplo}
                onChange={(e) => setTarifaEjemplo(e.target.value.replace(/[^\d]/g, ''))}
              />
            </div>
            <div className="input-group" style={{ marginBottom: 0, flex: '1 1 140px' }}>
              <label htmlFor="ejemplo_hora_prevista">Salida prevista</label>
              <input
                id="ejemplo_hora_prevista"
                type="time"
                className="input-field"
                value={config.hora_checkout}
                disabled
                readOnly
              />
            </div>
            <div className="input-group" style={{ marginBottom: 0, flex: '1 1 140px' }}>
              <label htmlFor="ejemplo_hora_real">Salida real</label>
              <input
                id="ejemplo_hora_real"
                type="time"
                className="input-field"
                value={horaRealEjemplo}
                onChange={(e) => setHoraRealEjemplo(e.target.value)}
              />
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: '8px' }}>
            <span style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
              {ejemplo.minutosExceso === 0
                ? 'Sale dentro del horario normal.'
                : ejemplo.monto === 0
                  ? `${formatearMinutos(ejemplo.minutosExceso)} de exceso, dentro de la tolerancia.`
                  : `${formatearMinutos(ejemplo.minutosExceso)} de exceso.`}
            </span>
            <span>
              Cargo calculado:{' '}
              <strong style={{ fontSize: '20px', color: ejemplo.monto > 0 ? COLORS.warning : COLORS.success }}>
                {formatGs(ejemplo.monto)}
              </strong>
            </span>
          </div>
        </div>

        {canEdit && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '15px', marginTop: '30px' }}>
            <button
              type="submit"
              className="login-btn"
              style={{ width: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}
              disabled={saving || !dirty}
            >
              <Save size={18} />
              {saving ? 'Guardando...' : 'Guardar horarios y recargos'}
            </button>
          </div>
        )}
      </form>
    </div>
  );
}
