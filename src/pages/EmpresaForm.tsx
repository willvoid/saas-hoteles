import React, { useState, useEffect } from 'react';
import { EmpresaService } from '../services/empresaService';
import { Save } from 'lucide-react';
import { ModuleLayout } from '../components/ModuleLayout';
import { enfocarCampo } from '../utils/formFocus';

interface EmpresaFormProps {
  onCancel: () => void;
  onSaved: () => void;
  empresaToEdit: any | null;
}

const TEXT_FIELDS = ['razon_social', 'nombre_fantasia'];

export default function EmpresaForm({ onCancel, onSaved, empresaToEdit }: EmpresaFormProps) {
  const isEditing = !!empresaToEdit;

  const [formData, setFormData] = useState({
    razon_social: '',
    nombre_fantasia: '',
    ruc: '',
    fk_contribuyente: '',
    fk_regimen: '',
    estado: 'Activo'
  });

  const [tiposContribuyente, setTiposContribuyente] = useState<any[]>([]);
  const [tiposRegimen, setTiposRegimen] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchSelectData = async () => {
      try {
        const [contribuyentesData, regimenesData] = await Promise.all([
          EmpresaService.getTiposContribuyente(),
          EmpresaService.getTiposRegimen()
        ]);
        setTiposContribuyente(contribuyentesData);
        setTiposRegimen(regimenesData);
      } catch (err: any) {
        setError('Error al cargar opciones del formulario: ' + err.message);
      }
    };
    fetchSelectData();

    if (empresaToEdit) {
      setFormData({
        razon_social: empresaToEdit.razon_social || '',
        nombre_fantasia: empresaToEdit.nombre_fantasia || '',
        ruc: empresaToEdit.ruc || '',
        fk_contribuyente: empresaToEdit.fk_contribuyente?.toString() || '',
        fk_regimen: empresaToEdit.fk_regimen?.toString() || '',
        estado: empresaToEdit.estado || 'Activo'
      });
    }
  }, [empresaToEdit]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setError(null);

    if (TEXT_FIELDS.includes(name)) {
      if (value.length > 50) {
        setError('Este campo permite un máximo de 50 caracteres.');
        return;
      }
      if (value.length > 0 && !/^[a-zA-ZáéíóúÁÉÍÓÚñÑ]/.test(value)) {
        setError('El primer carácter debe ser una letra.');
        return;
      }
      setFormData(prev => ({ ...prev, [name]: value }));
      return;
    }

    if (name === 'ruc') {
      if (/[^0-9kK-]/.test(value)) {
        setError('El RUC solo puede contener números, la letra K y un guión (-).');
        return;
      }
      if (value.length > 12) {
        setError('El RUC permite un máximo de 12 caracteres.');
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

    if (!formData.razon_social.trim()) {
      fallarEn('razon_social', 'La razón social es requerida.');
      return;
    }
    if (formData.razon_social.trim().length < 3) {
      fallarEn('razon_social', 'La razón social debe tener al menos 3 caracteres.');
      return;
    }
    if (!formData.nombre_fantasia.trim()) {
      fallarEn('nombre_fantasia', 'El nombre de fantasía es requerido.');
      return;
    }
    if (formData.nombre_fantasia.trim().length < 2) {
      fallarEn('nombre_fantasia', 'El nombre de fantasía debe tener al menos 2 caracteres.');
      return;
    }
    if (!formData.ruc.trim()) {
      fallarEn('ruc', 'El RUC es requerido.');
      return;
    }
    if (!formData.ruc.includes('-')) {
      fallarEn('ruc', 'El RUC debe contener un guión (-). Ej. 80012345-6');
      return;
    }
    if (!/^[0-9]+-[0-9kK]$/.test(formData.ruc)) {
      fallarEn('ruc', 'Formato de RUC inválido. Ej. 80012345-6');
      return;
    }
    if (!formData.fk_contribuyente) {
      fallarEn('fk_contribuyente', 'Debe seleccionar el tipo de contribuyente.');
      return;
    }
    if (!formData.fk_regimen) {
      fallarEn('fk_regimen', 'Debe seleccionar el régimen tributario.');
      return;
    }
    if (!formData.estado) {
      fallarEn('estado', 'Debe seleccionar el estado.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const isDuplicate = await EmpresaService.checkRuc(
        formData.ruc.trim(),
        empresaToEdit ? empresaToEdit.id_empresa : undefined
      );

      if (isDuplicate) {
        fallarEn('ruc', 'Ya existe una empresa registrada con ese RUC.');
        setLoading(false);
        return;
      }

      const payload: any = {
        razon_social: formData.razon_social.trim(),
        nombre_fantasia: formData.nombre_fantasia.trim(),
        ruc: formData.ruc.trim(),
        fk_contribuyente: parseInt(formData.fk_contribuyente),
        fk_regimen: parseInt(formData.fk_regimen),
        estado: formData.estado
      };

      if (isEditing) {
        await EmpresaService.updateEmpresa(empresaToEdit.id_empresa, payload);
      } else {
        await EmpresaService.createEmpresa(payload);
      }
      onSaved();
    } catch (err: any) {
      setError(err.message || 'Ocurrió un error al guardar la empresa.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModuleLayout
      title={isEditing ? 'Editar Empresa' : 'Nueva Empresa'}
      description={isEditing ? `Modifica los datos de la empresa "${empresaToEdit.razon_social}"` : 'Registra los datos de la empresa con su información tributaria'}
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
              <label htmlFor="razon_social">Razón Social *</label>
              <input
                id="razon_social"
                name="razon_social"
                type="text"
                className="input-field"
                value={formData.razon_social}
                onChange={handleChange}
                placeholder="Ej. Hotelería San Martín S.A."
                required
              />
            </div>

            <div className="input-group">
              <label htmlFor="nombre_fantasia">Nombre de Fantasía *</label>
              <input
                id="nombre_fantasia"
                name="nombre_fantasia"
                type="text"
                className="input-field"
                value={formData.nombre_fantasia}
                onChange={handleChange}
                placeholder="Ej. Hotel San Martín"
                required
              />
            </div>

            <div className="input-group">
              <label htmlFor="ruc">RUC *</label>
              <input
                id="ruc"
                name="ruc"
                type="text"
                className="input-field"
                value={formData.ruc}
                onChange={handleChange}
                placeholder="Ej. 80012345-6"
                required
              />
            </div>

            <div className="input-group">
              <label htmlFor="fk_contribuyente">Tipo de Contribuyente *</label>
              <select
                id="fk_contribuyente"
                name="fk_contribuyente"
                className="input-field"
                value={formData.fk_contribuyente}
                onChange={handleChange}
                required
                style={{ appearance: 'none' }}
              >
                <option value="">Seleccione...</option>
                {tiposContribuyente.map(tc => (
                  <option key={tc.id_tipo_contribuyente} value={tc.id_tipo_contribuyente} style={{ color: 'black' }}>
                    {tc.descripcion}
                  </option>
                ))}
              </select>
            </div>

            <div className="input-group">
              <label htmlFor="fk_regimen">Régimen Tributario *</label>
              <select
                id="fk_regimen"
                name="fk_regimen"
                className="input-field"
                value={formData.fk_regimen}
                onChange={handleChange}
                required
                style={{ appearance: 'none' }}
              >
                <option value="">Seleccione...</option>
                {tiposRegimen.map(tr => (
                  <option key={tr.id_regimen} value={tr.id_regimen} style={{ color: 'black' }}>
                    {tr.descripcion}
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
              {loading ? 'Guardando...' : 'Guardar Empresa'}
            </button>
          </div>
        </form>
      </div>
    </ModuleLayout>
  );
}
