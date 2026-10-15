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
    for (const m of ['select', 'order']) builder[m] = chain(m);
    builder.then = (resolve: (v: unknown) => void) => resolve(result);
    return builder;
  };
  const rpc = (fn: string, args: unknown) => {
    calls.push({ table: 'rpc', method: fn, args: [args] });
    return Promise.resolve(result);
  };
  return { supabase: { from, rpc } };
});

import { periodoService } from './periodoService';

describe('periodoService', () => {
  beforeEach(() => {
    calls.length = 0;
    result = { data: [], error: null };
  });

  it('lists locked periods newest first', async () => {
    result = { data: [{ anio: 2026, mes: 2 }], error: null };
    const r = await periodoService.getPeriodosCerrados();
    expect(r).toEqual([{ anio: 2026, mes: 2 }]);
    expect(calls).toContainEqual({ table: 'periodos_cerrados', method: 'order', args: ['anio', { ascending: false }] });
    expect(calls).toContainEqual({ table: 'periodos_cerrados', method: 'order', args: ['mes', { ascending: false }] });
  });

  it('closes a month through fn_cerrar_mes', async () => {
    await periodoService.cerrarMes(2026, 2);
    expect(calls).toContainEqual({ table: 'rpc', method: 'fn_cerrar_mes', args: [{ p_anio: 2026, p_mes: 2 }] });
  });

  it('reopens a month through fn_reabrir_mes', async () => {
    await periodoService.reabrirMes(2026, 2);
    expect(calls).toContainEqual({ table: 'rpc', method: 'fn_reabrir_mes', args: [{ p_anio: 2026, p_mes: 2 }] });
  });

  it('surfaces the database message when closing fails', async () => {
    result = { data: null, error: { message: 'El periodo ya esta cerrado.' } };
    await expect(periodoService.cerrarMes(2026, 2)).rejects.toThrow('El periodo ya esta cerrado.');
  });

  it('surfaces the database message when reopening fails', async () => {
    result = { data: null, error: { message: 'El periodo no esta cerrado.' } };
    await expect(periodoService.reabrirMes(2026, 2)).rejects.toThrow('El periodo no esta cerrado.');
  });

  it('surfaces list errors', async () => {
    result = { data: null, error: { message: 'boom' } };
    await expect(periodoService.getPeriodosCerrados()).rejects.toThrow('boom');
  });
});
