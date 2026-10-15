import { beforeEach, describe, expect, it, vi } from 'vitest';

// Records the inserts made per table and resolves every other call with the
// canned reference data the service needs to build an invoice.
const inserts: { table: string; payload: Record<string, unknown> }[] = [];
const selects: { table: string; columns: string }[] = [];

vi.mock('./supabaseClient', () => {
  const refRows: Record<string, unknown[]> = {
    establecimientos: [{ id_establecimiento: 1, estado_establecimiento: 'Activo' }],
    monedas: [{ id_monedas: 1, divisa: 'PYG' }],
    tipo_factura: [{ id_tipo_factura: 1, descripcion: 'Ticket interno' }],
  };
  const from = (table: string) => {
    const builder: Record<string, unknown> = {};
    builder.select = (columns: string) => {
      selects.push({ table, columns });
      return builder;
    };
    builder.insert = (payload: Record<string, unknown>) => {
      inserts.push({ table, payload });
      return builder;
    };
    for (const m of ['order', 'eq', 'limit']) builder[m] = () => builder;
    builder.single = () =>
      Promise.resolve({
        data: { id_factura: 99, ...inserts[inserts.length - 1]?.payload },
        error: null,
      });
    builder.maybeSingle = () => Promise.resolve({ data: null, error: null });
    builder.then = (resolve: (v: unknown) => void) =>
      resolve({ data: refRows[table] ?? [], error: null });
    return builder;
  };
  const rpc = () => Promise.resolve({ data: 7, error: null });
  return { supabase: { from, rpc } };
});

import { facturaService } from './facturaService';

const lineas = [
  { fk_concepto: 1, descripcion: 'Habitacion', cantidad: 1, precioUnitario: 110000, ivaRate: 10 },
];

function facturaInsertada() {
  return inserts.find((i) => i.table === 'facturas')!.payload;
}

describe('facturaService.crearFactura', () => {
  beforeEach(() => {
    inserts.length = 0;
    selects.length = 0;
  });

  it('keeps the contado payload unchanged when no condition is given', async () => {
    await facturaService.crearFactura({
      fk_cliente: 3,
      fk_modo_pago: 1,
      fk_turno: 5,
      esEfectivo: true,
      efectivo: 150000,
      lineas,
    });
    const p = facturaInsertada();
    expect(p.condicion_venta).toBe(1);
    expect(p.fk_modo_pago).toBe(1);
    expect(p.efectivo).toBe(150000);
    expect(p.vuelto).toBe(40000);
    expect(p).not.toHaveProperty('fecha_vencimiento');
  });

  it('sends a credit invoice without payment method, cash or change', async () => {
    await facturaService.crearFactura({
      fk_cliente: 3,
      fk_modo_pago: null,
      fk_turno: 5,
      esEfectivo: false,
      condicion_venta: 2,
      fecha_vencimiento: '2026-04-10',
      lineas,
    });
    const p = facturaInsertada();
    expect(p.condicion_venta).toBe(2);
    expect(p.fk_modo_pago).toBeNull();
    expect(p.efectivo).toBe(0);
    expect(p.vuelto).toBe(0);
    expect(p.fecha_vencimiento).toBe('2026-04-10');
    expect(p.total_general).toBe(110000);
  });

  it('omits the due date of a credit invoice when none is given', async () => {
    await facturaService.crearFactura({
      fk_cliente: 3,
      fk_modo_pago: 1,
      fk_turno: 5,
      esEfectivo: true,
      condicion_venta: 2,
      lineas,
    });
    const p = facturaInsertada();
    // Credit never carries a payment method even if the caller passed one.
    expect(p.fk_modo_pago).toBeNull();
    expect(p.fecha_vencimiento).toBeNull();
  });

  it('never sends a due date for a contado invoice', async () => {
    await facturaService.crearFactura({
      fk_cliente: 3,
      fk_modo_pago: 1,
      fk_turno: 5,
      esEfectivo: false,
      fecha_vencimiento: '2026-04-10',
      lineas,
    });
    expect(facturaInsertada()).not.toHaveProperty('fecha_vencimiento');
  });
});
