import React, { useState, useEffect } from 'react';
import { TarifaService } from '../services/tarifaService';
import { HabitacionService } from '../services/habitacionService';
import { Save } from 'lucide-react';
import { ModuleLayout } from '../components/ModuleLayout';
import { enfocarCampo } from '../utils/formFocus';

/** Campos del formulario, para conservarlos al ir y volver de Tipos de Habitación. */
export interface TarifaBorrador {
  nombre: string;
  precio_base: string;
  estado: string;
  fecha_inicio: string;
  fecha_fin: string;
  fk_tipo_habitacion: string;
}

const MAX_NOMBRE = 60;

interface TarifaFormProps {
  onCancel: () => void;
  onSaved: () => void;
  tarifaToEdit: any | null;
  /**
   * Lleva al alta de un tipo de habitación. Recibe lo ya cargado en el
   * formulario para poder restaurarlo al volver. Si no se pasa, el botón no
   * se muestra.
   */
  onCrearTipo?: (borrador: TarifaBorrador) => void;
  /** Estado a restaurar al volver de Tipos (con o sin tipo nuevo). */
  borradorInicial?: TarifaBorrador | null;
  /** Avisa que ya se aplicó `borradorInicial`, para que no se reutilice. */
  onBorradorInicialConsumido?: () => void;
}

export default function TarifaForm({
  onCancel,
  onSaved,
  tarifaToEdit,
  onCrearTipo,
  borradorInicial,
  onBorradorInicialConsumido,
}: TarifaFormProps) {
  const [formData, setFormData] = useState<TarifaBorrador>(borradorInicial ?? {
    nombre: '',
    precio_base: '',
    estado: 'Activa',
    fecha_inicio: '',
    fecha_fin: '',
    fk_tipo_habitacion: ''
  });

  const [tipos, setTipos] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchTipos();
    if (tarifaToEdit) {
      // Al volver de crear un tipo, el borrador ya trae lo editado (incluido
      // el tipo nuevo): recargar la tarifa original lo pisaría.
      if (!borradorInicial) {
        setFormData({
          nombre: tarifaToEdit.nombre || '',
          precio_base: tarifaToEdit.precio_base?.toString() || '',
          estado: tarifaToEdit.estado || 'Activa',
          fecha_inicio: tarifaToEdit.fecha_inicio || '',
          fecha_fin: tarifaToEdit.fecha_fin || '',
          fk_tipo_habitacion: tarifaToEdit.fk_tipo_habitacion?.toString() || ''
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tarifaToEdit]);

  // El borrador ya se aplicó como estado inicial del useState; sólo resta
  // avisar para que Dashboard lo descarte y no se reutilice más adelante.
  useEffect(() => {
    if (borradorInicial) onBorradorInicialConsumido?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchTipos = async () => {
    try {
      const tiposData = await HabitacionService.getTiposHabitacion();
      setTipos(tiposData);
    } catch (err: any) {
      setError('Error al cargar tipos de habitación: ' + err.message);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setError(null);
    
    if (name === 'nombre') {
      if (value.length > MAX_NOMBRE) {
        setError(`El nombre permite un máximo de ${MAX_NOMBRE} caracteres.`);
        return;
      }
      if (value.length > 0 && !/^[a-zA-ZáéíóúÁÉÍÓÚñÑ]/.test(value)) {
        setError("El primer carácter debe ser una letra.");
        return;
      }
      if (/ {2}/.test(value)) {
        setError("El nombre no puede tener dos espacios seguidos.");
        return;
      }
      setFormData(prev => ({ ...prev, [name]: value }));
      return;
    }

    if (name === 'precio_base') {
      if (/[^\d]/.test(value)) {
        setError("Solo puede ingresar números en el precio base.");
        return;
      }
      if (value.length > 0 && value[0] === '0') {
        setError("El precio no puede empezar con 0.");
        return;
      }
      if (value.length > 7) {
        setError("El precio base puede tener un máximo de 7 dígitos.");
        return;
      }
      setFormData(prev => ({ ...prev, [name]: value }));
      return;
    }

    if (name === 'fecha_inicio' || name === 'fecha_fin') {
      const target = e.target as HTMLInputElement;
      
      // El navegador nativamente marca como badInput fechas como 31 de febrero
      if (target.validity && target.validity.badInput) {
        setError("La fecha ingresada no existe (verifique los días correspondientes al mes y año bisiesto).");
        // Actualizamos el estado de todas formas para permitir al usuario borrar
        setFormData(prev => ({ ...prev, [name]: value }));
        return;
      }

      if (value) {
        const parts = value.split('-');
        if (parts.length === 3) {
          const year = parseInt(parts[0], 10);
          const month = parseInt(parts[1], 10);
          const day = parseInt(parts[2], 10);

          if (parts[0].length > 4) {
            setError("El año no puede tener más de 4 dígitos.");
            setFormData(prev => ({ ...prev, [name]: value }));
            return;
          }

          // Validación explícita de días por mes (con cálculo de bisiesto)
          if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
            const isLeapYear = (year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0));
            const daysInMonth = [31, isLeapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

            if (month >= 1 && month <= 12) {
              const maxDays = daysInMonth[month - 1];
              if (day > maxDays) {
                setError(`El mes ${month} (año ${year}) solo permite ingresar hasta ${maxDays} días.`);
                setFormData(prev => ({ ...prev, [name]: value }));
                return;
              }
            }
          }

          if (name === 'fecha_fin' && formData.fecha_inicio && value < formData.fecha_inicio) {
            setError("La fecha de fin no puede ser anterior a la fecha de inicio.");
            setFormData(prev => ({ ...prev, [name]: value }));
            return;
          }

          if (name === 'fecha_inicio' && formData.fecha_fin && value > formData.fecha_fin) {
            setError("La fecha de inicio no puede ser posterior a la fecha de fin.");
            setFormData(prev => ({ ...prev, [name]: value }));
            return;
          }
        }
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
      fallarEn('nombre', "El nombre es requerido.");
      return;
    }

    const precioStr = formData.precio_base;
    if (precioStr.length < 5 || precioStr.length > 7) {
      fallarEn('precio_base', "El precio base debe tener entre 5 y 7 dígitos.");
      return;
    }
    const precioNum = Number(precioStr);
    if (precioNum <= 0) {
      fallarEn('precio_base', "El precio base debe ser mayor a cero.");
      return;
    }

    if (!formData.fk_tipo_habitacion) {
      fallarEn('fk_tipo_habitacion', "Debe seleccionar un tipo de habitación.");
      return;
    }

    if (!formData.fecha_inicio) {
      fallarEn('fecha_inicio', "La fecha de inicio es requerida.");
      return;
    }

    if (formData.fecha_fin && formData.fecha_fin < formData.fecha_inicio) {
      fallarEn('fecha_fin', "La fecha de fin no puede ser anterior a la fecha de inicio.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      // Validar si el nombre ya existe
      const isDuplicate = await TarifaService.checkTarifaNombre(
        formData.nombre.trim(),
        tarifaToEdit ? tarifaToEdit.id : undefined
      );

      if (isDuplicate) {
        fallarEn('nombre', "Ya existe una tarifa con ese nombre.");
        setLoading(false);
        return;
      }

      const payload = {
        nombre: formData.nombre.trim(),
        precio_base: precioNum,
        estado: formData.estado,
        fecha_inicio: formData.fecha_inicio,
        fecha_fin: formData.fecha_fin || null,
        fk_tipo_habitacion: Number(formData.fk_tipo_habitacion)
      };

      if (tarifaToEdit) {
        await TarifaService.updateTarifa(tarifaToEdit.id, payload);
      } else {
        await TarifaService.createTarifa(payload);
      }
      onSaved();
    } catch (err: any) {
      setError(err.message || 'Error al guardar la tarifa');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModuleLayout
      title={tarifaToEdit ? 'Editar Tarifa' : 'Nueva Tarifa'}
      description={tarifaToEdit ? `Modifica los detalles de la tarifa "${tarifaToEdit.nombre}"` : 'Crea una nueva tarifa para los tipos de habitación'}
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
              <label>Nombre de la Tarifa *</label>
              <input
                type="text"
                name="nombre"
                className="input-field"
                value={formData.nombre}
                onChange={handleChange}
                placeholder="Ej. Temporada Alta, Standard"
                required
              />
            </div>

            <div className="input-group">
              <label>Tipo de Habitación *</label>
              <select
                name="fk_tipo_habitacion"
                className="input-field"
                value={formData.fk_tipo_habitacion}
                onChange={handleChange}
                required
              >
                <option value="">Seleccione...</option>
                {tipos.map(t => (
                  <option key={t.id} value={t.id}>{t.nombre}</option>
                ))}
              </select>
              {onCrearTipo && (
                <button
                  type="button"
                  className="link-btn"
                  style={{ marginTop: '6px', fontSize: '13px' }}
                  onClick={() => onCrearTipo(formData)}
                >
                  + Crear nuevo tipo de habitación
                </button>
              )}
            </div>

            <div className="input-group">
              <label>Precio Base *</label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                name="precio_base"
                className="input-field"
                value={formData.precio_base}
                onChange={handleChange}
                placeholder="Ej. 150000"
                required
              />
            </div>

            <div className="input-group">
              <label>Estado *</label>
              <select
                name="estado"
                className="input-field"
                value={formData.estado}
                onChange={handleChange}
                required
              >
                <option value="Activa">Activa</option>
                <option value="Inactiva">Inactiva</option>
              </select>
            </div>

            <div className="input-group">
              <label>Fecha de Inicio *</label>
              <input
                type="date"
                name="fecha_inicio"
                className="input-field"
                value={formData.fecha_inicio}
                onChange={handleChange}
                max="9999-12-31"
                required
              />
            </div>

            <div className="input-group">
              <label>Fecha de Fin</label>
              <input
                type="date"
                name="fecha_fin"
                className="input-field"
                value={formData.fecha_fin}
                onChange={handleChange}
                min={formData.fecha_inicio || undefined}
                max="9999-12-31"
              />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '15px', marginTop: '30px' }}>
            <button type="button" onClick={onCancel} className="login-btn" style={{ width: 'auto', background: 'transparent', border: '1px solid var(--glass-border)' }}>
              Cancelar
            </button>
            <button type="submit" className="login-btn" style={{ width: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }} disabled={loading}>
              <Save size={18} />
              {loading ? 'Guardando...' : 'Guardar Tarifa'}
            </button>
          </div>
        </form>
      </div>
    </ModuleLayout>
  );
}
