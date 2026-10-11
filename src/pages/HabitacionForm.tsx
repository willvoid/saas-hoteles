import React, { useState, useEffect } from 'react';
import { HabitacionService } from '../services/habitacionService';
import { Save } from 'lucide-react';
import { ModuleLayout } from '../components/ModuleLayout';
import { enfocarCampo } from '../utils/formFocus';
import { ImageManager, ImagenItem } from '../components/ImageManager';

/** Campos del formulario, para conservarlos al ir y volver de Tipos de Habitación. */
export interface HabitacionBorrador {
  numero_habitacion: string;
  descripcion: string;
  fk_tipo_habitacion: string;
  fk_piso: string;
}

/** La descripción es opcional; el tope evita textos que desborden las tarjetas. */
const MAX_DESCRIPCION = 200;

interface HabitacionFormProps {
  onCancel: () => void;
  onSaved: () => void;
  habitacionToEdit: any | null;
  /**
   * Lleva al alta de un tipo de habitación. Recibe lo ya cargado en el
   * formulario para poder restaurarlo al volver. Si no se pasa, el botón no
   * se muestra.
   */
  onCrearTipo?: (borrador: HabitacionBorrador) => void;
  /** Estado a restaurar al volver de Tipos (con o sin tipo nuevo). */
  borradorInicial?: HabitacionBorrador | null;
  /** Avisa que ya se aplicó `borradorInicial`, para que no se reutilice. */
  onBorradorInicialConsumido?: () => void;
}

export default function HabitacionForm({
  onCancel,
  onSaved,
  habitacionToEdit,
  onCrearTipo,
  borradorInicial,
  onBorradorInicialConsumido,
}: HabitacionFormProps) {
  const [formData, setFormData] = useState<HabitacionBorrador>(borradorInicial ?? {
    numero_habitacion: '',
    descripcion: '',
    fk_tipo_habitacion: '',
    fk_piso: ''
  });
  
  const [tipos, setTipos] = useState<any[]>([]);
  const [pisos, setPisos] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [images, setImages] = useState<ImagenItem[]>([]);
  const [uploadingImage, setUploadingImage] = useState(false);

  useEffect(() => {
    fetchCatalogs();
    if (habitacionToEdit) {
      // Al volver de crear un tipo, el borrador ya trae lo editado (incluido
      // el tipo nuevo): recargar la habitación original lo pisaría.
      if (!borradorInicial) {
        setFormData({
          numero_habitacion: habitacionToEdit.numero_habitacion || '',
          descripcion: habitacionToEdit.descripcion || '',
          fk_tipo_habitacion: habitacionToEdit.fk_tipo_habitacion || '',
          fk_piso: habitacionToEdit.fk_piso || ''
        });
      }
      if (habitacionToEdit.imagenes_habitacion) {
        setImages(habitacionToEdit.imagenes_habitacion);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [habitacionToEdit]);

  // El borrador ya se aplicó como estado inicial del useState; sólo resta
  // avisar para que Dashboard lo descarte y no se reutilice más adelante.
  useEffect(() => {
    if (borradorInicial) onBorradorInicialConsumido?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchCatalogs = async () => {
    try {
      const [tiposData, pisosData] = await Promise.all([
        HabitacionService.getTiposHabitacion(),
        HabitacionService.getPisos()
      ]);
      setTipos(tiposData);
      setPisos(pisosData);
    } catch (err: any) {
      setError('Error al cargar catálogos: ' + err.message);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setError(null);
    
    if (name === 'numero_habitacion') {
      if (/[^\d]/.test(value)) {
        setError("Solo puede ingresar números para la habitación.");
        return;
      }
      if (value.length > 0 && value[0] === '0') {
        setError("El número de habitación no puede empezar con 0.");
        return;
      }
      if (value.length > 4) {
        setError("El número permite un máximo de 4 dígitos.");
        return;
      }
      setFormData(prev => ({ ...prev, [name]: value }));
      return;
    }

    if (name === 'descripcion') {
      if (value.length > MAX_DESCRIPCION) {
        setError(`La descripción permite un máximo de ${MAX_DESCRIPCION} caracteres.`);
        return;
      }
      if (value.length > 0 && !/^[a-zA-ZáéíóúÁÉÍÓÚñÑ]/.test(value)) {
        setError("El primer carácter debe ser una letra.");
        return;
      }
      if (/ {2}/.test(value)) {
        setError("La descripción no puede tener dos espacios seguidos.");
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

    if (!formData.numero_habitacion) {
      fallarEn('numero_habitacion', "El número de habitación es requerido.");
      return;
    }

    if (Number(formData.numero_habitacion) <= 0) {
      fallarEn('numero_habitacion', "El número de habitación debe ser mayor a cero.");
      return;
    }

    if (!formData.fk_tipo_habitacion) {
      fallarEn('fk_tipo_habitacion', "Debe seleccionar un tipo de habitación.");
      return;
    }

    if (!formData.fk_piso) {
      fallarEn('fk_piso', "Debe seleccionar un piso.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      // Validar si el número de habitación ya existe
      const numeroHabitacion = Number(formData.numero_habitacion);
      const isDuplicate = await HabitacionService.checkHabitacionNumber(
        numeroHabitacion, 
        habitacionToEdit ? habitacionToEdit.id : undefined
      );

      if (isDuplicate) {
        fallarEn('numero_habitacion', "El número de habitación ya existe en el sistema.");
        setLoading(false);
        return;
      }

      const payload = {
        numero_habitacion: Number(formData.numero_habitacion),
        descripcion: formData.descripcion,
        fk_tipo_habitacion: Number(formData.fk_tipo_habitacion),
        fk_piso: Number(formData.fk_piso)
      };

      if (habitacionToEdit) {
        await HabitacionService.updateHabitacion(habitacionToEdit.id, payload);
      } else {
        await HabitacionService.createHabitacion(payload);
        // Note: For a new room, we might want to upload images after creation.
        // For simplicity, we create first, then user can edit to add images.
      }
      onSaved();
    } catch (err: any) {
      setError(err.message || 'Error al guardar la habitación');
    } finally {
      setLoading(false);
    }
  };

  const handleImageUpload = async (file: File) => {
    if (!habitacionToEdit) return;
    setUploadingImage(true);
    setError(null);
    try {
      const data = await HabitacionService.uploadImage(file, habitacionToEdit.id);
      if (data && data.length > 0) {
        setImages(prev => [...prev, data[0]]);
      }
    } catch (err: any) {
      setError('Error al subir imagen: ' + err.message);
    } finally {
      setUploadingImage(false);
    }
  };

  const handleDeleteImage = async (img: ImagenItem) => {
    try {
      await HabitacionService.deleteImage(img.id as number, img.ruta_storage);
      setImages(prev => prev.filter(i => i.id !== img.id));
    } catch (err: any) {
      setError('Error al eliminar imagen: ' + err.message);
    }
  };

  const handleSetPrincipal = async (imgId: number | string) => {
    try {
      await HabitacionService.setPrincipalImage(imgId as number, habitacionToEdit.id);
      setImages(prev => prev.map(img => ({
        ...img,
        es_principal: img.id === imgId
      })));
    } catch (err: any) {
      setError('Error al establecer principal: ' + err.message);
    }
  };

  return (
    <ModuleLayout
      title={habitacionToEdit ? 'Editar Habitación' : 'Nueva Habitación'}
      description={habitacionToEdit ? `Modifica los detalles de la habitación #${habitacionToEdit.numero_habitacion}` : 'Registra una nueva habitación en el inventario'}
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
            <label>Número de Habitación *</label>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              name="numero_habitacion"
              className="input-field"
              value={formData.numero_habitacion}
              onChange={handleChange}
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
                <option key={t.id} value={t.id}>{t.nombre} (Cap: {t.capacidad})</option>
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
            <label>Piso *</label>
            <select
              name="fk_piso"
              className="input-field"
              value={formData.fk_piso}
              onChange={handleChange}
              required
            >
              <option value="">Seleccione...</option>
              {pisos.map(p => (
                <option key={p.id} value={p.id}>Piso {p.numero}</option>
              ))}
            </select>
          </div>

          <div className="input-group span-2">
            <label>Descripción (opcional)</label>
            <textarea
              name="descripcion"
              className="input-field"
              value={formData.descripcion}
              onChange={handleChange}
              rows={3}
              placeholder="Ej. Vista al jardín, balcón privado, aire acondicionado"
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', marginTop: '4px' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                Detalles que distinguen a esta habitación: vista, mobiliario o comodidades.
              </span>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                {formData.descripcion.length}/{MAX_DESCRIPCION}
              </span>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '15px', marginTop: '30px' }}>
          <button type="button" onClick={onCancel} className="login-btn" style={{ width: 'auto', background: 'transparent', border: '1px solid var(--glass-border)' }}>
            Cancelar
          </button>
          <button type="submit" className="login-btn" style={{ width: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }} disabled={loading}>
            <Save size={18} />
            {loading ? 'Guardando...' : 'Guardar Habitación'}
          </button>
        </div>
      </form>

      {/* Seccion de imagenes solo visible en edicion (ya que requiere ID de habitacion) */}
      {habitacionToEdit && (
        <ImageManager
          title="Imágenes de la Habitación"
          images={images}
          onAdd={handleImageUpload}
          onDelete={handleDeleteImage}
          onSetPrincipal={handleSetPrincipal}
          uploading={uploadingImage}
          emptyMessage="No hay imágenes para esta habitación."
        />
      )}
    </div>
  </ModuleLayout>
);
}
