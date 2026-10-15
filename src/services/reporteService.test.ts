import { beforeEach, describe, expect, it, vi } from 'vitest';

// Records every chained call made on the query builder and resolves with the
// rows configured per table.
const calls: { table: string; method: string; args: unknown[] }[] = [];
let rowsByTable: Record<string, unknown[]> = {};

vi.mock('./supabaseClient', () => {
  const from = (table: string) => {
    const builder: Record<string, unknown> = {};
    const chain = (method: string) => (...args: unknown[]) => {
      calls.push({ table, method, args });
      return builder;
    };
    for (const m of ['select', 'neq', 'eq', 'gte', 'lt', 'in', 'order']) builder[m] = chain(m);
    builder.then = (resolve: (v: unknown) => void) =>
      resolve({ data: rowsByTable[table] ?? [], error: null });
    return builder;
  };
  return { supabase: { from } };
});

import { reporteService } from './reporteService';

describe('reporteService cash-only income', () => {
  beforeEach(() => {
    calls.length = 0;
    rowsByTable = {};
  });

  it('getIngresos only counts cash (contado) invoices and still excludes ANULADA', async () => {
    rowsByTable.facturas = [
      { total_general: 100000, fk_modo_pago: 1, modo_pago: { descripcion: 'Efectivo' } },
    ];
    const r = await reporteService.getIngresos('2026-03-01', '2026-03-31');

    const facturaCalls = calls.filter(c => c.table === 'facturas');
    expect(facturaCalls).toContainEqual({ table: 'facturas', method: 'eq', args: ['condicion_venta', 1] });
    expect(facturaCalls).toContainEqual({ table: 'facturas', method: 'neq', args: ['estado', 'ANULADA'] });
    expect(r.total).toBe(100000);
  });

  it('getIngresos groups credit-free rows by payment method', async () => {
    rowsByTable.facturas = [
      { total_general: 50000, fk_modo_pago: 1, modo_pago: { descripcion: 'Efectivo' } },
      { total_general: 30000, fk_modo_pago: null, modo_pago: null },
    ];
    const r = await reporteService.getIngresos('2026-03-01', '2026-03-31');
    expect(r.porMetodo.map(m => m.metodo)).toEqual(['Efectivo', 'Sin especificar']);
  });

  it('getTurnos only sums cash invoices per shift', async () => {
    rowsByTable.apertura_cierre_caja = [
      {
        id_turno: 7, apertura: '2026-03-10T10:00:00Z', cierre: null,
        monto_inicial: 0, monto_final: 0, usuario: { nombre: 'Ana' }, caja: null,
      },
    ];
    rowsByTable.facturas = [{ fk_turno: 7, total_general: 20000 }];
    await reporteService.getTurnos('2026-03-01', '2026-03-31');

    const facturaCalls = calls.filter(c => c.table === 'facturas');
    expect(facturaCalls).toContainEqual({ table: 'facturas', method: 'eq', args: ['condicion_venta', 1] });
    expect(facturaCalls).toContainEqual({ table: 'facturas', method: 'neq', args: ['estado', 'ANULADA'] });
  });
});
