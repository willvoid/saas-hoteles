export const IMAGEN_MAX_BYTES = 5 * 1024 * 1024;

export const IMAGEN_EXTENSIONES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
};

export const IMAGEN_ACCEPT = Object.keys(IMAGEN_EXTENSIONES).join(',');

export function validarImagen(file: { type: string; size: number }): string | null {
  if (!(file.type in IMAGEN_EXTENSIONES)) {
    return 'Formato no permitido. Usá imágenes JPG, PNG, WebP o AVIF.';
  }
  if (file.size > IMAGEN_MAX_BYTES) {
    return 'La imagen supera el tamaño máximo de 5 MB.';
  }
  return null;
}
