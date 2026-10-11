import { describe, it, expect } from 'vitest';
import {
  calcularAjusteAlojamiento,
  construirDesgloseAlojamiento,
  esCargoDeAlojamiento,
} from './alojamiento';

const hab = (id: number, precio: number, subtotal: number) => ({
  id_detalle: id,
  precio_unitario: precio,
  subtotal,
});

describe('esCargoDeAlojamiento', () => {
  it('reconoce el nombre exacto y variaciones de mayúsculas/espacios', () => {
    expect(esCargoDeAlojamiento('Alojamiento')).toBe(true);
    expect(esCargoDeAlojamiento('ALOJAMIENTO')).toBe(true);
    expect(esCargoDeAlojamiento('  alojamiento  ')).toBe(true);
  });

  it('no confunde otros conceptos, aunque contengan la palabra', () => {
    expect(esCargoDeAlojamiento('Desayuno')).toBe(false);
    expect(esCargoDeAlojamiento('Alojamiento extra')).toBe(false);
  });

  it('trata valores vacíos como "no es alojamiento"', () => {
    expect(esCargoDeAlojamiento(null)).toBe(false);
    expect(esCargoDeAlojamiento(undefined)).toBe(false);
    expect(esCargoDeAlojamiento('')).toBe(false);
  });
});

describe('calcularAjusteAlojamiento', () => {
  it('alarga la estadía: sube subtotales, total y cargo del folio', () => {
    // 2 habitaciones a 100.000 y 150.000, de 2 a 4 noches.
    const detalles = [hab(1, 100_000, 200_000), hab(2, 150_000, 300_000)];
    const ajuste = calcularAjusteAlojamiento(detalles, 2, 4);

    expect(ajuste.cambios).toEqual([
      { id_detalle: 1, subtotal: 400_000 },
      { id_detalle: 2, subtotal: 600_000 },
    ]);
    expect(ajuste.totalEstimado).toBe(1_000_000);
    expect(ajuste.deltaMonto).toBe(500_000);
    // 2 noches más × 2 habitaciones = 4 noches-habitación.
    expect(ajuste.deltaCantidad).toBe(4);
  });

  it('acorta la estadía: los deltas quedan negativos', () => {
    const detalles = [hab(1, 100_000, 400_000)];
    const ajuste = calcularAjusteAlojamiento(detalles, 4, 1);

    expect(ajuste.cambios).toEqual([{ id_detalle: 1, subtotal: 100_000 }]);
    expect(ajuste.totalEstimado).toBe(100_000);
    expect(ajuste.deltaMonto).toBe(-300_000);
    expect(ajuste.deltaCantidad).toBe(-3);
  });

  it('no propone cambios si las noches no se mueven', () => {
    const detalles = [hab(1, 100_000, 200_000), hab(2, 150_000, 300_000)];
    const ajuste = calcularAjusteAlojamiento(detalles, 2, 2);

    expect(ajuste.cambios).toEqual([]);
    expect(ajuste.deltaMonto).toBe(0);
    expect(ajuste.deltaCantidad).toBe(0);
    expect(ajuste.totalEstimado).toBe(500_000);
  });

  it('corrige un subtotal que estaba desincronizado, aunque no cambien las noches', () => {
    // El subtotal guardado (0) no coincide con precio × noches.
    const ajuste = calcularAjusteAlojamiento([hab(1, 100_000, 0)], 3, 3);

    expect(ajuste.cambios).toEqual([{ id_detalle: 1, subtotal: 300_000 }]);
    expect(ajuste.deltaMonto).toBe(300_000);
    expect(ajuste.deltaCantidad).toBe(0);
  });

  it('trata precio y subtotal nulos como cero', () => {
    const ajuste = calcularAjusteAlojamiento(
      [{ id_detalle: 1, precio_unitario: null, subtotal: null }],
      2,
      3,
    );

    expect(ajuste.cambios).toEqual([]);
    expect(ajuste.totalEstimado).toBe(0);
    expect(ajuste.deltaMonto).toBe(0);
    expect(ajuste.deltaCantidad).toBe(1);
  });

  it('sin habitaciones no hay nada que ajustar', () => {
    const ajuste = calcularAjusteAlojamiento([], 2, 5);

    expect(ajuste.cambios).toEqual([]);
    expect(ajuste.totalEstimado).toBe(0);
    expect(ajuste.deltaMonto).toBe(0);
    expect(ajuste.deltaCantidad).toBe(0);
  });
});

describe('construirDesgloseAlojamiento', () => {
  const detalle = (id: number, precio: number, numero: number, extra = {}) => ({
    id_detalle: id,
    fk_habitacion: numero,
    precio_unitario: precio,
    cantidad_adultos: 2,
    cantidad_ninos: 1,
    habitaciones: { numero_habitacion: numero, tipo_habitacion: { nombre: 'Doble' } },
    tarifas: { nombre: 'Temporada alta' },
    ...extra,
  });

  it('cobra precio por noche × noches en cada habitación y suma los subtotales', () => {
    // 3 noches: del 10 al 13.
    const desglose = construirDesgloseAlojamiento(
      [detalle(1, 100_000, 101), detalle(2, 150_000, 202)],
      '2026-08-10',
      '2026-08-13',
    );

    expect(desglose.noches).toBe(3);
    expect(desglose.filas.map(f => f.subtotal)).toEqual([300_000, 450_000]);
    expect(desglose.total).toBe(750_000);
  });

  it('lleva los datos de la habitación a la fila', () => {
    const [fila] = construirDesgloseAlojamiento([detalle(1, 100_000, 101)], '2026-08-10', '2026-08-12').filas;

    expect(fila).toEqual({
      idDetalle: 1,
      habitacion: '101',
      tipo: 'Doble',
      tarifa: 'Temporada alta',
      huespedes: 3,
      precioPorNoche: 100_000,
      noches: 2,
      subtotal: 200_000,
    });
  });

  it('cae al id de habitación y a "-" cuando falta el embed', () => {
    const [fila] = construirDesgloseAlojamiento(
      [{ id_detalle: 1, fk_habitacion: 77, precio_unitario: 50_000 }],
      '2026-08-10',
      '2026-08-11',
    ).filas;

    expect(fila.habitacion).toBe('77');
    expect(fila.tipo).toBe('-');
    expect(fila.tarifa).toBe('-');
    expect(fila.huespedes).toBe(0);
    expect(fila.subtotal).toBe(50_000);
  });

  it('sin habitaciones asignadas el alojamiento es cero', () => {
    const desglose = construirDesgloseAlojamiento([], '2026-08-10', '2026-08-13');

    expect(desglose.filas).toEqual([]);
    expect(desglose.total).toBe(0);
    expect(desglose.noches).toBe(3);
  });

  it('una estadía sin noches (mismo día) no cobra alojamiento', () => {
    const desglose = construirDesgloseAlojamiento([detalle(1, 100_000, 101)], '2026-08-10', '2026-08-10');

    expect(desglose.noches).toBe(0);
    expect(desglose.total).toBe(0);
  });

  it('trata un precio nulo como cero', () => {
    const desglose = construirDesgloseAlojamiento(
      [{ id_detalle: 1, fk_habitacion: 1, precio_unitario: null }],
      '2026-08-10',
      '2026-08-13',
    );

    expect(desglose.total).toBe(0);
  });
});
