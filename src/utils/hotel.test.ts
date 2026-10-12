import { describe, expect, it } from 'vitest';
import {
  EMPTY_HOTEL_FORM,
  HOTEL_FORM_ORDER,
  buildCreateHotelPayload,
  describirEstadoHotel,
  puedeEntrarAlHotel,
  slugify,
  validateHotelForm,
} from './hotel';
import type { HotelForm } from './hotel';

const valid: HotelForm = {
  nombre: 'Hotel Sol',
  slug: 'hotel-sol',
  razonSocial: 'Hotel Sol SA',
  nombreFantasia: '',
  ruc: '80012345-6',
  fkContribuyente: '1',
  fkRegimen: '2',
  direccion: 'Calle 1 esq. 2',
  fkBarrio: '5',
  adminNombre: 'Ana Gómez',
  adminTipoDoc: '1',
  adminDocumento: '1234567',
  adminTelefono: '',
};

const withField = (patch: Partial<HotelForm>): HotelForm => ({ ...valid, ...patch });

describe('slugify', () => {
  it.each([
    ['Hotel Sol y Luna', 'hotel-sol-y-luna'],
    ['  Hotel   Ñandú  ', 'hotel-nandu'],
    ['Café & Té', 'cafe-te'],
    ['--Hotel--', 'hotel'],
    ['', ''],
    ['!!!', ''],
  ])('slugify(%j) = %j', (input, expected) => {
    expect(slugify(input)).toBe(expected);
  });

  it('caps the length at 40 without a trailing hyphen', () => {
    const slug = slugify(`${'a'.repeat(39)} bbb`);
    expect(slug.length).toBeLessThanOrEqual(40);
    expect(slug.endsWith('-')).toBe(false);
  });
});

describe('validateHotelForm', () => {
  it('accepts a valid form', () => {
    expect(validateHotelForm(valid)).toBeNull();
    expect(validateHotelForm(withField({ adminTelefono: '+595 981 123456', nombreFantasia: 'Sol' }))).toBeNull();
  });

  it('flags the first invalid field in screen order', () => {
    expect(validateHotelForm(EMPTY_HOTEL_FORM)?.campo).toBe('nombre');
    expect(validateHotelForm(withField({ nombre: 'Hotel Sol', razonSocial: '', adminNombre: '' }))?.campo).toBe('razonSocial');
  });

  it.each<[Partial<HotelForm>, keyof HotelForm]>([
    [{ nombre: 'Ho' }, 'nombre'],
    [{ nombre: 'a'.repeat(81) }, 'nombre'],
    [{ slug: 'a' }, 'slug'],
    [{ slug: 'hotel sol' }, 'slug'],
    [{ slug: 'admin' }, 'slug'],
    [{ razonSocial: 'ab' }, 'razonSocial'],
    [{ nombreFantasia: 'a'.repeat(121) }, 'nombreFantasia'],
    [{ ruc: '800123456' }, 'ruc'],
    [{ ruc: '80012345-67' }, 'ruc'],
    [{ fkContribuyente: '' }, 'fkContribuyente'],
    [{ fkRegimen: 'x' }, 'fkRegimen'],
    [{ direccion: 'ab' }, 'direccion'],
    [{ fkBarrio: '' }, 'fkBarrio'],
    [{ adminNombre: 'Ana 3' }, 'adminNombre'],
    [{ adminTipoDoc: '' }, 'adminTipoDoc'],
    [{ adminDocumento: '12' }, 'adminDocumento'],
    [{ adminDocumento: '123-456' }, 'adminDocumento'],
    [{ adminTelefono: 'abc' }, 'adminTelefono'],
  ])('rejects %j on %s', (patch, campo) => {
    expect(validateHotelForm(withField(patch))?.campo).toBe(campo);
  });

  it('applies RUC rules to the document when the type is RUC', () => {
    expect(validateHotelForm(withField({ adminTipoDoc: '2', adminDocumento: '80012345-6' }))).toBeNull();
    expect(validateHotelForm(withField({ adminTipoDoc: '2', adminDocumento: '800123456' }))?.campo).toBe('adminDocumento');
  });

  it('accepts a K check digit in the RUC', () => {
    expect(validateHotelForm(withField({ ruc: '80012345-K' }))).toBeNull();
  });

  it('keeps the order list in sync with the form fields', () => {
    expect([...HOTEL_FORM_ORDER].sort()).toEqual(Object.keys(EMPTY_HOTEL_FORM).sort());
  });
});

describe('buildCreateHotelPayload', () => {
  it('builds the create-hotel body with numbers and null optionals', () => {
    expect(buildCreateHotelPayload(withField({ nombre: ' Hotel Sol ', slug: ' Hotel-Sol ' }))).toEqual({
      hotel: { nombre: 'Hotel Sol', slug: 'hotel-sol' },
      admin: { nombre: 'Ana Gómez', documento: '1234567', fk_tipo_doc: 1, telefono: null },
      empresa: {
        ruc: '80012345-6',
        razon_social: 'Hotel Sol SA',
        nombre_fantasia: null,
        fk_contribuyente: 1,
        fk_regimen: 2,
      },
      establecimiento: { direccion: 'Calle 1 esq. 2', fk_barrio: 5 },
    });
  });

  it('keeps optional values when given', () => {
    const payload = buildCreateHotelPayload(withField({ nombreFantasia: ' Sol ', adminTelefono: ' 0981 123456 ' }));
    expect(payload.empresa.nombre_fantasia).toBe('Sol');
    expect(payload.admin.telefono).toBe('0981 123456');
  });
});

describe('hotel state helpers', () => {
  it.each([
    ['trial', true],
    ['activo', true],
    [' Activo ', true],
    ['suspendido', false],
  ])('puedeEntrarAlHotel(%j) = %s', (estado, expected) => {
    expect(puedeEntrarAlHotel({ estado })).toBe(expected);
  });

  it('describes each state', () => {
    expect(describirEstadoHotel({ estado: 'activo', trial_fin: null })).toEqual({ texto: 'Activo', tono: 'ok' });
    expect(describirEstadoHotel({ estado: 'suspendido', trial_fin: null })).toEqual({ texto: 'Suspendido', tono: 'bad' });
    expect(describirEstadoHotel({ estado: 'trial', trial_fin: '2026-11-03' })).toEqual({
      texto: 'Prueba hasta 03/11/2026',
      tono: 'warn',
    });
    expect(describirEstadoHotel({ estado: 'trial', trial_fin: null })).toEqual({ texto: 'Prueba', tono: 'warn' });
  });
});
