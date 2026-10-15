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
    for (const m of ['select', 'insert', 'update', 'eq', 'gt', 'gte', 'lte', 'order', 'single']) {
      builder[m] = chain(m);
    }
    builder.then = (resolve: (v: unknown) => void) => resolve(result);
    return builder;
  };
  return { supabase: { from } };
});

import { cobroService } from './cobroService';

const has = (table: string, method: string, ...args: unknown[]) =>
  calls.some((c) => c.table === table && c.method === method && JSON.stringify(c.args) === JSON.stringify(args));

describe('cobroService', () => {
  beforeEach(() => {
    calls.length = 0;
    result = { data: [], error: null };
  });

  describe('cobros', () => {
    it('lists by invoice', async () => {
      result = { data: [{ id: 1 }], error: null };
      expect(await cobroService.getCobrosPorFactura(12)).toHaveLength(1);
      expect(has('cobros', 'eq', 'fk_factura', 12)).toBe(true);
    });

    it('lists by inclusive date range', async () => {
      await cobroService.getCobros('2026-03-01', '2026-03-31');
      expect(has('cobros', 'gte', 'fecha', '2026-03-01')).toBe(true);
      expect(has('cobros', 'lte', 'fecha', '2026-03-31')).toBe(true);
    });

    it('creates and annuls', async () => {
      result = { data: { id: 3 }, error: null };
      const nuevo = { fk_factura: 12, fk_cuenta_fondo: 1, monto: 50000 };
      await cobroService.crearCobro(nuevo);
      expect(has('cobros', 'insert', nuevo)).toBe(true);
      await cobroService.anularCobro(3);
      expect(has('cobros', 'update', { estado: 'ANULADO' })).toBe(true);
      expect(has('cobros', 'eq', 'id', 3)).toBe(true);
    });

    it('propagates the database message', async () => {
      result = { data: null, error: { message: 'El monto supera el saldo pendiente.' } };
      await expect(
        cobroService.crearCobro({ fk_factura: 1, fk_cuenta_fondo: 1, monto: 9 }),
      ).rejects.toThrow('El monto supera el saldo pendiente.');
    });
  });

  describe('pagos', () => {
    it('lists by expense and by range', async () => {
      await cobroService.getPagosPorGasto(5);
      expect(has('pagos', 'eq', 'fk_gasto', 5)).toBe(true);
      await cobroService.getPagos('2026-03-01', '2026-03-31');
      expect(has('pagos', 'gte', 'fecha', '2026-03-01')).toBe(true);
      expect(has('pagos', 'lte', 'fecha', '2026-03-31')).toBe(true);
    });

    it('creates and annuls', async () => {
      result = { data: { id: 6 }, error: null };
      const nuevo = { fk_gasto: 5, fk_cuenta_fondo: 2, monto: 20000 };
      await cobroService.crearPago(nuevo);
      expect(has('pagos', 'insert', nuevo)).toBe(true);
      await cobroService.anularPago(6);
      expect(has('pagos', 'update', { estado: 'ANULADO' })).toBe(true);
      expect(has('pagos', 'eq', 'id', 6)).toBe(true);
    });

    it('propagates errors', async () => {
      result = { data: null, error: { message: 'boom' } };
      await expect(cobroService.anularPago(1)).rejects.toThrow('boom');
    });
  });

  describe('facturas pendientes', () => {
    it('selects issued credit invoices with a balance, with the client name', async () => {
      result = { data: [{ id_factura: 1, saldo_pendiente: 100 }], error: null };
      const r = await cobroService.getFacturasPendientes();
      expect(r).toHaveLength(1);
      expect(has('facturas', 'eq', 'estado', 'EMITIDA')).toBe(true);
      expect(has('facturas', 'eq', 'condicion_venta', 2)).toBe(true);
      expect(has('facturas', 'gt', 'saldo_pendiente', 0)).toBe(true);
      const select = calls.find((c) => c.table === 'facturas' && c.method === 'select');
      expect(String(select?.args[0])).toContain('clientes');
    });
  });
});
