import React, { useState } from 'react';
import { Save } from 'lucide-react';
import { cajaService } from '../services/cajaService';
import { ModuleLayout } from '../components/ModuleLayout';
import { enfocarCampo } from '../utils/formFocus';
import type { Caja } from '../types/factura';

interface CajaFormProps {
  onCancel: () => void;
  onSaved: () => void;
  cajaToEdit: Caja | null;
  /** Establishments the user can create a caja in (only used when creating). */
  establecimientos: { id: number; nombre: string }[];
}

export default function CajaForm({ onCancel, onSaved, cajaToEdit, establecimientos }: CajaFormProps) {
  const isEditing = !!cajaToEdit;

  const [descripcion, setDescripcion] = useState(cajaToEdit?.descripcion_caja ?? '');
  const [fkEstablecimiento, setFkEstablecimiento] = useState(
    cajaToEdit?.fk_establecimientos?.toString() ?? (establecimientos.length === 1 ? String(establecimientos[0].id) : '')
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const desc = descripcion.trim();

    if (!desc) {
      setError('La descripción es requerida.');
      enfocarCampo('descripcion_caja');
      return;
    }
    if (!isEditing && !fkEstablecimiento) {
      setError('Debe seleccionar un establecimiento.');
      enfocarCampo('fk_establecimientos');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      if (cajaToEdit) {
        await cajaService.updateCaja(cajaToEdit.id_caja, { descripcion_caja: desc });
      } else {
        await cajaService.createCaja({
          descripcion_caja: desc,
          fk_establecimientos: parseInt(fkEstablecimiento),
        });
      }
      onSaved();
    } catch (err: any) {
      setError(err.message || 'Ocurrió un error al guardar la caja.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModuleLayout
      title={isEditing ? 'Editar Caja' : 'Nueva Caja'}
      description={isEditing ? `Modifica los datos de la caja #${cajaToEdit.nro_caja}` : 'Registra una nueva caja'}
      actions={
        <button onClick={onCancel} className="login-btn" style={{ width: 'auto', padding: '10px 20px', backgroundColor: 'transparent', border: '1px solid var(--glass-border)' }}>
          Volver
        </button>
      }
    >
      <div className="glass-panel" style={{ padding: '30px', maxWidth: '800px', margin: '0 auto' }}>
        {error && <div className="status-message status-error" style={{ marginBottom: '20px' }}>{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-grid">
            <div className="input-group">
              <label htmlFor="descripcion_caja">Descripción *</label>
              <input
                id="descripcion_caja"
                name="descripcion_caja"
                type="text"
                className="input-field"
                value={descripcion}
                onChange={(e) => { setDescripcion(e.target.value); setError(null); }}
                placeholder="Ej. Recepción principal"
                maxLength={100}
                required
              />
            </div>

            {!isEditing && establecimientos.length > 1 && (
              <div className="input-group">
                <label htmlFor="fk_establecimientos">Establecimiento *</label>
                <select
                  id="fk_establecimientos"
                  name="fk_establecimientos"
                  className="input-field"
                  value={fkEstablecimiento}
                  onChange={(e) => { setFkEstablecimiento(e.target.value); setError(null); }}
                  required
                  style={{ appearance: 'none' }}
                >
                  <option value="">Seleccione...</option>
                  {establecimientos.map(est => (
                    <option key={est.id} value={est.id} style={{ color: 'black' }}>
                      {est.nombre}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '15px', marginTop: '30px' }}>
            <button type="button" onClick={onCancel} className="login-btn" style={{ width: 'auto', background: 'transparent', border: '1px solid var(--glass-border)' }}>
              Cancelar
            </button>
            <button type="submit" className="login-btn" style={{ width: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }} disabled={loading}>
              <Save size={18} />
              {loading ? 'Guardando...' : 'Guardar Caja'}
            </button>
          </div>
        </form>
      </div>
    </ModuleLayout>
  );
}
