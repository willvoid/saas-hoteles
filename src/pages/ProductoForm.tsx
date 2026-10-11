import React, { useState, useEffect } from 'react';
import { ConceptoService } from '../services/conceptoService';
import { Save } from 'lucide-react';
import { ModuleLayout } from '../components/ModuleLayout';
import { enfocarCampo } from '../utils/formFocus';

interface ProductoFormProps {
  onCancel: () => void;
  /** Al crear (no editar), recibe la fila recién insertada. */
  onSaved: (createdConcepto?: any) => void;
  productoToEdit: any | null;
}

export default function ProductoForm({ onCancel, onSaved, productoToEdit }: ProductoFormProps) {
  const isEditing = !!productoToEdit;

  const [formData, setFormData] = useState({
    nombre: '',
    descripcion: '',
    arancel: '',
    fk_iva: '',
    fk_unidad_medida: '',
    estado: 'ACTIVO'
  });

  const [ivas, setIvas] = useState<any[]>([]);
  const [unidades, setUnidades] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchSelectData = async () => {
      try {
        const [ivasData, unidadesData] = await Promise.all([
          ConceptoService.getIvas(),
          ConceptoService.getUnidadesMedida()
        ]);
        setIvas(ivasData);
        setUnidades(unidadesData);
      } catch (err: any) {
        setError('Error al cargar opciones del formulario: ' + err.message);
      }
    };
    fetchSelectData();

    if (productoToEdit) {
      setFormData({
        nombre: productoToEdit.nombre || '',
        descripcion: productoToEdit.descripcion || '',
        arancel: productoToEdit.arancel?.toString() || '',
        fk_iva: productoToEdit.fk_iva?.toString() || '',
        fk_unidad_medida: productoToEdit.fk_unidad_medida?.toString() || '',
        estado: productoToEdit.estado || 'ACTIVO'
      });
    }
  }, [productoToEdit]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
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

    if (name === 'descripcion') {
      if (value.length > 150) {
        setError('La descripción permite un máximo de 150 caracteres.');
        return;
      }
      if (value.length > 0 && !/^[a-zA-ZáéíóúÁÉÍÓÚñÑ]/.test(value)) {
        setError('El primer carácter debe ser una letra.');
        return;
      }
      setFormData(prev => ({ ...prev, [name]: value }));
      return;
    }

    if (name === 'arancel') {
      if (/[^\d]/.test(value)) {
        setError('El precio solo puede contener números.');
        return;
      }
      if (value.length > 0 && value[0] === '0') {
        setError('El precio no puede empezar con 0.');
        return;
      }
      if (value.length > 9) {
        setError('El precio permite un máximo de 9 dígitos.');
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
      fallarEn('nombre', 'El nombre del producto es requerido.');
      return;
    }
    if (formData.nombre.trim().length < 3) {
      fallarEn('nombre', 'El nombre debe tener al menos 3 caracteres.');
      return;
    }
    if (!formData.descripcion.trim()) {
      fallarEn('descripcion', 'La descripción es requerida.');
      return;
    }
    if (!formData.arancel) {
      fallarEn('arancel', 'El precio es requerido.');
      return;
    }
    if (Number(formData.arancel) <= 0) {
      fallarEn('arancel', 'El precio debe ser mayor a cero.');
      return;
    }
    if (!formData.fk_iva) {
      fallarEn('fk_iva', 'Debe seleccionar el IVA.');
      return;
    }
    if (!formData.fk_unidad_medida) {
      fallarEn('fk_unidad_medida', 'Debe seleccionar la unidad de medida.');
      return;
    }
    if (!formData.estado) {
      fallarEn('estado', 'Debe seleccionar el estado.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const isDuplicate = await ConceptoService.checkNombre(
        formData.nombre.trim(),
        productoToEdit ? productoToEdit.id_concepto : undefined
      );

      if (isDuplicate) {
        fallarEn('nombre', 'Ya existe un producto con ese nombre.');
        setLoading(false);
        return;
      }

      const payload: any = {
        nombre: formData.nombre.trim(),
        descripcion: formData.descripcion.trim(),
        arancel: parseInt(formData.arancel),
        fk_iva: parseInt(formData.fk_iva),
        fk_unidad_medida: parseInt(formData.fk_unidad_medida),
        fk_servicio: null,
        estado: formData.estado
      };

      if (isEditing) {
        await ConceptoService.updateConcepto(productoToEdit.id_concepto, payload);
        onSaved();
      } else {
        const created = await ConceptoService.createConcepto(payload);
        onSaved(created?.[0]);
      }
    } catch (err: any) {
      setError(err.message || 'Ocurrió un error al guardar el producto.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModuleLayout
      title={isEditing ? 'Editar Producto/Servicio' : 'Nuevo Producto/Servicio'}
      description={isEditing ? `Modifica los datos de "${productoToEdit.nombre}"` : 'Registra un nuevo producto o servicio del catálogo'}
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
              <label htmlFor="nombre">Nombre *</label>
              <input
                id="nombre"
                name="nombre"
                type="text"
                className="input-field"
                value={formData.nombre}
                onChange={handleChange}
                placeholder="Ej. Desayuno buffet"
                required
              />
            </div>

            <div className="input-group span-2">
              <label htmlFor="descripcion">Descripción *</label>
              <textarea
                id="descripcion"
                name="descripcion"
                className="input-field"
                rows={3}
                value={formData.descripcion}
                onChange={handleChange}
                placeholder="Ej. Servicio de desayuno para huéspedes"
                required
              />
            </div>

            <div className="input-group">
              <label htmlFor="arancel">Precio Unitario (Gs.) *</label>
              <input
                id="arancel"
                name="arancel"
                type="text"
                inputMode="numeric"
                className="input-field"
                value={formData.arancel}
                onChange={handleChange}
                placeholder="Ej. 15000"
                required
              />
            </div>

            <div className="input-group">
              <label htmlFor="fk_iva">IVA *</label>
              <select
                id="fk_iva"
                name="fk_iva"
                className="input-field"
                value={formData.fk_iva}
                onChange={handleChange}
                required
                style={{ appearance: 'none' }}
              >
                <option value="">Seleccione...</option>
                {ivas.map(iva => (
                  <option key={iva.id_iva} value={iva.id_iva} style={{ color: 'black' }}>
                    {iva.descripcion} ({iva.valor}%)
                  </option>
                ))}
              </select>
            </div>

            <div className="input-group">
              <label htmlFor="fk_unidad_medida">Unidad de Medida *</label>
              <select
                id="fk_unidad_medida"
                name="fk_unidad_medida"
                className="input-field"
                value={formData.fk_unidad_medida}
                onChange={handleChange}
                required
                style={{ appearance: 'none' }}
              >
                <option value="">Seleccione...</option>
                {unidades.map(u => (
                  <option key={u.id_unidades} value={u.id_unidades} style={{ color: 'black' }}>
                    {u.descripcion}{u.representacion ? ` (${u.representacion})` : ''}
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
                <option value="ACTIVO" style={{ color: 'black' }}>Activo</option>
                <option value="INACTIVO" style={{ color: 'black' }}>Inactivo</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '15px', marginTop: '30px' }}>
            <button type="button" onClick={onCancel} className="login-btn" style={{ width: 'auto', background: 'transparent', border: '1px solid var(--glass-border)' }}>
              Cancelar
            </button>
            <button type="submit" className="login-btn" style={{ width: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }} disabled={loading}>
              <Save size={18} />
              {loading ? 'Guardando...' : 'Guardar Producto'}
            </button>
          </div>
        </form>
      </div>
    </ModuleLayout>
  );
}
