import { useState, useEffect } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import type { Tables } from '../types/supabase';
import { adminCreateUser } from '../services/authService';
import { UsuarioService } from '../services/usuarioService';
import { useSelectOptions } from '../hooks/useSelectOptions';
import { Save } from 'lucide-react';
import { ModuleLayout } from '../components/ModuleLayout';
import { normalizeRole, canAssignAdminRole } from '../utils/permissions';
import { PhoneField } from '../components/PhoneField';
import { separarTelefono, validarCodigoPais, validarNumero } from '../utils/telefono';
import { enfocarPrimerError } from '../utils/formFocus';

interface UsuarioFormProps {
  onCancel: () => void;
  onSaved: () => void;
  usuarioToEdit: Tables<'usuario'> | null;
  /** Cargo de quien está editando: define si puede asignar el cargo ADMIN. */
  currentUser?: { cargo?: string | null } | null;
}

/** Orden en pantalla, para llevar el foco al primer campo que falle. */
const ORDEN_CAMPOS = [
  'nombre',
  'correo',
  'fk_tipo_doc',
  'documento',
  'telefono',
  'fk_cargo',
  'usuario',
  'clave',
  'confirmarClave',
] as const;

interface UsuarioFormData {
  documento: string;
  nombre: string;
  correo: string;
  telefono: string;
  usuario: string;
  clave: string;
  confirmarClave: string;
  fk_tipo_doc: string;
  fk_cargo: string;
}

export default function UsuarioForm({ onCancel, onSaved, usuarioToEdit, currentUser }: UsuarioFormProps) {
  const isEditing = !!usuarioToEdit;
  const puedeAsignarAdmin = canAssignAdminRole(normalizeRole(currentUser?.cargo));

  const [formData, setFormData] = useState<UsuarioFormData>({
    documento: '',
    nombre: '',
    correo: '',
    telefono: '',
    usuario: '',
    clave: '',
    confirmarClave: '',
    fk_tipo_doc: '',
    fk_cargo: ''
  });

  const { tiposDoc, cargos, error: optionsError } = useSelectOptions();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (usuarioToEdit) {
      setFormData({
        documento: usuarioToEdit.documento || '',
        nombre: usuarioToEdit.nombre || '',
        correo: usuarioToEdit.correo || '',
        telefono: usuarioToEdit.telefono || '',
        usuario: usuarioToEdit.usuario || '',
        clave: '',
        confirmarClave: '',
        fk_tipo_doc: usuarioToEdit.fk_tipo_doc?.toString() || '',
        fk_cargo: usuarioToEdit.fk_cargo?.toString() || ''
      });
    }
  }, [usuarioToEdit]);

  const validateField = (name: string, value: string, currentData: UsuarioFormData): string => {
    const requiredAlways = ['nombre', 'correo', 'documento', 'usuario', 'fk_tipo_doc', 'fk_cargo'];
    if (requiredAlways.includes(name) && !value) {
      return 'Este campo es obligatorio.';
    }

    // En edición la clave es opcional (vacía = mantener la actual)
    if (['clave', 'confirmarClave'].includes(name) && !value) {
      if (!isEditing) return 'Este campo es obligatorio.';
      return '';
    }

    switch (name) {
      case 'nombre':
        if (value.trim().length < 3) {
          return 'El nombre debe tener al menos 3 caracteres.';
        }
        if (!/^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ ]+$/.test(value)) {
          return 'El nombre solo puede contener letras y espacios.';
        }
        break;
      case 'correo':
        // Exige parte local y dominio que empiecen/terminen en alfanumérico, y un TLD de al menos 2 letras
        if (!/^[a-zA-Z0-9]([a-zA-Z0-9._+-]*[a-zA-Z0-9])?@[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z]{2,})+$/.test(value)) {
          return 'Ingresa un correo electrónico válido (ej. juan@hotel.com).';
        }
        break;
      case 'usuario':
        if (value.length < 4) {
          return 'El nombre de usuario debe tener al menos 4 caracteres.';
        }
        if (!/^[a-zA-Z0-9_]+$/.test(value)) {
          return 'El usuario solo puede contener letras, números y guión bajo (_).';
        }
        break;
      case 'documento': {
        const tipoDoc = String(currentData.fk_tipo_doc);
        if (tipoDoc === '2') {
          if (!value.includes('-')) {
            return 'El RUC debe contener un guión (-).';
          }
          if (!/^[0-9-]+$/.test(value)) {
            return 'El RUC solo puede contener números y un guión (-).';
          }
        } else {
          if (!/^\d+$/.test(value)) {
            return 'El documento solo puede contener números (sin espacios ni guiones).';
          }
        }
        if (value.length < 5 || value.length > 15) {
          return 'El documento debe tener entre 5 y 15 caracteres.';
        }
        break;
      }
      case 'telefono': {
        if (!value.trim()) break;
        const { codigo, numero } = separarTelefono(value, 'celular');
        return validarCodigoPais(codigo, numero) || validarNumero(numero, codigo, 'celular');
      }
      case 'clave':
        if (/\s/.test(value)) {
          return 'La contraseña no puede contener espacios.';
        }
        if (value.length < 8) {
          return 'La contraseña debe tener al menos 8 caracteres.';
        }
        if (!/[a-zA-Z]/.test(value) || !/\d/.test(value)) {
          return 'La contraseña debe incluir al menos una letra y un número.';
        }
        break;
      case 'confirmarClave':
        if (value !== currentData.clave) {
          return 'Las contraseñas no coinciden.';
        }
        break;
      default:
        break;
    }
    return '';
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setError(null);

    // Bloqueo de caracteres inválidos en vivo (mismo patrón que Gestión de Habitaciones)
    if (name === 'nombre') {
      if (/[^a-zA-ZáéíóúÁÉÍÓÚñÑüÜ ]/.test(value)) {
        setError('El nombre solo puede contener letras y espacios.');
        return;
      }
      if (value.length > 0 && !/^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ]/.test(value)) {
        setError('El primer carácter debe ser una letra.');
        return;
      }
      if (/ {2}/.test(value)) {
        setError('El nombre no puede tener dos espacios seguidos.');
        return;
      }
      if (value.length > 60) {
        setError('El nombre permite un máximo de 60 caracteres.');
        return;
      }
    }

    if (name === 'correo') {
      if (/\s/.test(value)) {
        setError('El correo no puede contener espacios.');
        return;
      }
      if (/[^a-zA-Z0-9@._+-]/.test(value)) {
        setError('El correo contiene caracteres no permitidos.');
        return;
      }
      if (value.length > 0 && !/^[a-zA-Z0-9]/.test(value)) {
        setError('El correo debe comenzar con una letra o un número.');
        return;
      }
      if ((value.match(/@/g) || []).length > 1) {
        setError('El correo solo puede contener un @.');
        return;
      }
      if (/\.\./.test(value)) {
        setError('El correo no puede tener dos puntos seguidos.');
        return;
      }
      if (/@\./.test(value) || /\.@/.test(value)) {
        setError('El correo no puede tener un punto pegado al @.');
        return;
      }
      if (value.length > 100) {
        setError('El correo permite un máximo de 100 caracteres.');
        return;
      }
    }

    if (name === 'documento') {
      const tipoDoc = String(formData.fk_tipo_doc);
      if (tipoDoc === '2') {
        if (/[^0-9-]/.test(value)) {
          setError('El RUC solo puede contener números y un guión (-).');
          return;
        }
      } else if (/[^\d]/.test(value)) {
        setError('El documento solo puede contener números.');
        return;
      }
      if (value.length > 15) {
        setError('El documento permite un máximo de 15 caracteres.');
        return;
      }
    }

    if (name === 'usuario') {
      if (/[^a-zA-Z0-9_]/.test(value)) {
        setError('El usuario solo puede contener letras, números y guión bajo (_).');
        return;
      }
      if (value.length > 20) {
        setError('El nombre de usuario permite un máximo de 20 caracteres.');
        return;
      }
    }

    if (name === 'clave' || name === 'confirmarClave') {
      if (/\s/.test(value)) {
        setError('La contraseña no puede contener espacios.');
        return;
      }
      if (value.length > 72) {
        setError('La contraseña permite un máximo de 72 caracteres.');
        return;
      }
    }

    commitField(name, value);
  };

  /** Guarda un campo ya validado en el tipeo y refresca sus errores. */
  const commitField = (name: string, value: string) => {
    const newData = { ...formData, [name]: value };
    setFormData(newData);

    const updatedErrors: Record<string, string> = {
      ...fieldErrors,
      [name]: validateField(name, value, newData),
    };
    if (name === 'fk_tipo_doc' && newData.documento) {
      updatedErrors.documento = validateField('documento', newData.documento, newData);
    }
    if (name === 'clave' && newData.confirmarClave) {
      updatedErrors.confirmarClave = validateField('confirmarClave', newData.confirmarClave, newData);
    }
    setFieldErrors(updatedErrors);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // Validar todos los campos antes de enviar
    const newErrors: Record<string, string> = {};
    Object.keys(formData).forEach(key => {
      const typedKey = key as keyof typeof formData;
      const err = validateField(typedKey, formData[typedKey], formData);
      if (err) newErrors[key] = err;
    });

    // Si en edición se cargó solo una de las dos claves, exigir la otra
    if (isEditing && formData.clave && !formData.confirmarClave) {
      newErrors.confirmarClave = 'Debes confirmar la nueva contraseña.';
    }
    if (isEditing && !formData.clave && formData.confirmarClave) {
      newErrors.clave = 'Debes ingresar la nueva contraseña.';
    }

    // Sólo un ADMIN puede asignar el cargo de administrador (a otro o a sí
    // mismo). El select ya lo oculta; esto cubre el envío manipulado.
    if (!puedeAsignarAdmin && formData.fk_cargo) {
      const cargoElegido = cargos.find(c => c.id_cargo.toString() === formData.fk_cargo);
      if (normalizeRole(cargoElegido?.cargo) === 'admin') {
        newErrors.fk_cargo = 'Sólo un administrador puede asignar el cargo de administrador.';
      }
    }

    setFieldErrors(newErrors);

    if (Object.values(newErrors).some(err => err !== '')) {
      setError('Por favor corrige los errores en el formulario.');
      enfocarPrimerError(newErrors, ORDEN_CAMPOS);
      setLoading(false);
      return;
    }

    try {
      if (isEditing) {
        const isDuplicate = await UsuarioService.checkDuplicado(
          formData.correo.trim(),
          formData.usuario.trim(),
          usuarioToEdit.id_usuario
        );

        if (isDuplicate) {
          setError('El correo o el nombre de usuario ya están en uso.');
          setLoading(false);
          return;
        }

        // Editing only touches the profile; credentials live in Supabase Auth.
        // Changing another user's password is not handled here.
        await UsuarioService.updateUsuario(usuarioToEdit.id_usuario, {
          documento: formData.documento.trim(),
          nombre: formData.nombre.trim(),
          telefono: formData.telefono.trim() || null,
          usuario: formData.usuario.trim(),
          fk_tipo_doc: parseInt(formData.fk_tipo_doc),
          fk_cargo: parseInt(formData.fk_cargo),
        });
      } else {
        // Creating a staff account needs the service_role Admin API, which
        // can't run in the browser -> delegate to the admin-create-user
        // Edge Function. The handle_new_user trigger creates the profile.
        const { data, error: fnError } = await adminCreateUser({
          correo: formData.correo.trim(),
          clave: formData.clave,
          nombre: formData.nombre.trim(),
          documento: formData.documento.trim(),
          telefono: formData.telefono.trim() || null,
          usuario: formData.usuario.trim(),
          fk_tipo_doc: parseInt(formData.fk_tipo_doc),
          fk_cargo: parseInt(formData.fk_cargo),
        });

        if (fnError) throw new Error(data?.error || fnError.message);
        if (data?.error) throw new Error(data.error);
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ocurrió un error al guardar el usuario.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModuleLayout
      title={isEditing ? 'Editar Usuario' : 'Nuevo Usuario'}
      description={isEditing ? `Modifica los datos del usuario "${usuarioToEdit.nombre}"` : 'Registra un nuevo usuario del sistema con su cargo correspondiente'}
      actions={
        <button onClick={onCancel} className="login-btn" style={{ width: 'auto', padding: '10px 20px', backgroundColor: 'transparent', border: '1px solid var(--glass-border)' }}>
          Volver
        </button>
      }
    >
      <div className="glass-panel" style={{ padding: '30px', maxWidth: '800px', margin: '0 auto' }}>
        {(error || optionsError) && <div className="status-message status-error" style={{ marginBottom: '20px' }}>{error || optionsError}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-grid">
            <div className="input-group">
              <label htmlFor="nombre">Nombre Completo *</label>
              <input
                id="nombre"
                name="nombre"
                type="text"
                className="input-field"
                value={formData.nombre}
                onChange={handleChange}
                placeholder="Ej. Juan Pérez"
                required
              />
              {fieldErrors.nombre && <span className="field-error">{fieldErrors.nombre}</span>}
            </div>

            <div className="input-group">
              <label htmlFor="correo">Correo Electrónico *</label>
              <input
                id="correo"
                name="correo"
                type="email"
                className="input-field"
                value={formData.correo}
                onChange={handleChange}
                placeholder="Ej. juan@hotel.com"
                required
              />
              {fieldErrors.correo && <span className="field-error">{fieldErrors.correo}</span>}
            </div>

            <div className="input-group">
              <label htmlFor="fk_tipo_doc">Tipo de Documento *</label>
              <select
                id="fk_tipo_doc"
                name="fk_tipo_doc"
                className="input-field"
                value={formData.fk_tipo_doc}
                onChange={handleChange}
                required
                style={{ appearance: 'none' }}
              >
                <option value="" disabled hidden>Seleccione...</option>
                {tiposDoc.map(doc => (
                  <option key={doc.cod_tipodoc} value={doc.cod_tipodoc} style={{ color: 'black' }}>
                    {doc.descripcion_tipodoc}
                  </option>
                ))}
              </select>
              {fieldErrors.fk_tipo_doc && <span className="field-error">{fieldErrors.fk_tipo_doc}</span>}
            </div>

            <div className="input-group">
              <label htmlFor="documento">Nº de Documento *</label>
              <input
                id="documento"
                name="documento"
                type="text"
                className="input-field"
                value={formData.documento}
                onChange={handleChange}
                disabled={!formData.fk_tipo_doc}
                placeholder={!formData.fk_tipo_doc ? 'Elegí primero el tipo de documento' : 'Ej. 4567890'}
                required
              />
              {fieldErrors.documento && <span className="field-error">{fieldErrors.documento}</span>}
            </div>

            <PhoneField
              id="telefono"
              label="Celular"
              value={formData.telefono}
              onChange={(v) => commitField('telefono', v)}
              error={fieldErrors.telefono}
            />

            <div className="input-group">
              <label htmlFor="fk_cargo">Cargo *</label>
              <select
                id="fk_cargo"
                name="fk_cargo"
                className="input-field"
                value={formData.fk_cargo}
                onChange={handleChange}
                required
                style={{ appearance: 'none' }}
              >
                <option value="" disabled hidden>Seleccione...</option>
                {cargos
                  .filter(cargo => puedeAsignarAdmin || normalizeRole(cargo.cargo) !== 'admin')
                  .map(cargo => (
                    <option key={cargo.id_cargo} value={cargo.id_cargo} style={{ color: 'black' }}>
                      {cargo.cargo}
                    </option>
                  ))}
              </select>
              {fieldErrors.fk_cargo && <span className="field-error">{fieldErrors.fk_cargo}</span>}
            </div>

            <div className="input-group">
              <label htmlFor="usuario">Nombre de Usuario *</label>
              <input
                id="usuario"
                name="usuario"
                type="text"
                className="input-field"
                value={formData.usuario}
                onChange={handleChange}
                placeholder="Ej. jperez"
                required
              />
              {fieldErrors.usuario && <span className="field-error">{fieldErrors.usuario}</span>}
            </div>

            <div className="input-group">
              <label htmlFor="clave">{isEditing ? 'Nueva Contraseña (opcional)' : 'Contraseña *'}</label>
              <input
                id="clave"
                name="clave"
                type="password"
                className="input-field"
                value={formData.clave}
                onChange={handleChange}
                placeholder={isEditing ? 'Dejar vacío para mantener la actual' : 'Mínimo 8 caracteres'}
                required={!isEditing}
                autoComplete="new-password"
              />
              {fieldErrors.clave && <span className="field-error">{fieldErrors.clave}</span>}
            </div>

            <div className="input-group">
              <label htmlFor="confirmarClave">{isEditing ? 'Confirmar Nueva Contraseña' : 'Confirmar Contraseña *'}</label>
              <input
                id="confirmarClave"
                name="confirmarClave"
                type="password"
                className="input-field"
                value={formData.confirmarClave}
                onChange={handleChange}
                placeholder={isEditing ? 'Solo si cambias la contraseña' : 'Repite la contraseña'}
                required={!isEditing}
                autoComplete="new-password"
              />
              {fieldErrors.confirmarClave && <span className="field-error">{fieldErrors.confirmarClave}</span>}
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '15px', marginTop: '30px' }}>
            <button type="button" onClick={onCancel} className="login-btn" style={{ width: 'auto', background: 'transparent', border: '1px solid var(--glass-border)' }}>
              Cancelar
            </button>
            <button type="submit" className="login-btn" style={{ width: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }} disabled={loading}>
              <Save size={18} />
              {loading ? 'Guardando...' : 'Guardar Usuario'}
            </button>
          </div>
        </form>
      </div>
    </ModuleLayout>
  );
}
