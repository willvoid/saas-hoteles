import { beforeEach, describe, expect, it, vi } from 'vitest';

const calls: { fn: string; args: unknown }[] = [];
let result: { data: unknown; error: { message: string } | null } = { data: [], error: null };

vi.mock('./supabaseClient', () => ({
  supabase: {
    rpc: (fn: string, args: unknown) => {
      calls.push({ fn, args });
      return Promise.resolve(result);
    },
  },
}));

import { reporteFinanzasService } from './reporteFinanzasService';

describe('reporteFinanzasService', () => {
  beforeEach(() => {
    calls.length = 0;
    result = { data: [], error: null };
  });

  it('getResultado calls fn_rep_resultado with the exact p_* names and coerces numerics', async () => {
    result = {
      data: [{ mes: '2026-03-01', fk_categoria: 1, categoria: 'Habitaciones', tipo: 'ingreso', monto: '1500000' }],
      error: null,
    };
    const r = await reporteFinanzasService.getResultado('2026-03-01', '2026-03-31');
    expect(calls).toEqual([{ fn: 'fn_rep_resultado', args: { p_desde: '2026-03-01', p_hasta: '2026-03-31' } }]);
    expect(r[0].monto).toBe(1500000);
  });

  it('getCxc passes the cutoff, null when omitted, and coerces amounts', async () => {
    result = {
      data: [{ id_factura: 1, total_general: '200', saldo_pendiente: '50', dias_vencido: 3, bucket: '1-30' }],
      error: null,
    };
    const r = await reporteFinanzasService.getCxc('2026-03-31');
    expect(calls[0]).toEqual({ fn: 'fn_rep_cxc', args: { p_corte: '2026-03-31' } });
    expect(r[0].saldo_pendiente).toBe(50);
    expect(r[0].total_general).toBe(200);

    await reporteFinanzasService.getCxc();
    expect(calls[1]).toEqual({ fn: 'fn_rep_cxc', args: { p_corte: null } });
  });

  it('getCxp passes the cutoff', async () => {
    result = { data: [{ id_gasto: 1, total: '90', saldo_pendiente: '40', dias_vencido: 0, bucket: 'vigente' }], error: null };
    const r = await reporteFinanzasService.getCxp('2026-03-31');
    expect(calls[0]).toEqual({ fn: 'fn_rep_cxp', args: { p_corte: '2026-03-31' } });
    expect(r[0].total).toBe(90);
    expect(r[0].saldo_pendiente).toBe(40);
  });

  it('getFlujoFondos calls fn_rep_flujo_fondos', async () => {
    result = {
      data: [{ fk_fondo: 1, fondo: 'Caja', tipo: 'caja_turno', activo: true, saldo_inicial: '10', ingresos: '20', egresos: '5', saldo_final: '25' }],
      error: null,
    };
    const r = await reporteFinanzasService.getFlujoFondos('2026-03-01', '2026-03-31');
    expect(calls[0]).toEqual({ fn: 'fn_rep_flujo_fondos', args: { p_desde: '2026-03-01', p_hasta: '2026-03-31' } });
    expect(r[0].saldo_final).toBe(25);
  });

  it('getMovimientosFondo sends the fund id and range', async () => {
    result = {
      data: [{ fecha: '2026-03-02', nro_asiento: 4, descripcion: 'x', origen_tipo: 'cobro', fk_origen: 1, debe: '100', haber: '0', saldo_acumulado: '100' }],
      error: null,
    };
    const r = await reporteFinanzasService.getMovimientosFondo(7, '2026-03-01', '2026-03-31');
    expect(calls[0]).toEqual({
      fn: 'fn_rep_movimientos_fondo',
      args: { p_fondo: 7, p_desde: '2026-03-01', p_hasta: '2026-03-31' },
    });
    expect(r[0].saldo_acumulado).toBe(100);
  });

  it('getLibroIva calls fn_rep_libro_iva with the year and coerces every amount', async () => {
    result = {
      data: [{
        mes: 1, base_ventas_10: '100', base_ventas_5: '0', base_ventas_exentas: '0', iva_debito: '10',
        compras_gravadas_10: '50', compras_gravadas_5: '0', compras_exentas: '0', iva_credito: '5', iva_a_pagar: '5',
      }],
      error: null,
    };
    const r = await reporteFinanzasService.getLibroIva(2026);
    expect(calls[0]).toEqual({ fn: 'fn_rep_libro_iva', args: { p_anio: 2026 } });
    expect(r[0].iva_a_pagar).toBe(5);
    expect(r[0].base_ventas_10).toBe(100);
  });

  it('treats a null payload as no rows', async () => {
    result = { data: null, error: null };
    expect(await reporteFinanzasService.getCxc()).toEqual([]);
  });

  it('propagates database errors for every report', async () => {
    result = { data: null, error: { message: 'boom' } };
    await expect(reporteFinanzasService.getResultado('a', 'b')).rejects.toThrow('boom');
    await expect(reporteFinanzasService.getCxc()).rejects.toThrow('boom');
    await expect(reporteFinanzasService.getCxp()).rejects.toThrow('boom');
    await expect(reporteFinanzasService.getFlujoFondos('a', 'b')).rejects.toThrow('boom');
    await expect(reporteFinanzasService.getMovimientosFondo(1, 'a', 'b')).rejects.toThrow('boom');
    await expect(reporteFinanzasService.getLibroIva(2026)).rejects.toThrow('boom');
  });
});
