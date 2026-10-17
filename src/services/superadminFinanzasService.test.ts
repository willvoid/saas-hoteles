import { beforeEach, describe, expect, it, vi } from 'vitest';

const invoke = vi.fn();
vi.mock('./supabaseClient', () => ({ supabase: { functions: { invoke: (...a: unknown[]) => invoke(...a) } } }));

import {
  anularMovimiento,
  createMovimiento,
  getFinanzasResumen,
  listCategorias,
  listMovimientos,
  setCategoriaActiva,
  updateMovimiento,
  upsertCategoria,
} from './superadminFinanzasService';

const ok = (data: unknown) => invoke.mockResolvedValue({ data: { data }, error: null });
const sentBody = () => (invoke.mock.calls[0][1] as { body: Record<string, unknown> }).body;

describe('superadminFinanzasService', () => {
  beforeEach(() => invoke.mockReset());

  it('getFinanzasResumen sends the range and unwraps data', async () => {
    const resumen = { totales: { neto: 5 }, serie_mensual: [], por_categoria: [], por_tenant: [], mrr: 0 };
    ok(resumen);
    await expect(getFinanzasResumen('2026-10-01', '2026-10-31')).resolves.toEqual(resumen);
    expect(invoke).toHaveBeenCalledWith('superadmin', {
      body: { action: 'finanzas_resumen', desde: '2026-10-01', hasta: '2026-10-31' },
    });
  });

  it('listMovimientos sends optional filters', async () => {
    ok([]);
    await listMovimientos({ desde: '2026-10-01', hasta: '2026-10-31', tipo: 'egreso', categoria_id: 'c1' });
    expect(sentBody()).toEqual({
      action: 'list_movimientos',
      desde: '2026-10-01',
      hasta: '2026-10-31',
      tipo: 'egreso',
      categoria_id: 'c1',
    });
  });

  it('createMovimiento spreads the input', async () => {
    ok({ id: 'm1' });
    const input = {
      tipo: 'egreso' as const,
      categoria_id: 'c1',
      monto: 1000,
      fecha: '2026-10-02',
      descripcion: null,
      referencia: null,
    };
    await expect(createMovimiento(input)).resolves.toEqual({ id: 'm1' });
    expect(sentBody()).toEqual({ action: 'create_movimiento', ...input });
  });

  it('updateMovimiento sends id and changes', async () => {
    ok({ id: 'm1' });
    await updateMovimiento('m1', { monto: 5 });
    expect(sentBody()).toEqual({ action: 'update_movimiento', id: 'm1', monto: 5 });
  });

  it('anularMovimiento sends id', async () => {
    ok({ id: 'm1' });
    await anularMovimiento('m1');
    expect(sentBody()).toEqual({ action: 'anular_movimiento', id: 'm1' });
  });

  it('listCategorias sends the action', async () => {
    ok([]);
    await listCategorias();
    expect(sentBody()).toEqual({ action: 'list_categorias' });
  });

  it('upsertCategoria sends the input', async () => {
    ok({ id: 'c1' });
    await upsertCategoria({ nombre: 'Hosting', tipo: 'egreso' });
    expect(sentBody()).toEqual({ action: 'upsert_categoria', nombre: 'Hosting', tipo: 'egreso' });
  });

  it('setCategoriaActiva sends id and activo', async () => {
    ok({ id: 'c1', activo: false });
    await setCategoriaActiva('c1', false);
    expect(sentBody()).toEqual({ action: 'set_categoria_activa', id: 'c1', activo: false });
  });

  it('propagates function errors', async () => {
    invoke.mockResolvedValue({ data: { error: 'Boom' }, error: null });
    await expect(listCategorias()).rejects.toThrow('Boom');
  });
});
