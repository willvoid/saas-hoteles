import { describe, expect, it } from 'vitest';
import { validateRegisterInput } from './validation.ts';

const valid = {
  email: 'Ana@Hotel.com',
  password: 'secreto123',
  turnstileToken: 'tok-123',
  hotel: { nombre: 'Hotel Sol', slug: 'hotel-sol' },
  admin: { nombre: 'Ana Gómez', documento: '1234567', fk_tipo_doc: 1, telefono: '+595 981 123456' },
  empresa: { ruc: '80012345-6', razon_social: 'Hotel Sol SA', fk_contribuyente: 1, fk_regimen: 2 },
  establecimiento: { direccion: 'Calle 1 esq. 2', fk_barrio: 5 },
};

function expectError(body: unknown, message: string | RegExp) {
  const result = validateRegisterInput(body);
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.error).toMatch(message);
}

describe('validateRegisterInput', () => {
  it('accepts a valid body and normalizes the email', () => {
    const result = validateRegisterInput(valid);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.email).toBe('ana@hotel.com');
    expect(result.value.password).toBe('secreto123');
    expect(result.value.turnstileToken).toBe('tok-123');
    expect(result.value.hotel.hotel).toEqual({ nombre: 'Hotel Sol', slug: 'hotel-sol' });
    expect(result.value.hotel.establecimiento.denominacion).toBeNull();
  });

  it('rejects a non-object body', () => {
    expectError(null, /inválido/i);
    expectError('x', /inválido/i);
  });

  it('rejects malformed or oversized emails', () => {
    expectError({ ...valid, email: 'no-es-un-correo' }, /correo/i);
    expectError({ ...valid, email: undefined }, /correo/i);
    expectError({ ...valid, email: `${'a'.repeat(250)}@x.com` }, /correo/i);
  });

  it('rejects weak passwords', () => {
    expectError({ ...valid, password: 'corta1' }, /8/);
    expectError({ ...valid, password: 'sololetrasaqui' }, /número/i);
    expectError({ ...valid, password: '123456789' }, /letra/i);
    expectError({ ...valid, password: `a1${'x'.repeat(71)}` }, /72/);
    expectError({ ...valid, password: 12345678 }, /contraseña/i);
  });

  it('requires a non-empty, bounded captcha token', () => {
    expectError({ ...valid, turnstileToken: undefined }, /verificación/i);
    expectError({ ...valid, turnstileToken: '   ' }, /verificación/i);
    expectError({ ...valid, turnstileToken: 'x'.repeat(2049) }, /verificación/i);
  });

  it('delegates hotel validation to the shared rules', () => {
    expectError({ ...valid, hotel: { nombre: 'Hotel Sol', slug: 'admin' } }, /reservado/i);
    expectError({ ...valid, empresa: { ...valid.empresa, ruc: '123' } }, /RUC/);
    expectError({ ...valid, establecimiento: undefined }, /obligatorios/i);
  });
});
