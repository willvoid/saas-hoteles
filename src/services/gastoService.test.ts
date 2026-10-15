import { beforeEach, describe, expect, it, vi } from 'vitest';

const calls: { table: string; method: string; args: unknown[] }[] = [];
let result: { data: unknown; error: { message: string } | null } = { data: [], error: null };

vi.mock('./supabaseClient', () => {
  const from = (table: string) => {
    const builder: Record<string, unknown> = {};
    const chain = (method: string) => (...args: unknown[]) => {
      calls.push({ table, method, args });
      return builder;
    };
    for (const m of ['select', 'insert', 'update', 'eq', 'gte', 'lte', 'order', 'single']) {
      builder[m] = chain(m);
    }
    builder.then = (resolve: (v: unknown) => void) => resolve(result);
    return builder;
  };
  return { supabase: { from } };
});

import { gastoService } from './gastoService';

const has = (method: string, ...args: unknown[]) =>
  calls.some((c) => c.table === 'gastos' && c.method === method && JSON.stringify(c.args) === JSON.stringify(args));

describe('gastoService', () => {
  beforeEach(() => {
    calls.length = 0;
    result = { data: [], error: null };
  });

  it('lists without filters ordered newest first', async () => {
    result = { data: [{ id: 1 }], error: null };
    const r = await gastoService.getGastos();
    expect(r).toHaveLength(1);
    expect(has('order', 'fecha', { ascending: false })).toBe(true);
    expect(calls.some((c) => c.method === 'eq' || c.method === 'gte' || c.method === 'lte')).toBe(false);
  });

  it('applies range, status, supplier and condition filters', async () => {
    await gastoService.getGastos({
      desde: '2026-03-01',
      hasta: '2026-03-31',
      estado: 'REGISTRADO',
      fk_proveedor: 4,
      condicion: 'credito',
    });
    expect(has('gte', 'fecha', '2026-03-01')).toBe(true);
    expect(has('lte', 'fecha', '2026-03-31')).toBe(true);
    expect(has('eq', 'estado', 'REGISTRADO')).toBe(true);
    expect(has('eq', 'fk_proveedor', 4)).toBe(true);
    expect(has('eq', 'condicion', 'credito')).toBe(true);
  });

  it('gets one expense by id', async () => {
    result = { data: { id: 7 }, error: null };
    const g = await gastoService.getGasto(7);
    expect(g.id).toBe(7);
    expect(has('eq', 'id', 7)).toBe(true);
  });

  it('creates sending only client-settable columns', async () => {
    result = { data: { id: 10 }, error: null };
    await gastoService.crearGasto({
      fecha: '2026-03-10',
      fk_categoria: 3,
      gravado_10: 110000,
      condicion: 'contado',
      fk_cuenta_fondo: 2,
      // Computed by the database trigger: must never be sent.
      iva_10: 999,
      total: 999,
      saldo_pendiente: 999,
      estado: 'ANULADO',
    } as never);
    const insert = calls.find((c) => c.method === 'insert');
    expect(insert?.args[0]).toEqual({
      fecha: '2026-03-10',
      fk_categoria: 3,
      gravado_10: 110000,
      condicion: 'contado',
      fk_cuenta_fondo: 2,
    });
  });

  it('annuls by setting estado to ANULADO', async () => {
    result = { data: { id: 7, estado: 'ANULADO' }, error: null };
    const g = await gastoService.anularGasto(7);
    expect(g.estado).toBe('ANULADO');
    expect(has('update', { estado: 'ANULADO' })).toBe(true);
    expect(has('eq', 'id', 7)).toBe(true);
  });

  it('propagates the database message', async () => {
    result = { data: null, error: { message: 'Anule primero los pagos' } };
    await expect(gastoService.anularGasto(7)).rejects.toThrow('Anule primero los pagos');
    await expect(gastoService.getGastos()).rejects.toThrow('Anule primero los pagos');
  });
});
