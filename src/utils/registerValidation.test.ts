import { describe, expect, it } from 'vitest';
import {
  EMPTY_REGISTER_VALUES,
  passwordStrength,
  validateAccountStep,
  validateCompanyStep,
  validateHotelStep,
} from './registerValidation';
import type { RegisterValues } from './registerValidation';

const base = (patch: Partial<RegisterValues> = {}): RegisterValues => ({
  ...EMPTY_REGISTER_VALUES,
  email: 'ana@hotel.com',
  password: 'clave1234',
  nombre: 'Ana Pérez',
  tipoDoc: '1',
  documento: '1234567',
  telefono: '',
  hotelNombre: 'Hotel Sol',
  slug: 'hotel-sol',
  razonSocial: 'Hotelería Sol S.A.',
  nombreFantasia: '',
  ruc: '80012345-6',
  fkContribuyente: '1',
  fkRegimen: '2',
  direccion: 'Calle 123',
  departamento: '1',
  distrito: '2',
  ciudad: '3',
  fkBarrio: '4',
  ...patch,
});

describe('validateAccountStep', () => {
  it('accepts valid data', () => {
    expect(validateAccountStep(base())).toEqual({});
  });

  it('rejects a malformed email', () => {
    expect(validateAccountStep(base({ email: 'ana@' })).email).toBeTruthy();
    expect(validateAccountStep(base({ email: '' })).email).toBeTruthy();
  });

  it('enforces the password rules of the server', () => {
    expect(validateAccountStep(base({ password: 'a1' })).password).toMatch(/8/);
    expect(validateAccountStep(base({ password: '12345678' })).password).toMatch(/letra/);
    expect(validateAccountStep(base({ password: 'abcdefgh' })).password).toMatch(/número/);
    expect(validateAccountStep(base({ password: `a1${'x'.repeat(71)}` })).password).toMatch(/72/);
  });

  it('validates name, document type and document', () => {
    const e = validateAccountStep(base({ nombre: 'A1', tipoDoc: '', documento: 'x' }));
    expect(e.nombre).toBeTruthy();
    expect(e.tipoDoc).toBeTruthy();
    expect(e.documento).toBeUndefined();
    expect(validateAccountStep(base({ documento: '12ab' })).documento).toBeTruthy();
    expect(validateAccountStep(base({ tipoDoc: '2', documento: '1234567' })).documento).toMatch(/guión/);
  });

  it('allows an empty phone but rejects an invalid one', () => {
    expect(validateAccountStep(base({ telefono: '' })).telefono).toBeUndefined();
    expect(validateAccountStep(base({ telefono: 'abc' })).telefono).toBeTruthy();
  });
});

describe('validateHotelStep', () => {
  it('accepts valid data', () => {
    expect(validateHotelStep(base())).toEqual({});
  });

  it('checks the hotel name length', () => {
    expect(validateHotelStep(base({ hotelNombre: 'Ho' })).hotelNombre).toBeTruthy();
  });

  it('rejects invalid and reserved slugs', () => {
    expect(validateHotelStep(base({ slug: 'Hotel Sol' })).slug).toBeTruthy();
    expect(validateHotelStep(base({ slug: 'admin' })).slug).toMatch(/reservado/);
  });
});

describe('validateCompanyStep', () => {
  it('accepts valid data', () => {
    expect(validateCompanyStep(base())).toEqual({});
  });

  it('requires the company fields', () => {
    const e = validateCompanyStep(
      base({ razonSocial: '', ruc: '123', fkContribuyente: '', fkRegimen: '', direccion: '', fkBarrio: '' }),
    );
    expect(Object.keys(e).sort()).toEqual(
      ['direccion', 'fkBarrio', 'fkContribuyente', 'fkRegimen', 'razonSocial', 'ruc'].sort(),
    );
  });

  it('limits the trade name length', () => {
    expect(validateCompanyStep(base({ nombreFantasia: 'x'.repeat(121) })).nombreFantasia).toBeTruthy();
  });
});

describe('passwordStrength', () => {
  it('scores weak, medium and strong passwords', () => {
    expect(passwordStrength('').level).toBe(0);
    expect(passwordStrength('abc').level).toBe(1);
    expect(passwordStrength('abcdefg1').level).toBe(2);
    expect(passwordStrength('Abcdefghij1!').level).toBe(3);
  });
});
