import React, { useState, useEffect } from 'react';
import { EdificioService } from '../services/edificioService';
import { Save } from 'lucide-react';
import { ModuleLayout } from '../components/ModuleLayout';
import { enfocarCampo } from '../utils/formFocus';

interface EdificioFormProps {
  onCancel: () => void;
  onSaved: () => void;
  edificioToEdit: any | null;
}

export default function EdificioForm({ onCancel, onSaved, edificioToEdit }: EdificioFormProps) {
  const isEditing = !!edificioToEdit;

  const [formData, setFormData] = useState({
    nombre: '',
    fk_sucursal: '',
    estado: 'Activo'
  });

  const [sucursales, setSucursales] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchSelectData = async () => {
      try {
        const sucursalesData = await EdificioService.getSucursales();
        setSucursales(sucursalesData);
      } catch (err: any) {
        setError('Error al cargar opciones del formulario: ' + err.message);
      }
    };
    fetchSelectData();

    if (edificioToEdit) {
      setFormData({
        nombre: edificioToEdit.nombre || '',
        fk_sucursal: edificioToEdit.fk_sucursal?.toString() || '',
        estado: edificioToEdit.estado || 'Activo'
      });
    }
  }, [edificioToEdit]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setError(null);

    if (name === 'nombre') {
      if (value.length > 50) {
        setError('El nombre permite un máximo de 50 caracteres.');
        return;
      }
      if (value.length > 0 && !/^[a-zA-ZáéíóúÁÉÍÓÚñÑ]/.test(value)) {
        setError('El primer carácter debe ser una letra.');
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

    if (!formData.nombre.trim()) {
      fallarEn('nombre', 'El nombre del edificio es requerido.');
      return;
    }
    if (formData.nombre.trim().length < 3) {
      fallarEn('nombre', 'El nombre debe tener al menos 3 caracteres.');
      return;
    }
    if (!formData.fk_sucursal) {
      fallarEn('fk_sucursal', 'Debe seleccionar un establecimiento.');
      return;
    }
    if (!formData.estado) {
      fallarEn('estado', 'Debe seleccionar el estado.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const isDuplicate = await EdificioService.checkNombre(
        formData.nombre.trim(),
        parseInt(formData.fk_sucursal),
        edificioToEdit ? edificioToEdit.id : undefined
      );

      if (isDuplicate) {
        fallarEn('nombre', 'Ya existe un edificio con ese nombre en el establecimiento seleccionado.');
        setLoading(false);
        return;
      }

      const payload: any = {
        nombre: formData.nombre.trim(),
        fk_sucursal: parseInt(formData.fk_sucursal),
        estado: formData.estado
      };

      if (isEditing) {
        await EdificioService.updateEdificio(edificioToEdit.id, payload);
      } else {
        await EdificioService.createEdificio(payload);
      }
      onSaved();
    } catch (err: any) {
      setError(err.message || 'Ocurrió un error al guardar el edificio.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModuleLayout
      title={isEditing ? 'Editar Edificio' : 'Nuevo Edificio'}
      description={isEditing ? `Modifica los datos del edificio "${edificioToEdit.nombre}"` : 'Registra un nuevo edificio asociado a un establecimiento'}
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
            <div className="input-group span-2">
              <label htmlFor="nombre">Nombre del Edificio *</label>
              <input
                id="nombre"
                name="nombre"
                type="text"
                className="input-field"
                value={formData.nombre}
                onChange={handleChange}
                placeholder="Ej. Torre Principal"
                required
              />
            </div>

            <div className="input-group">
              <label htmlFor="fk_sucursal">Establecimiento *</label>
              <select
                id="fk_sucursal"
                name="fk_sucursal"
                className="input-field"
                value={formData.fk_sucursal}
                onChange={handleChange}
                required
                style={{ appearance: 'none' }}
              >
                <option value="">Seleccione...</option>
                {sucursales.map(s => (
                  <option key={s.id_establecimiento} value={s.id_establecimiento} style={{ color: 'black' }}>
                    {s.denominacion}
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
              {loading ? 'Guardando...' : 'Guardar Edificio'}
            </button>
          </div>
        </form>
      </div>
    </ModuleLayout>
  );
}
