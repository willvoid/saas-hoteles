import React, { useState, useEffect } from 'react';
import { PisoService } from '../services/pisoService';
import { Save } from 'lucide-react';
import { ModuleLayout } from '../components/ModuleLayout';
import { enfocarCampo } from '../utils/formFocus';

interface PisoFormProps {
  onCancel: () => void;
  onSaved: () => void;
  pisoToEdit: any | null;
}

export default function PisoForm({ onCancel, onSaved, pisoToEdit }: PisoFormProps) {
  const isEditing = !!pisoToEdit;

  const [formData, setFormData] = useState({
    numero: '',
    fk_edificio: '',
    estado: 'Activo'
  });

  const [edificios, setEdificios] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchSelectData = async () => {
      try {
        const edificiosData = await PisoService.getEdificios();
        setEdificios(edificiosData);
      } catch (err: any) {
        setError('Error al cargar opciones del formulario: ' + err.message);
      }
    };
    fetchSelectData();

    if (pisoToEdit) {
      setFormData({
        numero: pisoToEdit.numero?.toString() || '',
        fk_edificio: pisoToEdit.fk_edificio?.toString() || '',
        estado: pisoToEdit.estado || 'Activo'
      });
    }
  }, [pisoToEdit]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setError(null);

    if (name === 'numero') {
      if (/[^\d]/.test(value)) {
        setError('El número de piso solo puede contener números.');
        return;
      }
      if (value.length > 0 && value[0] === '0') {
        setError('El número de piso no puede empezar con 0.');
        return;
      }
      if (value.length > 3) {
        setError('El número de piso permite un máximo de 3 dígitos.');
        return;
      }
      setFormData(prev => ({ ...prev, [name]: value }));
      return;
    }

    setFormData(prev => ({ ...prev, [name]: value }));
  };

  /** Muestra el error y lleva la vista al campo que lo produjo. */
  const fallarEn = (campo: string, mensaje: string) => {
    setError(mensaje);
    enfocarCampo(campo);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.numero) {
      fallarEn('numero', 'El número de piso es requerido.');
      return;
    }
    if (Number(formData.numero) <= 0) {
      fallarEn('numero', 'El número de piso debe ser mayor a cero.');
      return;
    }
    if (!formData.fk_edificio) {
      fallarEn('fk_edificio', 'Debe seleccionar un edificio.');
      return;
    }
    if (!formData.estado) {
      fallarEn('estado', 'Debe seleccionar el estado.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const isDuplicate = await PisoService.checkNumero(
        parseInt(formData.numero),
        parseInt(formData.fk_edificio),
        pisoToEdit ? pisoToEdit.id : undefined
      );

      if (isDuplicate) {
        fallarEn('numero', 'Ya existe un piso con ese número en el edificio seleccionado.');
        setLoading(false);
        return;
      }

      const payload: any = {
        numero: parseInt(formData.numero),
        fk_edificio: parseInt(formData.fk_edificio),
        estado: formData.estado
      };

      if (isEditing) {
        await PisoService.updatePiso(pisoToEdit.id, payload);
      } else {
        await PisoService.createPiso(payload);
      }
      onSaved();
    } catch (err: any) {
      setError(err.message || 'Ocurrió un error al guardar el piso.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModuleLayout
      title={isEditing ? 'Editar Piso' : 'Nuevo Piso'}
      description={isEditing ? `Modifica los datos del piso #${pisoToEdit.numero}` : 'Registra un nuevo piso asociado a un edificio'}
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
              <label htmlFor="numero">Número de Piso *</label>
              <input
                id="numero"
                name="numero"
                type="text"
                inputMode="numeric"
                className="input-field"
                value={formData.numero}
                onChange={handleChange}
                placeholder="Ej. 3"
                required
              />
            </div>

            <div className="input-group">
              <label htmlFor="fk_edificio">Edificio *</label>
              <select
                id="fk_edificio"
                name="fk_edificio"
                className="input-field"
                value={formData.fk_edificio}
                onChange={handleChange}
                required
                style={{ appearance: 'none' }}
              >
                <option value="">Seleccione...</option>
                {edificios.map(ed => (
                  <option key={ed.id} value={ed.id} style={{ color: 'black' }}>
                    {ed.nombre}
                  </option>
                ))}
              </select>
            </div>

            <div className="input-group">
              <label htmlFor="estado">Estado *</label>
              <select
                id="estado"
                name="estado"
                className="input-field"
                value={formData.estado}
                onChange={handleChange}
                required
                style={{ appearance: 'none' }}
              >
                <option value="Activo" style={{ color: 'black' }}>Activo</option>
                <option value="Inactivo" style={{ color: 'black' }}>Inactivo</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '15px', marginTop: '30px' }}>
            <button type="button" onClick={onCancel} className="login-btn" style={{ width: 'auto', background: 'transparent', border: '1px solid var(--glass-border)' }}>
              Cancelar
            </button>
            <button type="submit" className="login-btn" style={{ width: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }} disabled={loading}>
              <Save size={18} />
              {loading ? 'Guardando...' : 'Guardar Piso'}
            </button>
          </div>
        </form>
      </div>
    </ModuleLayout>
  );
}
