import { describe, expect, it } from 'vitest';
import {
  MAX_HOTELS_PER_ACCOUNT,
  buildProvisionPayload,
  checkHotelEligibility,
  mapProvisionError,
  validateCreateHotelInput,
} from './validation.ts';

const valid = {
  hotel: { nombre: 'Hotel Sol', slug: 'hotel-sol' },
  admin: { nombre: 'Ana Gómez', documento: '1234567', fk_tipo_doc: 1, telefono: '+595 981 123456' },
  empresa: { ruc: '80012345-6', razon_social: 'Hotel Sol SA', fk_contribuyente: 1, fk_regimen: 2 },
  establecimiento: { direccion: 'Calle 1 esq. 2', fk_barrio: 5 },
};

type Section = keyof typeof valid;
const withField = (section: Section, patch: Record<string, unknown>) => ({
  ...valid,
  [section]: { ...valid[section], ...patch },
});

function expectError(body: unknown, message: string | RegExp) {
  const result = validateCreateHotelInput(body);
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.error).toMatch(message);
}

describe('validateCreateHotelInput', () => {
  it('accepts a valid payload and normalizes optionals to null', () => {
    const result = validateCreateHotelInput(valid);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.hotel).toEqual({ nombre: 'Hotel Sol', slug: 'hotel-sol' });
    expect(result.value.empresa.nombre_fantasia).toBeNull();
    expect(result.value.establecimiento).toMatchObject({
      direccion: 'Calle 1 esq. 2',
      fk_barrio: 5,
      denominacion: null,
      numero_casa: null,
      telefono: null,
      email: null,
    });
  });

  it('lowercases and trims the slug', () => {
    const result = validateCreateHotelInput(withField('hotel', { slug: '  Hotel-Sol ' }));
    expect(result.ok && result.value.hotel.slug).toBe('hotel-sol');
  });

  it.each([null, undefined, 'x', 3, []])('rejects a non-object body (%s)', (body) => {
    expectError(body, 'Cuerpo inválido.');
  });

  it.each(['hotel', 'admin', 'empresa', 'establecimiento'])('requires the %s section', (section) => {
    expectError({ ...valid, [section]: undefined }, 'Faltan campos obligatorios.');
    expectError({ ...valid, [section]: [] }, 'Faltan campos obligatorios.');
  });

  it('applies hotel rules', () => {
    expectError(withField('hotel', { nombre: 'Ho' }), 'entre 3 y 80');
    expectError(withField('hotel', { nombre: 'a'.repeat(81) }), 'entre 3 y 80');
    expectError(withField('hotel', { nombre: 123 }), 'entre 3 y 80');
    expectError(withField('hotel', { slug: 'a' }), 'identificador');
    expectError(withField('hotel', { slug: '-hotel' }), 'identificador');
    expectError(withField('hotel', { slug: 'hotel sol' }), 'identificador');
    expectError(withField('hotel', { slug: 'a'.repeat(41) }), 'identificador');
  });

  it.each(['plantilla-base', 'admin', 'login', 'ADMIN'])('rejects the reserved slug %s', (slug) => {
    expectError(withField('hotel', { slug }), 'reservado');
  });

  it('applies admin rules', () => {
    expectError(withField('admin', { nombre: 'Al' }), 'al menos 3');
    expectError(withField('admin', { nombre: 'Ana 3' }), 'letras y espacios');
    expectError(withField('admin', { fk_tipo_doc: 0 }), 'tipo de documento');
    expectError(withField('admin', { documento: '12' }), 'entre 5 y 15');
    expectError(withField('admin', { documento: '123-456' }), 'solo puede contener números');
    expectError(withField('admin', { telefono: 'abc' }), 'teléfono no es válido');
    expectError(withField('admin', { telefono: 99 }), 'teléfono no es válido');
    expect(validateCreateHotelInput(withField('admin', { fk_tipo_doc: 2, documento: '80012345-6' })).ok).toBe(true);
    expect(validateCreateHotelInput(withField('admin', { telefono: '' })).ok).toBe(true);
  });

  it('applies empresa rules', () => {
    expectError(withField('empresa', { ruc: '800123456' }), 'RUC');
    expectError(withField('empresa', { ruc: '80012345-67' }), 'RUC');
  });

  it('accepts a K check digit in the RUC', () => {
    expect(validateCreateHotelInput(withField('empresa', { ruc: '80012345-K' })).ok).toBe(true);
  });

  it('applies the remaining empresa and establecimiento rules', () => {
    expectError(withField('empresa', { razon_social: 'ab' }), 'razón social');
    expectError(withField('empresa', { nombre_fantasia: 'a'.repeat(121) }), 'fantasía');
    expectError(withField('empresa', { fk_contribuyente: 'x' }), 'contribuyente');
    expectError(withField('empresa', { fk_regimen: -1 }), 'régimen');
    expectError(withField('establecimiento', { direccion: 'ab' }), 'dirección');
    expectError(withField('establecimiento', { fk_barrio: null }), 'barrio');
    expectError(withField('establecimiento', { numero_casa: 'x'.repeat(11) }), 'establecimiento');
    expectError(withField('establecimiento', { telefono: 'abc' }), 'teléfono del establecimiento');
    expectError(withField('establecimiento', { email: 'no-es-correo' }), 'correo');
  });

  it('never reads auth_id or tenant data from the body', () => {
    const result = validateCreateHotelInput({
      ...valid,
      admin: { ...valid.admin, auth_id: 'attacker' },
      tenant_id: 99,
    });
    expect(result.ok).toBe(true);
    expect(JSON.stringify(result.ok && result.value)).not.toMatch(/attacker|99/);
  });
});

describe('buildProvisionPayload', () => {
  it('uses the caller as admin account and keeps the fn_provision_tenant shape', () => {
    const parsed = validateCreateHotelInput(valid);
    if (!parsed.ok) throw new Error('fixture must be valid');
    const payload = buildProvisionPayload(parsed.value, 'caller-uuid');
    expect(payload.admin.auth_id).toBe('caller-uuid');
    expect(payload.tenant).toEqual({ nombre: 'Hotel Sol', slug: 'hotel-sol' });
    expect(payload.empresa).toMatchObject({ ruc: '80012345-6', fk_contribuyente: 1, fk_regimen: 2 });
    expect(payload.establecimiento).toMatchObject({ direccion: 'Calle 1 esq. 2', fk_barrio: 5 });
  });
});

describe('checkHotelEligibility', () => {
  it('lets an account with no hotel open its first one', () => {
    expect(checkHotelEligibility([])).toEqual({ ok: true });
  });

  it('lets an administrator of every hotel open another', () => {
    expect(checkHotelEligibility(['admin', ' Administrador '])).toEqual({ ok: true });
  });

  it.each([['gerente'], ['recepcionista'], ['admin', 'limpiador'], ['']])(
    'denies non-admin profiles (%s)',
    (...cargos) => {
      expect(checkHotelEligibility(cargos.flat())).toEqual({
        ok: false,
        status: 403,
        error: 'Solo un administrador puede crear hoteles.',
      });
    },
  );

  it('denies an account that reached the hotel limit', () => {
    const full = Array.from({ length: MAX_HOTELS_PER_ACCOUNT }, () => 'admin');
    expect(checkHotelEligibility(full)).toMatchObject({ ok: false, status: 403, error: /máximo/ });
    expect(checkHotelEligibility(full.slice(1))).toEqual({ ok: true });
  });
});

describe('mapProvisionError', () => {
  it('maps a duplicate RUC and a duplicate slug to 409 with different messages', () => {
    const ruc = mapProvisionError({
      code: '23505',
      message: 'duplicate key value violates unique constraint "datos_empresa_ruc_key"',
    });
    const slug = mapProvisionError({ code: '23505', message: 'El identificador "hotel-ruc" ya esta en uso.' });
    expect(ruc).toEqual({ status: 409, message: 'Ya existe un hotel registrado con ese RUC.' });
    expect(slug.status).toBe(409);
    expect(slug.message).toMatch(/identificador/);
  });

  it('maps check and foreign key violations to 400', () => {
    expect(mapProvisionError({ code: '23514' }).status).toBe(400);
    expect(mapProvisionError({ code: '23503' }).status).toBe(400);
  });

  it('hides anything else behind a generic 500', () => {
    expect(mapProvisionError({ code: 'XX000', message: 'secret internals' })).toEqual({
      status: 500,
      message: 'No se pudo crear el hotel.',
    });
  });
});
