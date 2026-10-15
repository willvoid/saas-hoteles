import { beforeEach, describe, expect, it, vi } from 'vitest';

// Records every chained call and resolves with the configured result.
const calls: { table: string; method: string; args: unknown[] }[] = [];
let result: { data: unknown; error: { message: string } | null } = { data: [], error: null };

vi.mock('./supabaseClient', () => {
  const from = (table: string) => {
    const builder: Record<string, unknown> = {};
    const chain = (method: string) => (...args: unknown[]) => {
      calls.push({ table, method, args });
      return builder;
    };
    for (const m of [
      'select', 'insert', 'update', 'delete', 'upsert', 'eq', 'gte', 'lte', 'order', 'single',
    ]) builder[m] = chain(m);
    builder.then = (resolve: (v: unknown) => void) => resolve(result);
    return builder;
  };
  return { supabase: { from } };
});

import { finanzasService } from './finanzasService';

const has = (table: string, method: string, ...args: unknown[]) =>
  calls.some((c) => c.table === table && c.method === method && JSON.stringify(c.args) === JSON.stringify(args));

describe('finanzasService', () => {
  beforeEach(() => {
    calls.length = 0;
    result = { data: [], error: null };
  });

  describe('proveedores', () => {
    it('lists all suppliers ordered by name', async () => {
      result = { data: [{ id: 1, nombre: 'ANDE' }], error: null };
      const r = await finanzasService.getProveedores();
      expect(r).toHaveLength(1);
      expect(has('proveedores', 'order', 'nombre', { ascending: true })).toBe(true);
      expect(calls.some((c) => c.method === 'eq')).toBe(false);
    });

    it('can restrict to active suppliers', async () => {
      await finanzasService.getProveedores({ soloActivos: true });
      expect(has('proveedores', 'eq', 'activo', true)).toBe(true);
    });

    it('creates, updates and toggles a supplier', async () => {
      result = { data: { id: 5, nombre: 'Aguas' }, error: null };
      const p = await finanzasService.crearProveedor({ nombre: 'Aguas', ruc: '800-1' });
      expect(p.id).toBe(5);
      expect(has('proveedores', 'insert', { nombre: 'Aguas', ruc: '800-1' })).toBe(true);

      await finanzasService.actualizarProveedor(5, { telefono: '021' });
      expect(has('proveedores', 'update', { telefono: '021' })).toBe(true);
      expect(has('proveedores', 'eq', 'id', 5)).toBe(true);

      await finanzasService.setProveedorActivo(5, false);
      expect(has('proveedores', 'update', { activo: false })).toBe(true);
    });

    it('propagates the database message unchanged', async () => {
      result = { data: null, error: { message: 'Ya existe un proveedor con ese RUC.' } };
      await expect(finanzasService.crearProveedor({ nombre: 'X', ruc: '1' })).rejects.toThrow(
        'Ya existe un proveedor con ese RUC.',
      );
    });
  });

  describe('categorias', () => {
    it('filters by type and active flag', async () => {
      await finanzasService.getCategorias({ tipo: 'egreso', soloActivas: true });
      expect(has('categorias_finanzas', 'eq', 'tipo', 'egreso')).toBe(true);
      expect(has('categorias_finanzas', 'eq', 'activo', true)).toBe(true);
    });

    it('creates, updates and toggles a category', async () => {
      result = { data: { id: 9 }, error: null };
      await finanzasService.crearCategoria({ nombre: 'Luz', tipo: 'egreso', fk_cuenta_contable: 40 });
      expect(has('categorias_finanzas', 'insert', { nombre: 'Luz', tipo: 'egreso', fk_cuenta_contable: 40 })).toBe(true);
      await finanzasService.actualizarCategoria(9, { nombre: 'Electricidad' });
      expect(has('categorias_finanzas', 'update', { nombre: 'Electricidad' })).toBe(true);
      await finanzasService.setCategoriaActiva(9, false);
      expect(has('categorias_finanzas', 'update', { activo: false })).toBe(true);
    });

    it('propagates errors', async () => {
      result = { data: null, error: { message: 'boom' } };
      await expect(finanzasService.getCategorias()).rejects.toThrow('boom');
    });
  });

  describe('fondos', () => {
    it('lists, creates, updates and toggles funds', async () => {
      await finanzasService.getFondos({ soloActivos: true });
      expect(has('cuentas_fondos', 'eq', 'activo', true)).toBe(true);

      result = { data: { id: 2 }, error: null };
      await finanzasService.crearFondo({ nombre: 'Banco Itau', tipo: 'banco' });
      expect(has('cuentas_fondos', 'insert', { nombre: 'Banco Itau', tipo: 'banco' })).toBe(true);
      await finanzasService.actualizarFondo(2, { nombre: 'Itau PYG' });
      expect(has('cuentas_fondos', 'update', { nombre: 'Itau PYG' })).toBe(true);
      await finanzasService.setFondoActivo(2, false);
      expect(has('cuentas_fondos', 'update', { activo: false })).toBe(true);
    });

    it('propagates errors', async () => {
      result = { data: null, error: { message: 'No se puede desactivar el fondo.' } };
      await expect(finanzasService.setFondoActivo(1, false)).rejects.toThrow('No se puede desactivar el fondo.');
    });
  });

  describe('medios de pago por fondo', () => {
    it('upserts by payment method and deletes by id', async () => {
      result = { data: { id: 3 }, error: null };
      await finanzasService.guardarMedioPagoFondo({ fk_modo_pago: 2, fk_fondo: 7 });
      expect(has('medios_pago_fondo', 'upsert', { fk_modo_pago: 2, fk_fondo: 7 }, { onConflict: 'tenant_id,fk_modo_pago' })).toBe(true);
      await finanzasService.eliminarMedioPagoFondo(3);
      expect(calls.some((c) => c.method === 'delete')).toBe(true);
      expect(has('medios_pago_fondo', 'eq', 'id', 3)).toBe(true);
    });

    it('lists the mappings', async () => {
      result = { data: [{ id: 1, fk_fondo: 7, fk_modo_pago: 2 }], error: null };
      expect(await finanzasService.getMediosPagoFondo()).toHaveLength(1);
    });
  });

  describe('transferencias', () => {
    it('lists by inclusive date range, newest first', async () => {
      await finanzasService.getTransferencias('2026-03-01', '2026-03-31');
      expect(has('transferencias_fondos', 'gte', 'fecha', '2026-03-01')).toBe(true);
      expect(has('transferencias_fondos', 'lte', 'fecha', '2026-03-31')).toBe(true);
      expect(has('transferencias_fondos', 'order', 'fecha', { ascending: false })).toBe(true);
    });

    it('creates and annuls', async () => {
      result = { data: { id: 4 }, error: null };
      const nueva = { fk_fondo_origen: 1, fk_fondo_destino: 2, monto: 500000 };
      await finanzasService.crearTransferencia(nueva);
      expect(has('transferencias_fondos', 'insert', nueva)).toBe(true);
      await finanzasService.anularTransferencia(4);
      expect(has('transferencias_fondos', 'update', { estado: 'ANULADO' })).toBe(true);
      expect(has('transferencias_fondos', 'eq', 'id', 4)).toBe(true);
    });

    it('surfaces a closed-month error as is', async () => {
      result = { data: null, error: { message: 'El periodo 2026-02 esta cerrado.' } };
      await expect(
        finanzasService.crearTransferencia({ fk_fondo_origen: 1, fk_fondo_destino: 2, monto: 1 }),
      ).rejects.toThrow('El periodo 2026-02 esta cerrado.');
    });
  });

  describe('saldos iniciales', () => {
    it('lists, creates and annuls', async () => {
      await finanzasService.getSaldosIniciales();
      expect(has('saldos_iniciales_fondos', 'order', 'fecha', { ascending: false })).toBe(true);

      result = { data: { id: 8 }, error: null };
      await finanzasService.crearSaldoInicial({ fk_cuenta_fondo: 1, monto: 100000, fecha: '2026-03-01' });
      expect(has('saldos_iniciales_fondos', 'insert', { fk_cuenta_fondo: 1, monto: 100000, fecha: '2026-03-01' })).toBe(true);
      await finanzasService.anularSaldoInicial(8);
      expect(has('saldos_iniciales_fondos', 'update', { estado: 'ANULADO' })).toBe(true);
    });

    it('propagates errors', async () => {
      result = { data: null, error: { message: 'boom' } };
      await expect(finanzasService.anularSaldoInicial(1)).rejects.toThrow('boom');
    });
  });
});
