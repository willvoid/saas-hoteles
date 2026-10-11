import { describe, it, expect } from 'vitest';
import { primerCampoConError } from './formFocus';

// `enfocarCampo` toca el DOM (scrollIntoView / focus), así que acá sólo se
// testea la parte pura: cuál es el campo al que hay que llevar al usuario.
describe('primerCampoConError', () => {
  const orden = ['razon_social', 'documento', 'email', 'celular'];

  it('devuelve el primero según el orden de pantalla, no el del objeto', () => {
    const errores = { celular: 'Falta el celular.', documento: 'Falta el documento.' };
    expect(primerCampoConError(errores, orden)).toBe('documento');
  });

  it('ignora los campos sin error', () => {
    const errores = { razon_social: '', email: undefined, celular: 'Revisá el celular.' };
    expect(primerCampoConError(errores, orden)).toBe('celular');
  });

  it('devuelve null cuando no hay errores', () => {
    expect(primerCampoConError({}, orden)).toBe(null);
    expect(primerCampoConError({ razon_social: '' }, orden)).toBe(null);
  });

  it('ignora errores de campos que no están en el orden', () => {
    expect(primerCampoConError({ contacto: 'Falta un contacto.' }, orden)).toBe(null);
  });
});
