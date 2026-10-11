import React, { useState, useEffect, useRef } from 'react';
import { HabitacionService } from '../services/habitacionService';
import { Save } from 'lucide-react';
import { ModuleLayout } from '../components/ModuleLayout';
import { enfocarCampo } from '../utils/formFocus';
import { validarImagen } from '../utils/imagenes';
import { ImageManager, ImagenItem } from '../components/ImageManager';

interface TipoHabitacionFormProps {
  onCancel: () => void;
  /** Al crear (no editar), recibe la fila recién insertada. */
  onSaved: (createdTipo?: any) => void;
  tipoToEdit: any | null;
}

/** La descripción es opcional; el tope evita textos que desborden las tarjetas. */
const MAX_DESCRIPCION = 200;
const MAX_NOMBRE = 60;
const MAX_CAPACIDAD = 8;

export default function TipoHabitacionForm({ onCancel, onSaved, tipoToEdit }: TipoHabitacionFormProps) {
  const [formData, setFormData] = useState({
    nombre: '',
    capacidad: '',
    descripcion: ''
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [images, setImages] = useState<ImagenItem[]>([]);
  const [uploadingImage, setUploadingImage] = useState(false);
  // Al crear todavía no hay ID, así que los archivos se retienen acá y se suben
  // recién cuando el tipo existe. La clave es el id temporal del ImagenItem.
  const pendingFiles = useRef<Map<string, File>>(new Map());
  const objectUrls = useRef<string[]>([]);

  useEffect(() => {
    if (tipoToEdit) {
      setFormData({
        nombre: tipoToEdit.nombre || '',
        capacidad: tipoToEdit.capacidad?.toString() || '',
        descripcion: tipoToEdit.descripcion || ''
      });
      setImages(tipoToEdit.imagenes_tipo_habitacion || []);
    }
  }, [tipoToEdit]);

  // Los previews locales son objectURLs: hay que liberarlos al desmontar.
  useEffect(() => {
    return () => {
      objectUrls.current.forEach(url => URL.revokeObjectURL(url));
    };
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
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

    if (name === 'capacidad') {
      const numericValue = value.replace(/\D/g, '');
      if (numericValue.length > 0 && numericValue[0] === '0') {
        setError("Solo puedes ingresar números mayores que 0.");
        return;
      }
      if (numericValue !== '' && Number(numericValue) > MAX_CAPACIDAD) {
        setError(`La capacidad máxima por habitación es de ${MAX_CAPACIDAD}.`);
        return;
      }
      setFormData(prev => ({ ...prev, [name]: numericValue }));
      return;
    }

    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleAddImage = async (file: File) => {
    setError(null);

    const errorImagen = validarImagen(file);
    if (errorImagen) {
      setError(errorImagen);
      return;
    }

    if (!tipoToEdit) {
      const tempId = `pendiente-${Date.now()}-${Math.random()}`;
      const previewUrl = URL.createObjectURL(file);
      objectUrls.current.push(previewUrl);
      pendingFiles.current.set(tempId, file);
      setImages(prev => [...prev, { id: tempId, ruta_storage: previewUrl, es_principal: false }]);
      return;
    }

    setUploadingImage(true);
    try {
      const data = await HabitacionService.uploadImageTipo(file, tipoToEdit.id);
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
    if (typeof img.id === 'string') {
      pendingFiles.current.delete(img.id);
      URL.revokeObjectURL(img.ruta_storage);
      objectUrls.current = objectUrls.current.filter(url => url !== img.ruta_storage);
      setImages(prev => prev.filter(i => i.id !== img.id));
      return;
    }

    try {
      await HabitacionService.deleteImageTipo(img.id, img.ruta_storage);
      setImages(prev => prev.filter(i => i.id !== img.id));
    } catch (err: any) {
      setError('Error al eliminar imagen: ' + err.message);
    }
  };

  const handleSetPrincipal = async (imgId: number | string) => {
    if (typeof imgId === 'string') {
      setImages(prev => prev.map(img => ({ ...img, es_principal: img.id === imgId })));
      return;
    }

    try {
      await HabitacionService.setPrincipalImageTipo(imgId, tipoToEdit.id);
      setImages(prev => prev.map(img => ({ ...img, es_principal: img.id === imgId })));
    } catch (err: any) {
      setError('Error al establecer principal: ' + err.message);
    }
  };

  // Sube las imágenes que se cargaron antes de que el tipo existiera. Se llama recién
  // con el ID ya asignado, y respeta la que el usuario marcó como principal.
  const uploadPendingImages = async (tipoId: number) => {
    for (const img of images) {
      if (typeof img.id !== 'string') continue;
      const file = pendingFiles.current.get(img.id);
      if (!file) continue;

      const data = await HabitacionService.uploadImageTipo(file, tipoId);
      if (img.es_principal && data && data.length > 0) {
        await HabitacionService.setPrincipalImageTipo(data[0].id, tipoId);
      }
    }
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

    const capacidadNum = Number(formData.capacidad);
    if (capacidadNum <= 0) {
      fallarEn('capacidad', "La capacidad debe ser mayor a cero.");
      return;
    }



    setLoading(true);
    setError(null);
    try {
      // Validar si el nombre ya existe
      const isDuplicate = await HabitacionService.checkTipoHabitacionNombre(
        formData.nombre.trim(),
        tipoToEdit ? tipoToEdit.id : undefined
      );

      if (isDuplicate) {
        fallarEn('nombre', "Ya existe un tipo de habitación con ese nombre.");
        setLoading(false);
        return;
      }

      const payload = {
        nombre: formData.nombre.trim(),
        capacidad: capacidadNum,
        descripcion: formData.descripcion.trim()
      };

      if (tipoToEdit) {
        await HabitacionService.updateTipoHabitacion(tipoToEdit.id, payload);
        onSaved();
      } else {
        const created = await HabitacionService.createTipoHabitacion(payload);
        const nuevoTipo = created?.[0];

        if (nuevoTipo && pendingFiles.current.size > 0) {
          try {
            await uploadPendingImages(nuevoTipo.id);
          } catch (err: any) {
            // El tipo ya quedó creado: no tiene sentido abortar. Se avisa y el usuario
            // puede reintentar las imágenes desde la edición.
            setError('El tipo se creó, pero falló la subida de imágenes: ' + err.message);
            setLoading(false);
            return;
          }
        }
        onSaved(nuevoTipo);
      }
    } catch (err: any) {
      setError(err.message || 'Error al guardar el tipo de habitación');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModuleLayout
      title={tipoToEdit ? 'Editar Tipo de Habitación' : 'Nuevo Tipo de Habitación'}
      description={tipoToEdit ? `Modifica los detalles de la categoría "${tipoToEdit.nombre}"` : 'Crea una nueva categoría o tipo de habitación'}
      actions={
        <button onClick={onCancel} className="login-btn" style={{ width: 'auto', padding: '10px 20px', backgroundColor: 'transparent', border: '1px solid var(--glass-border)' }}>
          Volver
        </button>
      }
    >
      <div className="glass-panel" style={{ padding: '30px', maxWidth: '600px', margin: '0 auto' }}>
        {error && <div className="status-message status-error" style={{ marginBottom: '20px' }}>{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-grid">
            <div className="input-group">
              <label>Nombre del Tipo *</label>
              <input
                type="text"
                name="nombre"
                className="input-field"
                value={formData.nombre}
                onChange={handleChange}
                placeholder="Ej. Matrimonial, Simple, Suite"
                required
              />
            </div>

            <div className="input-group">
              <label>Capacidad (Personas) *</label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                name="capacidad"
                className="input-field"
                value={formData.capacidad}
                onChange={handleChange}
                placeholder="Ej. 2"
                required
              />
            </div>

            <div className="input-group span-2">
              <label>Descripción (opcional)</label>
              <textarea
                name="descripcion"
                className="input-field"
                value={formData.descripcion}
                onChange={handleChange}
                rows={4}
                placeholder="Descripción de las comodidades y características de este tipo de habitación..."
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '4px' }}>
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
              {loading ? 'Guardando...' : 'Guardar Tipo'}
            </button>
          </div>
        </form>

        <ImageManager
          title="Imágenes del Tipo de Habitación"
          images={images}
          onAdd={handleAddImage}
          onDelete={handleDeleteImage}
          onSetPrincipal={handleSetPrincipal}
          uploading={uploadingImage}
          emptyMessage={tipoToEdit
            ? 'No hay imágenes para este tipo de habitación.'
            : 'Agregá las imágenes ahora: se subirán al guardar el tipo.'}
        />
      </div>
    </ModuleLayout>
  );
}
