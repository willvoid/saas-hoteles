import { describe, expect, it } from 'vitest';
import { checkSwitchAccess, validateSwitchInput } from './validation.ts';

describe('validateSwitchInput', () => {
  it('accepts a numeric id or a numeric string', () => {
    expect(validateSwitchInput({ tenant_id: 7 })).toEqual({ ok: true, value: { tenant_id: 7 } });
    expect(validateSwitchInput({ tenant_id: '7' })).toEqual({ ok: true, value: { tenant_id: 7 } });
  });

  it.each([null, undefined, 'x', 3, []])('rejects a non-object body (%s)', (body) => {
    expect(validateSwitchInput(body)).toEqual({ ok: false, error: 'Cuerpo inválido.' });
  });

  it.each([undefined, null, 0, -1, 1.5, 'abc', '', {}])('rejects tenant_id %s', (tenant_id) => {
    expect(validateSwitchInput({ tenant_id })).toEqual({
      ok: false,
      error: 'El hotel seleccionado no es válido.',
    });
  });

  it('ignores other body fields', () => {
    const result = validateSwitchInput({ tenant_id: 2, fk_cargo: 1, app_metadata: { tenant_id: 9 } });
    expect(result).toEqual({ ok: true, value: { tenant_id: 2 } });
  });
});

describe('checkSwitchAccess', () => {
  const activo = { estado: 'Activo' };

  it.each(['trial', 'activo', 'Activo '])('allows a %s hotel', (estado) => {
    expect(checkSwitchAccess(activo, { estado, plan: 'trial' })).toEqual({ ok: true });
  });

  it('denies without a profile or without a tenant, with the same message', () => {
    const noProfile = checkSwitchAccess(null, { estado: 'activo', plan: 'trial' });
    const noTenant = checkSwitchAccess(activo, null);
    expect(noProfile).toEqual({ ok: false, status: 403, error: 'No tienes acceso a ese hotel.' });
    expect(noTenant).toEqual(noProfile);
  });

  it('denies an inactive profile', () => {
    const result = checkSwitchAccess({ estado: 'Inactivo' }, { estado: 'activo', plan: 'trial' });
    expect(result).toMatchObject({ ok: false, status: 403, error: 'No tienes acceso a ese hotel.' });
  });

  it('denies the template tenant', () => {
    const result = checkSwitchAccess(activo, { estado: 'suspendido', plan: 'plantilla' });
    expect(result).toMatchObject({ ok: false, error: 'No tienes acceso a ese hotel.' });
  });

  it('denies a suspended hotel with its own message', () => {
    expect(checkSwitchAccess(activo, { estado: 'suspendido', plan: 'pro' })).toEqual({
      ok: false,
      status: 403,
      error: 'El hotel está suspendido.',
    });
  });
});
