import { describe, expect, it } from 'vitest';
import {
  masVencidos,
  saldoTotalFondos,
  tablaAging,
  tablaFlujoFondos,
  tablaLibroIva,
  tablaMovimientosFondo,
  tablaResultado,
  totalesLibroIva,
  totalesResultado,
  vencidoTotal,
} from './reporteFinanzas';
import type {
  FilaCxc,
  FilaCxp,
  FilaFlujoFondos,
  FilaLibroIva,
  FilaMovimientoFondo,
  FilaResultado,
} from '../types/finanzas';

const resultado = (mes: string, tipo: 'ingreso' | 'egreso', monto: number, categoria = 'Cat'): FilaResultado => ({
  mes,
  fk_categoria: 1,
  categoria,
  tipo,
  monto,
});

const cxc = (over: Partial<FilaCxc>): FilaCxc => ({
  fk_cliente: 1,
  cliente: 'Cliente',
  documento: '1234',
  id_factura: 1,
  nro: '001',
  fecha_emision: '2026-01-01',
  fecha_vencimiento: '2026-01-31',
  total_general: 100,
  saldo_pendiente: 100,
  dias_vencido: 0,
  bucket: 'vigente',
  ...over,
});

const cxp = (over: Partial<FilaCxp>): FilaCxp => ({
  fk_proveedor: 1,
  proveedor: 'Proveedor',
  ruc: null,
  id_gasto: 1,
  nro_comprobante: null,
  fecha: '2026-01-01',
  fecha_vencimiento: '2026-01-31',
  total: 100,
  saldo_pendiente: 100,
  dias_vencido: 0,
  bucket: 'vigente',
  ...over,
});

describe('totalesResultado', () => {
  it('suma ingresos y egresos y calcula el resultado', () => {
    const t = totalesResultado([
      resultado('2026-03-01', 'ingreso', 1000),
      resultado('2026-03-01', 'ingreso', 500),
      resultado('2026-04-01', 'egreso', 300),
    ]);
    expect(t).toEqual({ ingresos: 1500, egresos: 300, resultado: 1200 });
  });

  it('da perdida (resultado negativo) cuando egresa mas de lo que ingresa', () => {
    expect(totalesResultado([resultado('2026-03-01', 'egreso', 800)]).resultado).toBe(-800);
  });

  it('devuelve ceros sin filas', () => {
    expect(totalesResultado([])).toEqual({ ingresos: 0, egresos: 0, resultado: 0 });
  });
});

describe('totalesLibroIva', () => {
  const fila = (mes: number, debito: number, credito: number): FilaLibroIva => ({
    mes,
    base_ventas_10: 10,
    base_ventas_5: 5,
    base_ventas_exentas: 1,
    iva_debito: debito,
    compras_gravadas_10: 20,
    compras_gravadas_5: 4,
    compras_exentas: 2,
    iva_credito: credito,
    iva_a_pagar: debito - credito,
  });

  it('suma cada columna', () => {
    const t = totalesLibroIva([fila(1, 100, 40), fila(2, 10, 50)]);
    expect(t.iva_debito).toBe(110);
    expect(t.iva_credito).toBe(90);
    expect(t.iva_a_pagar).toBe(20);
    expect(t.base_ventas_10).toBe(20);
    expect(t.compras_exentas).toBe(4);
  });

  it('conserva el signo negativo del IVA a pagar', () => {
    expect(totalesLibroIva([fila(1, 10, 50)]).iva_a_pagar).toBe(-40);
  });
});

describe('saldoTotalFondos', () => {
  it('suma el saldo final de todos los fondos', () => {
    const base = { tipo: 'banco', activo: true, saldo_inicial: 0, ingresos: 0, egresos: 0 } as const;
    const rows: FilaFlujoFondos[] = [
      { ...base, fk_fondo: 1, fondo: 'A', saldo_final: 700 },
      { ...base, fk_fondo: 2, fondo: 'B', saldo_final: -200 },
    ];
    expect(saldoTotalFondos(rows)).toBe(500);
    expect(saldoTotalFondos([])).toBe(0);
  });
});

describe('vencidoTotal', () => {
  it('suma solo los saldos con dias vencidos', () => {
    const rows = [
      cxc({ saldo_pendiente: 100, dias_vencido: 0 }),
      cxc({ saldo_pendiente: 250, dias_vencido: 5, bucket: '1-30' }),
      cxc({ saldo_pendiente: 50, dias_vencido: 95, bucket: '+90' }),
    ];
    expect(vencidoTotal(rows)).toBe(300);
  });
});

describe('masVencidos', () => {
  it('ordena por antiguedad, descarta los vigentes y recorta a n', () => {
    const rows = [
      cxp({ id_gasto: 1, dias_vencido: 10 }),
      cxp({ id_gasto: 2, dias_vencido: 0 }),
      cxp({ id_gasto: 3, dias_vencido: 70 }),
      cxp({ id_gasto: 4, dias_vencido: 30 }),
    ];
    expect(masVencidos(rows, 2).map((r) => r.id_gasto)).toEqual([3, 4]);
  });

  it('no muta la lista original y devuelve vacio sin vencidos', () => {
    const rows = [cxp({ dias_vencido: 0 })];
    expect(masVencidos(rows, 5)).toEqual([]);
    expect(rows).toHaveLength(1);
  });
});

describe('tablaResultado', () => {
  it('arma filas con mes legible y resumen con ganancia', () => {
    const t = tablaResultado([
      resultado('2026-03-01', 'ingreso', 1000, 'Habitaciones'),
      resultado('2026-03-01', 'egreso', 400, 'Servicios'),
    ]);
    expect(t.body[0]).toEqual(['Marzo 2026', 'Habitaciones', 'Ingreso', 'Gs. 1.000']);
    expect(t.body[1][2]).toBe('Egreso');
    expect(t.resumen).toContain('Resultado (ganancia): Gs. 600');
  });

  it('rotula perdida cuando el resultado es negativo', () => {
    const t = tablaResultado([resultado('2026-03-01', 'egreso', 400)]);
    expect(t.resumen.some((l) => l.startsWith('Resultado (pérdida)'))).toBe(true);
  });
});

describe('tablaAging', () => {
  it('agrupa por tramo con pie de total para cuentas por cobrar', () => {
    const t = tablaAging('cxc', [
      cxc({ cliente: 'A', saldo_pendiente: 100, bucket: 'vigente' }),
      cxc({ cliente: 'B', saldo_pendiente: 200, dias_vencido: 40, bucket: '31-60' }),
    ]);
    expect(t.head[1]).toBe('Cliente');
    expect(t.body).toHaveLength(2);
    expect(t.body[1][0]).toBe('31-60');
    expect(t.body[1][1]).toBe('B');
    expect(t.foot).toEqual(['Total', '', '', '', '', 'Gs. 300']);
    expect(t.resumen).toContain('31-60: Gs. 200');
  });

  it('usa proveedor y comprobante para cuentas por pagar', () => {
    const t = tablaAging('cxp', [cxp({ proveedor: 'Prov', nro_comprobante: 'F-9', bucket: 'vigente' })]);
    expect(t.head[1]).toBe('Proveedor');
    expect(t.body[0].slice(1, 3)).toEqual(['Prov', 'F-9']);
  });
});

describe('tablaFlujoFondos', () => {
  it('lista fondos y totaliza las columnas', () => {
    const rows: FilaFlujoFondos[] = [
      { fk_fondo: 1, fondo: 'Caja', tipo: 'caja_chica', activo: true, saldo_inicial: 100, ingresos: 50, egresos: 20, saldo_final: 130 },
      { fk_fondo: 2, fondo: 'Banco', tipo: 'banco', activo: true, saldo_inicial: 0, ingresos: 10, egresos: 0, saldo_final: 10 },
    ];
    const t = tablaFlujoFondos(rows);
    expect(t.body[0]).toEqual(['Caja', 'Caja chica', 'Gs. 100', 'Gs. 50', 'Gs. 20', 'Gs. 130']);
    expect(t.foot).toEqual(['Total', '', 'Gs. 100', 'Gs. 60', 'Gs. 20', 'Gs. 140']);
  });
});

describe('tablaMovimientosFondo', () => {
  it('muestra ingreso, egreso y saldo acumulado', () => {
    const rows: FilaMovimientoFondo[] = [
      { fecha: '2026-03-02', nro_asiento: 7, descripcion: 'Cobro', origen_tipo: 'cobro', fk_origen: 1, debe: 500, haber: 0, saldo_acumulado: 500 },
      { fecha: '2026-03-03', nro_asiento: 8, descripcion: 'Pago', origen_tipo: 'pago', fk_origen: 2, debe: 0, haber: 200, saldo_acumulado: 300 },
    ];
    const t = tablaMovimientosFondo('Caja', rows);
    expect(t.titulo).toContain('Caja');
    expect(t.body[0]).toEqual(['2026-03-02', '7', 'Cobro', 'Gs. 500', '-', 'Gs. 500']);
    expect(t.body[1]).toEqual(['2026-03-03', '8', 'Pago', '-', 'Gs. 200', 'Gs. 300']);
  });
});

describe('tablaLibroIva', () => {
  it('genera una fila por mes y un pie con totales', () => {
    const rows: FilaLibroIva[] = [1, 2].map((mes) => ({
      mes,
      base_ventas_10: 1000,
      base_ventas_5: 0,
      base_ventas_exentas: 0,
      iva_debito: 100,
      compras_gravadas_10: 500,
      compras_gravadas_5: 0,
      compras_exentas: 0,
      iva_credito: 50,
      iva_a_pagar: 50,
    }));
    const t = tablaLibroIva(2026, rows);
    expect(t.body).toHaveLength(2);
    expect(t.body[0][0]).toBe('Enero 2026');
    expect(t.foot?.[0]).toBe('Total');
    expect(t.foot?.[9]).toBe('Gs. 100');
    expect(t.orientacion).toBe('l');
  });
});
