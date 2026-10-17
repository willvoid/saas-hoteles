import { describe, expect, it } from 'vitest';
import {
  validateCategoriaInput,
  validateDateRange,
  validateId,
  validateListFilters,
  validateMovimientoInput,
  validateMovimientoPatch,
} from './validation.ts';

const UUID = '3f2b8c1e-5a4d-4e6f-9a1b-0c2d3e4f5a6b';

describe('validateDateRange', () => {
  it('accepts a valid range, including equal dates', () => {
    expect(validateDateRange({ desde: '2026-01-01', hasta: '2026-01-31' })).toEqual({
      ok: true,
      value: { desde: '2026-01-01', hasta: '2026-01-31' },
    });
    expect(validateDateRange({ desde: '2026-02-03', hasta: '2026-02-03' }).ok).toBe(true);
  });
  it.each([
    [{ desde: '2026-1-1', hasta: '2026-01-31' }],
    [{ desde: '2026-02-30', hasta: '2026-03-01' }],
    [{ desde: '2026-01-01' }],
    [{ desde: 20260101, hasta: '2026-01-31' }],
  ])('rejects bad dates %j', (body) => {
    expect(validateDateRange(body).ok).toBe(false);
  });
  it('rejects desde after hasta', () => {
    expect(validateDateRange({ desde: '2026-02-01', hasta: '2026-01-31' }).ok).toBe(false);
  });
});

describe('validateId', () => {
  it('accepts a uuid and rejects others', () => {
    expect(validateId(UUID)).toBe(true);
    expect(validateId('abc')).toBe(false);
    expect(validateId(5)).toBe(false);
    expect(validateId(undefined)).toBe(false);
  });
});

describe('validateListFilters', () => {
  const range = { desde: '2026-01-01', hasta: '2026-01-31' };
  it('accepts no filters', () => {
    expect(validateListFilters(range)).toEqual({ ok: true, value: { ...range, tipo: null, categoria_id: null } });
  });
  it('accepts tipo and categoria_id', () => {
    expect(validateListFilters({ ...range, tipo: 'egreso', categoria_id: UUID })).toEqual({
      ok: true,
      value: { ...range, tipo: 'egreso', categoria_id: UUID },
    });
  });
  it('rejects bad tipo or categoria_id', () => {
    expect(validateListFilters({ ...range, tipo: 'x' }).ok).toBe(false);
    expect(validateListFilters({ ...range, categoria_id: 'x' }).ok).toBe(false);
  });
});

describe('validateMovimientoInput', () => {
  const base = { tipo: 'egreso', categoria_id: UUID, monto: 150000, fecha: '2026-03-10' };
  it('accepts a minimal movement and trims text', () => {
    expect(validateMovimientoInput({ ...base, descripcion: '  Hosting  ', referencia: '' })).toEqual({
      ok: true,
      value: { ...base, descripcion: 'Hosting', referencia: null },
    });
  });
  it.each([0, -1, 1.5, '100', NaN, null])('rejects monto %s', (monto) => {
    expect(validateMovimientoInput({ ...base, monto }).ok).toBe(false);
  });
  it('rejects bad tipo, categoria, fecha', () => {
    expect(validateMovimientoInput({ ...base, tipo: 'otro' }).ok).toBe(false);
    expect(validateMovimientoInput({ ...base, categoria_id: 'x' }).ok).toBe(false);
    expect(validateMovimientoInput({ ...base, fecha: '10/03/2026' }).ok).toBe(false);
  });
  it('rejects overlong text', () => {
    expect(validateMovimientoInput({ ...base, descripcion: 'x'.repeat(501) }).ok).toBe(false);
    expect(validateMovimientoInput({ ...base, referencia: 'x'.repeat(201) }).ok).toBe(false);
  });
});

describe('validateMovimientoPatch', () => {
  it('requires a valid id and at least one field', () => {
    expect(validateMovimientoPatch({ id: 'x', monto: 5 }).ok).toBe(false);
    expect(validateMovimientoPatch({ id: UUID }).ok).toBe(false);
  });
  it('returns only the provided fields', () => {
    expect(validateMovimientoPatch({ id: UUID, monto: 500, descripcion: ' hi ' })).toEqual({
      ok: true,
      value: { id: UUID, changes: { monto: 500, descripcion: 'hi' } },
    });
  });
  it('validates provided fields', () => {
    expect(validateMovimientoPatch({ id: UUID, monto: -3 }).ok).toBe(false);
    expect(validateMovimientoPatch({ id: UUID, fecha: 'nope' }).ok).toBe(false);
    expect(validateMovimientoPatch({ id: UUID, tipo: 'zzz' }).ok).toBe(false);
  });
});

describe('validateCategoriaInput', () => {
  it('trims nombre and accepts optional id', () => {
    expect(validateCategoriaInput({ nombre: '  Hosting ', tipo: 'egreso' })).toEqual({
      ok: true,
      value: { id: null, nombre: 'Hosting', tipo: 'egreso' },
    });
    expect(validateCategoriaInput({ id: UUID, nombre: 'A', tipo: 'ingreso' }).ok).toBe(true);
  });
  it('rejects blank, long nombre, bad tipo, bad id', () => {
    expect(validateCategoriaInput({ nombre: '   ', tipo: 'egreso' }).ok).toBe(false);
    expect(validateCategoriaInput({ nombre: 'x'.repeat(61), tipo: 'egreso' }).ok).toBe(false);
    expect(validateCategoriaInput({ nombre: 'ok', tipo: 'x' }).ok).toBe(false);
    expect(validateCategoriaInput({ id: 'x', nombre: 'ok', tipo: 'egreso' }).ok).toBe(false);
  });
});
