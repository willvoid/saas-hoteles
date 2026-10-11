import React, { useState, useEffect } from 'react';
import { EstablecimientoService } from '../services/establecimientoService';
import { Save } from 'lucide-react';
import { ModuleLayout } from '../components/ModuleLayout';
import { PhoneField } from '../components/PhoneField';
import { separarTelefono, validarCodigoPais, validarNumero } from '../utils/telefono';
import { enfocarCampo } from '../utils/formFocus';

interface EstablecimientoFormProps {
  onCancel: () => void;
  onSaved: () => void;
  establecimientoToEdit: any | null;
  empresa: any | null;
}

const TEXT_FIELDS = ['denominacion', 'direccion', 'complemento_direccion_1', 'complemento_direccion_2'];

export default function EstablecimientoForm({ onCancel, onSaved, establecimientoToEdit, empresa }: EstablecimientoFormProps) {
  const isEditing = !!establecimientoToEdit;

  const [formData, setFormData] = useState({
    codigo_establecimiento: '',
    denominacion: '',
    direccion: '',
    numero_casa: '',
    complemento_direccion_1: '',
    complemento_direccion_2: '',
    telefono: '',
    email: '',
    fk_empresa: empresa?.id_empresa?.toString() || '',
    fk_barrio: '',
    estado_establecimiento: 'Activo'
  });

  const [barrios, setBarrios] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchSelectData = async () => {
      try {
        const barriosData = await EstablecimientoService.getBarrios();
        setBarrios(barriosData);
      } catch (err: any) {
        setError('Error al cargar opciones del formulario: ' + err.message);
      }
    };
    fetchSelectData();

    if (establecimientoToEdit) {
      setFormData({
        codigo_establecimiento: establecimientoToEdit.codigo_establecimiento || '',
        denominacion: establecimientoToEdit.denominacion || '',
        direccion: establecimientoToEdit.direccion || '',
        numero_casa: establecimientoToEdit.numero_casa || '',
        complemento_direccion_1: establecimientoToEdit.complemento_direccion_1 || '',
        complemento_direccion_2: establecimientoToEdit.complemento_direccion_2 || '',
        telefono: establecimientoToEdit.telefono || '',
        email: establecimientoToEdit.email || '',
        fk_empresa: establecimientoToEdit.fk_empresa?.toString() || empresa?.id_empresa?.toString() || '',
        fk_barrio: establecimientoToEdit.fk_barrio?.toString() || '',
        estado_establecimiento: establecimientoToEdit.estado_establecimiento || 'Activo'
      });
    } else if (empresa) {
      setFormData(prev => ({ ...prev, fk_empresa: empresa.id_empresa.toString() }));
    }
  }, [establecimientoToEdit, empresa]);

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

    if (name === 'codigo_establecimiento') {
      if (/[^\d]/.test(value)) {
        setError('El código de establecimiento solo puede contener números.');
        return;
      }
      if (value.length > 3) {
        setError('El código de establecimiento permite un máximo de 3 dígitos.');
        return;
      }
      setFormData(prev => ({ ...prev, [name]: value }));
      return;
    }

    if (name === 'numero_casa') {
      if (/[^\d]/.test(value)) {
        setError('El número de casa solo puede contener números.');
        return;
      }
      if (value.length > 0 && value[0] === '0') {
        setError('El número de casa no puede empezar con 0.');
        return;
      }
      if (value.length > 6) {
        setError('El número de casa permite un máximo de 6 dígitos.');
        return;
      }
      setFormData(prev => ({ ...prev, [name]: value }));
      return;
    }

    if (name === 'email') {
      if (value.length > 0 && value[0] === ' ') {
        setError('El correo no puede comenzar con un espacio.');
        return;
      }
      if (value.length > 50) {
        setError('El correo permite un máximo de 50 caracteres.');
        return;
      }
      setFormData(prev => ({ ...prev, [name]: value }));
      return;
    }

    setFormData(prev => ({ ...prev, [name]: value }));
  };

  /**
   * Muestra el error y lleva la vista al campo que lo produjo: el cartel está
   * arriba de todo y en este formulario no se ve sin scrollear.
   */
  const fallarEn = (campo: string, mensaje: string) => {
    setError(mensaje);
    enfocarCampo(campo);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.codigo_establecimiento.trim()) {
      fallarEn('codigo_establecimiento', 'El código de establecimiento es requerido.');
      return;
    }
    if (/^0+$/.test(formData.codigo_establecimiento)) {
      fallarEn('codigo_establecimiento', 'El código de establecimiento no puede ser 0, 00 ni 000.');
      return;
    }
    if (!formData.denominacion.trim()) {
      fallarEn('denominacion', 'La denominación es requerida.');
      return;
    }
    if (formData.denominacion.trim().length < 3) {
      fallarEn('denominacion', 'La denominación debe tener al menos 3 caracteres.');
      return;
    }
    if (!formData.direccion.trim()) {
      fallarEn('direccion', 'La dirección es requerida.');
      return;
    }
    if (!formData.numero_casa.trim()) {
      fallarEn('numero_casa', 'El número de casa es requerido.');
      return;
    }
    if (formData.numero_casa.length < 3 || formData.numero_casa.length > 6) {
      fallarEn('numero_casa', 'El número de casa debe tener entre 3 y 6 dígitos.');
      return;
    }
    if (!formData.complemento_direccion_1.trim()) {
      fallarEn('complemento_direccion_1', 'El complemento de dirección 1 es requerido.');
      return;
    }
    const { codigo: codigoTel, numero: numeroTel } = separarTelefono(formData.telefono, 'fijo');
    const telefonoError =
      validarCodigoPais(codigoTel, numeroTel) || validarNumero(numeroTel, codigoTel, 'fijo');
    if (telefonoError) {
      fallarEn('telefono', `Teléfono: ${telefonoError}`);
      return;
    }
    if (formData.email && !/^\S+@\S+\.\S+$/.test(formData.email)) {
      fallarEn('email', 'Ingresa un correo electrónico válido.');
      return;
    }
    if (!formData.fk_empresa) {
      fallarEn('fk_empresa', 'Debe seleccionar una empresa.');
      return;
    }
    if (!formData.fk_barrio) {
      fallarEn('fk_barrio', 'Debe seleccionar un barrio.');
      return;
    }
    if (!formData.estado_establecimiento) {
      fallarEn('estado_establecimiento', 'Debe seleccionar el estado.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const isDuplicate = await EstablecimientoService.checkCodigo(
        formData.codigo_establecimiento.trim(),
        establecimientoToEdit ? establecimientoToEdit.id_establecimiento : undefined
      );

      if (isDuplicate) {
        fallarEn('codigo_establecimiento', 'Ya existe un establecimiento con ese código.');
        setLoading(false);
        return;
      }

      const payload: any = {
        codigo_establecimiento: formData.codigo_establecimiento.trim(),
        denominacion: formData.denominacion.trim(),
        direccion: formData.direccion.trim(),
        numero_casa: formData.numero_casa.trim(),
        complemento_direccion_1: formData.complemento_direccion_1.trim(),
        complemento_direccion_2: formData.complemento_direccion_2.trim() || null,
        telefono: formData.telefono.trim() || null,
        email: formData.email.trim() || null,
        fk_empresa: parseInt(formData.fk_empresa),
        fk_barrio: parseInt(formData.fk_barrio),
        estado_establecimiento: formData.estado_establecimiento
      };

      if (isEditing) {
        await EstablecimientoService.updateEstablecimiento(establecimientoToEdit.id_establecimiento, payload);
      } else {
        await EstablecimientoService.createEstablecimiento(payload);
      }
      onSaved();
    } catch (err: any) {
      setError(err.message || 'Ocurrió un error al guardar el establecimiento.');
    } finally {
      setLoading(false);
    }
  };

  if (!empresa) {
    return (
      <ModuleLayout
        title="Establecimiento"
        description="Debes cargar primero los datos de la empresa"
        actions={
          <button onClick={onCancel} className="login-btn" style={{ width: 'auto', padding: '10px 20px', backgroundColor: 'transparent', border: '1px solid var(--glass-border)' }}>
            Volver
          </button>
        }
      >
        <div className="status-message status-error" style={{ margin: '20px' }}>
          No hay datos de empresa registrados. Carga primero la empresa desde "Gestión de Empresa".
        </div>
      </ModuleLayout>
    );
  }

  return (
    <ModuleLayout
      title={isEditing ? 'Editar Establecimiento' : 'Nuevo Establecimiento'}
      description={isEditing ? `Modifica los datos del establecimiento "${establecimientoToEdit.denominacion}"` : 'Registra los datos del establecimiento'}
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
              <label htmlFor="codigo_establecimiento">Código de Establecimiento *</label>
              <input
                id="codigo_establecimiento"
                name="codigo_establecimiento"
                type="text"
                className="input-field"
                value={formData.codigo_establecimiento}
                onChange={handleChange}
                placeholder="Ej. 001"
                required
              />
            </div>

            <div className="input-group">
              <label htmlFor="denominacion">Denominación *</label>
              <input
                id="denominacion"
                name="denominacion"
                type="text"
                className="input-field"
                value={formData.denominacion}
                onChange={handleChange}
                placeholder="Ej. Casa Central"
                required
              />
            </div>

            <div className="input-group">
              <label htmlFor="fk_empresa">Empresa</label>
              <input
                id="fk_empresa"
                type="text"
                className="input-field"
                value={empresa ? `${empresa.razon_social}${empresa.nombre_fantasia ? ` (${empresa.nombre_fantasia})` : ''}` : ''}
                disabled
              />
            </div>

            <div className="input-group">
              <label htmlFor="fk_barrio">Barrio *</label>
              <select
                id="fk_barrio"
                name="fk_barrio"
                className="input-field"
                value={formData.fk_barrio}
                onChange={handleChange}
                required
                style={{ appearance: 'none' }}
              >
                <option value="">Seleccione...</option>
                {barrios.map(b => (
                  <option key={b.cod_barrio} value={b.cod_barrio} style={{ color: 'black' }}>
                    {b.nombre_barrio}
                  </option>
                ))}
              </select>
            </div>

            <div className="input-group">
              <label htmlFor="direccion">Dirección *</label>
              <input
                id="direccion"
                name="direccion"
                type="text"
                className="input-field"
                value={formData.direccion}
                onChange={handleChange}
                placeholder="Ej. Av. Mariscal López"
                required
              />
            </div>

            <div className="input-group">
              <label htmlFor="numero_casa">Número de Casa *</label>
              <input
                id="numero_casa"
                name="numero_casa"
                type="text"
                inputMode="numeric"
                className="input-field"
                value={formData.numero_casa}
                onChange={handleChange}
                placeholder="Ej. 1234"
                required
              />
            </div>

            <div className="input-group">
              <label htmlFor="complemento_direccion_1">Complemento de Dirección 1 *</label>
              <input
                id="complemento_direccion_1"
                name="complemento_direccion_1"
                type="text"
                className="input-field"
                value={formData.complemento_direccion_1}
                onChange={handleChange}
                placeholder="Ej. entre calles X e Y"
                required
              />
            </div>

            <div className="input-group">
              <label htmlFor="complemento_direccion_2">Complemento de Dirección 2</label>
              <input
                id="complemento_direccion_2"
                name="complemento_direccion_2"
                type="text"
                className="input-field"
                value={formData.complemento_direccion_2}
                onChange={handleChange}
                placeholder="Opcional"
              />
            </div>

            <PhoneField
              id="telefono"
              label="Teléfono"
              modo="fijo"
              value={formData.telefono}
              onChange={(v) => setFormData(prev => ({ ...prev, telefono: v }))}
            />

            <div className="input-group">
              <label htmlFor="email">Correo Electrónico</label>
              <input
                id="email"
                name="email"
                type="email"
                className="input-field"
                value={formData.email}
                onChange={handleChange}
                placeholder="Ej. central@hotel.com"
              />
            </div>

            <div className="input-group">
              <label htmlFor="estado_establecimiento">Estado *</label>
              <select
                id="estado_establecimiento"
                name="estado_establecimiento"
                className="input-field"
                value={formData.estado_establecimiento}
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
              {loading ? 'Guardando...' : 'Guardar Establecimiento'}
            </button>
          </div>
        </form>
      </div>
    </ModuleLayout>
  );
}
