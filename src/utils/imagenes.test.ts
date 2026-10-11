import { describe, it, expect } from 'vitest';
import { validarImagen, IMAGEN_MAX_BYTES } from './imagenes';

describe('validarImagen', () => {
  it('acepta jpeg, png, webp y avif dentro del tamaño máximo', () => {
    for (const type of ['image/jpeg', 'image/png', 'image/webp', 'image/avif']) {
      expect(validarImagen({ type, size: 1024 })).toBeNull();
    }
  });

  it('acepta una imagen de exactamente 5 MB', () => {
    expect(validarImagen({ type: 'image/png', size: IMAGEN_MAX_BYTES })).toBeNull();
  });

  it('rechaza formatos que no son imagen permitida', () => {
    expect(validarImagen({ type: 'image/gif', size: 1024 })).toMatch(/Formato no permitido/);
    expect(validarImagen({ type: 'application/pdf', size: 1024 })).toMatch(/Formato no permitido/);
    expect(validarImagen({ type: '', size: 1024 })).toMatch(/Formato no permitido/);
  });

  it('rechaza imágenes de más de 5 MB', () => {
    expect(validarImagen({ type: 'image/jpeg', size: IMAGEN_MAX_BYTES + 1 })).toMatch(/5 MB/);
  });
});
