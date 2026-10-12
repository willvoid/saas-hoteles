import { useRef, useState } from 'react';
import { Upload, X, Image as ImageIcon } from 'lucide-react';
import { IMAGEN_ACCEPT } from '../utils/imagenes';
import { COLORS, tint } from '../constants/colors';

export interface ImagenItem {
  // Un id numérico corresponde a una imagen ya persistida; uno de texto, a una pendiente de subir.
  id: number | string;
  ruta_storage: string;
  es_principal: boolean;
}

interface ImageManagerProps {
  title: string;
  images: ImagenItem[];
  onAdd: (file: File) => void | Promise<void>;
  onDelete: (img: ImagenItem) => void | Promise<void>;
  onSetPrincipal: (id: number | string) => void | Promise<void>;
  uploading?: boolean;
  emptyMessage?: string;
}

export function ImageManager({
  title,
  images,
  onAdd,
  onDelete,
  onSetPrincipal,
  uploading = false,
  emptyMessage = 'No hay imágenes cargadas.'
}: ImageManagerProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAdd = async () => {
    if (!selectedFile) return;
    await onAdd(selectedFile);
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div style={{ marginTop: '40px', paddingTop: '30px', borderTop: '1px solid var(--glass-border)' }}>
      <h3 style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <ImageIcon size={20} /> {title}
      </h3>

      <div style={{ display: 'flex', gap: '15px', alignItems: 'flex-end', marginBottom: '20px' }}>
        <div className="input-group" style={{ flex: 1, marginBottom: 0 }}>
          <input
            type="file"
            accept={IMAGEN_ACCEPT}
            className="input-field"
            ref={fileInputRef}
            onChange={(e) => setSelectedFile(e.target.files ? e.target.files[0] : null)}
            style={{ padding: '8px' }}
          />
        </div>
        <button
          type="button"
          className="login-btn"
          style={{ width: 'auto', padding: '10px 20px', display: 'flex', alignItems: 'center', gap: '8px' }}
          onClick={handleAdd}
          disabled={!selectedFile || uploading}
        >
          <Upload size={18} />
          {uploading ? 'Subiendo...' : 'Subir Imagen'}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '15px' }}>
        {images.map((img) => (
          <div key={img.id} style={{
            position: 'relative',
            borderRadius: '8px',
            overflow: 'hidden',
            border: img.es_principal ? `2px solid ${COLORS.primary}` : '1px solid var(--glass-border)',
            aspectRatio: '1'
          }}>
            <img src={img.ruta_storage} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />

            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '8px', background: `linear-gradient(to bottom, ${tint('black', 0.7)} 0%, transparent 100%)`, display: 'flex', justifyContent: 'space-between' }}>
              {img.es_principal ? (
                <span style={{ color: COLORS.white, fontSize: '12px', fontWeight: 'bold', background: COLORS.primary, padding: '2px 6px', borderRadius: '4px' }}>Principal</span>
              ) : (
                <button
                  type="button"
                  onClick={() => onSetPrincipal(img.id)}
                  style={{ background: tint('black', 0.5), color: COLORS.white, border: 'none', borderRadius: '4px', padding: '2px 6px', fontSize: '11px', cursor: 'pointer' }}
                >
                  Hacer Ppal.
                </button>
              )}
              <button
                type="button"
                onClick={() => onDelete(img)}
                style={{ background: tint('error', 0.8), color: COLORS.white, border: 'none', borderRadius: '4px', width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
              >
                <X size={14} />
              </button>
            </div>
          </div>
        ))}
        {images.length === 0 && (
          <p style={{ color: 'var(--text-secondary)', gridColumn: '1 / -1', textAlign: 'center', padding: '20px 0' }}>
            {emptyMessage}
          </p>
        )}
      </div>
    </div>
  );
}
