import { describe, expect, it } from 'vitest';
import {
  canAssignCargo,
  canCreateUsers,
  escapeLikePattern,
  isStaffCargo,
  mapAuthCreateError,
  normalizeCargo,
  parsePositiveInt,
  validateCreateUserInput,
} from './validation.ts';

const valid = {
  correo: 'Juan@Hotel.com',
  clave: 'secreto123',
  nombre: 'Juan Pérez',
  documento: '1234567',
  telefono: '+595 981 123456',
  usuario: 'juan_perez',
  fk_tipo_doc: 1,
  fk_cargo: 3,
};

function expectError(body: unknown, message: string | RegExp) {
  const result = validateCreateUserInput(body);
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.error).toMatch(message);
}

describe('validateCreateUserInput', () => {
  it('accepts a valid payload and normalizes it', () => {
    const result = validateCreateUserInput({ ...valid, nombre: '  Juan Pérez ' });
    expect(result).toEqual({
      ok: true,
      value: {
        correo: 'juan@hotel.com',
        clave: 'secreto123',
        nombre: 'Juan Pérez',
        documento: '1234567',
        telefono: '+595 981 123456',
        usuario: 'juan_perez',
        fk_tipo_doc: 1,
        fk_cargo: 3,
      },
    });
  });

  it('accepts numeric strings for the foreign keys', () => {
    const result = validateCreateUserInput({ ...valid, fk_tipo_doc: '1', fk_cargo: '3' });
    expect(result.ok && [result.value.fk_tipo_doc, result.value.fk_cargo]).toEqual([1, 3]);
  });

  it.each([null, undefined, 'x', 42, []])('rejects a non-object body (%s)', (body) => {
    expectError(body, 'Cuerpo inválido.');
  });

  it.each(['correo', 'clave', 'nombre', 'documento', 'usuario', 'fk_tipo_doc', 'fk_cargo'])(
    'requires %s',
    (key) => {
      expectError({ ...valid, [key]: '' }, 'Faltan campos obligatorios.');
      expectError({ ...valid, [key]: undefined }, 'Faltan campos obligatorios.');
    },
  );

  it('rejects non-string text fields', () => {
    expectError({ ...valid, nombre: 123 }, 'no son válidos');
    expectError({ ...valid, clave: { a: 1 } }, 'no son válidos');
  });

  it('applies nombre rules', () => {
    expectError({ ...valid, nombre: 'Jo' }, 'al menos 3');
    expectError({ ...valid, nombre: 'a'.repeat(61) }, '60');
    expectError({ ...valid, nombre: 'Juan 3' }, 'solo puede contener letras');
  });

  it('applies correo rules', () => {
    expectError({ ...valid, correo: 'no-es-correo' }, 'correo electrónico válido');
    expectError({ ...valid, correo: 'a..b@hotel.com' }, 'correo electrónico válido');
    expectError({ ...valid, correo: `${'a'.repeat(95)}@h.com` }, 'correo electrónico válido');
  });

  it('applies usuario rules', () => {
    expectError({ ...valid, usuario: 'abc' }, 'al menos 4');
    expectError({ ...valid, usuario: 'a'.repeat(21) }, '20');
    expectError({ ...valid, usuario: 'juan perez' }, 'letras, números y guión bajo');
  });

  it('applies documento rules by document type', () => {
    expectError({ ...valid, documento: '123-456' }, 'solo puede contener números');
    expectError({ ...valid, documento: '1234' }, 'entre 5 y 15');
    expectError({ ...valid, documento: '1'.repeat(16) }, 'entre 5 y 15');
    expect(validateCreateUserInput({ ...valid, fk_tipo_doc: 2, documento: '80012345-6' }).ok).toBe(true);
    expectError({ ...valid, fk_tipo_doc: 2, documento: '800123456' }, 'guión');
    expectError({ ...valid, fk_tipo_doc: 2, documento: '8001-23A-6' }, 'solo puede contener números');
  });

  it('applies telefono rules and normalizes empty to null', () => {
    const empty = validateCreateUserInput({ ...valid, telefono: '' });
    expect(empty.ok && empty.value.telefono).toBeNull();
    const missing = validateCreateUserInput({ ...valid, telefono: null });
    expect(missing.ok && missing.value.telefono).toBeNull();
    expectError({ ...valid, telefono: 'abc' }, 'teléfono no es válido');
    expectError({ ...valid, telefono: '1'.repeat(26) }, 'teléfono no es válido');
    expectError({ ...valid, telefono: 12345 }, 'teléfono no es válido');
  });

  it('applies clave rules', () => {
    expectError({ ...valid, clave: 'abc 12345' }, 'espacios');
    expectError({ ...valid, clave: 'abc123' }, 'al menos 8');
    expectError({ ...valid, clave: 'a1'.repeat(37) }, '72');
    expectError({ ...valid, clave: 'sololetras' }, 'letra y un número');
    expectError({ ...valid, clave: '12345678' }, 'letra y un número');
  });

  it('rejects invalid foreign keys', () => {
    expectError({ ...valid, fk_cargo: 0 }, 'cargo no es válido');
    expectError({ ...valid, fk_cargo: 1.5 }, 'cargo no es válido');
    expectError({ ...valid, fk_cargo: 'abc' }, 'cargo no es válido');
    expectError({ ...valid, fk_tipo_doc: -1 }, 'tipo de documento');
  });

  it('never carries a tenant_id from the body into the result', () => {
    const result = validateCreateUserInput({ ...valid, tenant_id: 999, app_metadata: { tenant_id: 999 } });
    expect(result.ok).toBe(true);
    expect(result.ok && Object.keys(result.value)).not.toContain('tenant_id');
    expect(result.ok && JSON.stringify(result.value)).not.toContain('999');
  });
});

describe('parsePositiveInt', () => {
  it.each([
    [5, 5],
    ['7', 7],
    [' 8 ', 8],
    [0, null],
    [-2, null],
    [1.2, null],
    ['1.2', null],
    ['', null],
    [null, null],
    [Number.MAX_SAFE_INTEGER + 1, null],
  ])('parses %s', (input, expected) => {
    expect(parsePositiveInt(input)).toBe(expected);
  });
});

describe('cargo rules', () => {
  it('normalizes cargo names', () => {
    expect(normalizeCargo('  Gerente ')).toBe('gerente');
    expect(normalizeCargo(null)).toBe('');
  });

  it('lets only admin, administrador and gerente create users', () => {
    expect(['admin', 'Administrador', 'gerente'].map(canCreateUsers)).toEqual([true, true, true]);
    expect(['recepcionista', 'limpiador', '', null, undefined].map(canCreateUsers)).toEqual([
      false, false, false, false, false,
    ]);
  });

  it('recognizes staff cargos only', () => {
    expect(['admin', 'Recepcionista', 'limpiadora'].every(isStaffCargo)).toBe(true);
    expect(['superadmin', '', null].some(isStaffCargo)).toBe(false);
  });

  it.each([
    ['admin', 'administrador', true],
    ['administrador', 'admin', true],
    ['admin', 'gerente', true],
    ['gerente', 'recepcionista', true],
    ['gerente', 'gerente', true],
    ['gerente', 'administrador', false],
    ['gerente', 'Admin', false],
    ['recepcionista', 'limpiador', false],
    ['admin', 'superadmin', false],
    [null, 'recepcionista', false],
  ])('canAssignCargo(%s -> %s) = %s', (caller, cargo, expected) => {
    expect(canAssignCargo(caller, cargo)).toBe(expected);
  });
});

describe('escapeLikePattern', () => {
  it('escapes ilike wildcards and the escape character', () => {
    expect(escapeLikePattern('a_b%c\\d')).toBe('a\\_b\\%c\\\\d');
    expect(escapeLikePattern('plain@mail.com')).toBe('plain@mail.com');
  });
});

describe('mapAuthCreateError', () => {
  it('maps duplicate emails to 409', () => {
    expect(mapAuthCreateError({ code: 'email_exists', status: 422 }).status).toBe(409);
    expect(mapAuthCreateError({ code: 'user_already_exists', status: 422 }).message).toMatch(/correo/);
  });

  it('maps validation errors to 400', () => {
    expect(mapAuthCreateError({ code: 'weak_password' }).status).toBe(400);
    expect(mapAuthCreateError({ code: 'email_address_invalid' }).status).toBe(400);
  });

  it('maps rate limits to 429', () => {
    expect(mapAuthCreateError({ code: 'over_request_rate_limit' }).status).toBe(429);
    expect(mapAuthCreateError({ status: 429 }).status).toBe(429);
  });

  it('hides unknown errors behind a generic 500', () => {
    expect(mapAuthCreateError({ code: 'unexpected_failure', status: 500 })).toEqual({
      status: 500,
      message: 'No se pudo crear la cuenta.',
    });
  });
});
