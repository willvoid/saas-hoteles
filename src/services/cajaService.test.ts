import { beforeEach, describe, expect, it, vi } from 'vitest';

type Res = { data?: unknown; error?: { message: string; code?: string } | null; count?: number | null };
const calls: { table: string; method: string; args: unknown[] }[] = [];
let results: Record<string, Res> = {};

vi.mock('./supabaseClient', () => {
  const from = (table: string) => {
    const builder: Record<string, unknown> = {};
    const chain = (method: string) => (...args: unknown[]) => {
      calls.push({ table, method, args });
      return builder;
    };
    for (const m of ['select', 'insert', 'update', 'eq', 'is', 'order', 'limit', 'single', 'maybeSingle']) {
      builder[m] = chain(m);
    }
    builder.then = (resolve: (v: unknown) => void) =>
      resolve({ data: null, error: null, count: null, ...results[table] });
    return builder;
  };
  return { supabase: { from } };
});

import { cajaService } from './cajaService';

const has = (table: string, method: string, ...args: unknown[]) =>
  calls.some((c) => c.table === table && c.method === method && JSON.stringify(c.args) === JSON.stringify(args));

describe('cajaService', () => {
  beforeEach(() => {
    calls.length = 0;
    results = {};
  });

  it('auto-increments nro_caja within the establishment', async () => {
    results = { caja: { data: [{ nro_caja: 4 }] } };
    await cajaService.createCaja({ descripcion_caja: 'Main', fk_establecimientos: 2 });
    expect(has('caja', 'eq', 'fk_establecimientos', 2)).toBe(true);
    expect(has('caja', 'insert', { nro_caja: 5, descripcion_caja: 'Main', fk_establecimientos: 2 })).toBe(true);
  });

  it('starts at 1 when the establishment has no cajas', async () => {
    results = { caja: { data: [] } };
    await cajaService.createCaja({ descripcion_caja: 'First', fk_establecimientos: 1 });
    expect(has('caja', 'insert', { nro_caja: 1, descripcion_caja: 'First', fk_establecimientos: 1 })).toBe(true);
  });

  it('maps plan limit error 23514 to a readable message', async () => {
    results = { caja: { data: [], error: { message: 'El plan pro permite hasta 3 cajas por hotel y ya hay 3.', code: '23514' } } };
    await expect(
      cajaService.createCaja({ nro_caja: 2, descripcion_caja: 'X', fk_establecimientos: 1 }),
    ).rejects.toThrow('El plan pro permite hasta 3 cajas por hotel y ya hay 3.');
  });

  it('falls back to a readable message when 23514 carries none', async () => {
    results = { caja: { data: [], error: { message: '', code: '23514' } } };
    await expect(cajaService.setEstadoCaja(1, 'Inactivo')).rejects.toThrow(/límite|turno/);
  });

  it('getCajasConEstado returns only active cajas', async () => {
    results = { caja: { data: [{ id_caja: 1 }] }, apertura_cierre_caja: { data: [] } };
    await cajaService.getCajasConEstado();
    expect(has('caja', 'eq', 'estado', 'Activo')).toBe(true);
  });

  it('getLimiteCajas returns total and plan max', async () => {
    results = {
      caja: { count: 3 },
      tenants: { data: { plan: 'pro' } },
      planes: { data: { max_cajas: 3 } },
    };
    expect(await cajaService.getLimiteCajas()).toEqual({ total: 3, max: 3 });
  });
});
