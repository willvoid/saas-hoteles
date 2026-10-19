import { describe, it, expect } from 'vitest';
import {
  detectarDesfaseAlojamiento,
  esHabitacionValida,
  etiquetaHabitacion,
  mostrarColumnaHabitacion,
  opcionesHabitacionCargo,
  ordenarCargosPorHabitacion,
  type FilaHabitacion,
} from './cargosPorHabitacion';

const fila = (idDetalle: number, habitacion: string, subtotal: number, tipo = 'Doble'): FilaHabitacion => ({
  idDetalle,
  habitacion,
  tipo,
  subtotal,
});

const alojamiento = (id: number, monto: number, fk: number | null, estado = 'ACTIVO') => ({
  id_cargo: id,
  monto_total: monto,
  fk_detalle_reserva: fk,
  estado,
  concepto: { nombre: 'Alojamiento' },
});

const consumo = (id: number, fk: number | null) => ({
  id_cargo: id,
  monto_total: 1000,
  fk_detalle_reserva: fk,
  estado: 'ACTIVO',
  concepto: { nombre: 'Desayuno' },
});

const HABS = [fila(10, '101', 300000), fila(11, '102', 200000)];

describe('etiquetaHabitacion', () => {
  it('muestra "General" para cargos sin habitación', () => {
    expect(etiquetaHabitacion(null, HABS)).toBe('General');
    expect(etiquetaHabitacion(undefined, HABS)).toBe('General');
  });

  it('muestra el número de la habitación asignada', () => {
    expect(etiquetaHabitacion(11, HABS)).toBe('Hab. 102');
  });

  it('avisa cuando la habitación ya no está asignada a la reserva', () => {
    expect(etiquetaHabitacion(99, HABS)).toBe('Hab. retirada');
  });
});

describe('opcionesHabitacionCargo', () => {
  it('con varias habitaciones ofrece "General de la reserva" primero y una opción por habitación', () => {
    expect(opcionesHabitacionCargo(HABS)).toEqual([
      { idDetalle: null, etiqueta: 'General de la reserva' },
      { idDetalle: 10, etiqueta: 'Hab. 101 · Doble' },
      { idDetalle: 11, etiqueta: 'Hab. 102 · Doble' },
    ]);
  });

  it('omite el tipo cuando no hay dato', () => {
    const opciones = opcionesHabitacionCargo([fila(1, '1', 0, '-'), fila(2, '2', 0, '')]);
    expect(opciones[1].etiqueta).toBe('Hab. 1');
    expect(opciones[2].etiqueta).toBe('Hab. 2');
  });

  it('con una sola habitación (o ninguna) no hay selector: lista vacía', () => {
    expect(opcionesHabitacionCargo([fila(10, '101', 1)])).toEqual([]);
    expect(opcionesHabitacionCargo([])).toEqual([]);
  });
});

describe('esHabitacionValida', () => {
  const opciones = opcionesHabitacionCargo(HABS);

  it('acepta null (general) y una habitación ofrecida', () => {
    expect(esHabitacionValida(null, opciones)).toBe(true);
    expect(esHabitacionValida(10, opciones)).toBe(true);
  });

  it('rechaza una habitación que ya no se ofrece', () => {
    expect(esHabitacionValida(99, opciones)).toBe(false);
    expect(esHabitacionValida(10, [])).toBe(false);
  });
});

describe('ordenarCargosPorHabitacion', () => {
  it('pone los generales primero, luego por orden de habitación y al final las retiradas', () => {
    const cargos = [consumo(1, 11), consumo(2, 99), consumo(3, null), consumo(4, 10), consumo(5, 11)];
    expect(ordenarCargosPorHabitacion(cargos, HABS).map((c) => c.id_cargo)).toEqual([3, 4, 1, 5, 2]);
  });

  it('es estable dentro de cada grupo y no muta la lista original', () => {
    const cargos = [consumo(1, 10), consumo(2, 10), consumo(3, null), consumo(4, null)];
    const copia = [...cargos];
    expect(ordenarCargosPorHabitacion(cargos, HABS).map((c) => c.id_cargo)).toEqual([3, 4, 1, 2]);
    expect(cargos).toEqual(copia);
  });

  it('trata fk undefined (columna ausente) como general', () => {
    const sinColumna = { id_cargo: 7, fk_detalle_reserva: undefined };
    expect(ordenarCargosPorHabitacion([consumo(1, 10), sinColumna], HABS).map((c) => c.id_cargo)).toEqual([7, 1]);
  });
});

describe('mostrarColumnaHabitacion', () => {
  it('se muestra con varias habitaciones', () => {
    expect(mostrarColumnaHabitacion([consumo(1, null)], HABS)).toBe(true);
  });

  it('con una habitación sólo se muestra si algún cargo está atribuido', () => {
    const una = [fila(10, '101', 1)];
    expect(mostrarColumnaHabitacion([consumo(1, null)], una)).toBe(false);
    expect(mostrarColumnaHabitacion([consumo(1, 10)], una)).toBe(true);
  });
});

describe('detectarDesfaseAlojamiento', () => {
  it('sin cargos de alojamiento no hay nada que comparar', () => {
    const r = detectarDesfaseAlojamiento([consumo(1, null)], HABS);
    expect(r.hayDesfase).toBe(false);
    expect(r.modo).toBe('sin-cargo');
  });

  it('por habitación: sin desfase cuando cada cargo coincide con su habitación', () => {
    const r = detectarDesfaseAlojamiento([alojamiento(1, 300000, 10), alojamiento(2, 200000, 11)], HABS);
    expect(r.modo).toBe('por-habitacion');
    expect(r.hayDesfase).toBe(false);
    expect(r.desfases).toEqual([]);
  });

  it('por habitación: nombra sólo la habitación que difiere, aunque el total compense', () => {
    const r = detectarDesfaseAlojamiento([alojamiento(1, 250000, 10), alojamiento(2, 250000, 11)], HABS);
    expect(r.hayDesfase).toBe(true);
    expect(r.desfases.map((d) => [d.tipo, d.idDetalle, d.habitacion, d.cargado, d.calculado])).toEqual([
      ['habitacion', 10, '101', 250000, 300000],
      ['habitacion', 11, '102', 250000, 200000],
    ]);
  });

  it('por habitación: una habitación con subtotal > 0 y sin cargo es desfase con cargado 0', () => {
    const r = detectarDesfaseAlojamiento([alojamiento(1, 300000, 10)], HABS);
    expect(r.desfases).toEqual([
      { tipo: 'habitacion', idDetalle: 11, habitacion: '102', cargado: 0, calculado: 200000 },
    ]);
  });

  it('por habitación: una habitación gratis (subtotal 0) sin cargo no es desfase', () => {
    const r = detectarDesfaseAlojamiento([alojamiento(1, 300000, 10)], [fila(10, '101', 300000), fila(11, '102', 0)]);
    expect(r.hayDesfase).toBe(false);
  });

  it('por habitación: un cargo de una habitación retirada es desfase', () => {
    const r = detectarDesfaseAlojamiento([alojamiento(1, 300000, 10), alojamiento(2, 200000, 11), alojamiento(3, 50000, 99)], HABS);
    expect(r.desfases).toEqual([
      { tipo: 'retirada', idDetalle: 99, habitacion: null, cargado: 50000, calculado: 0 },
    ]);
  });

  it('ignora cargos de alojamiento dados de baja y otros conceptos', () => {
    const r = detectarDesfaseAlojamiento(
      [alojamiento(1, 300000, 10), alojamiento(2, 200000, 11), alojamiento(3, 999, 10, 'INACTIVO'), consumo(4, 10)],
      HABS,
    );
    expect(r.hayDesfase).toBe(false);
  });

  it('acepta montos como texto (numeric de Postgres)', () => {
    const r = detectarDesfaseAlojamiento(
      [{ ...alojamiento(1, 0, 10), monto_total: '300000' }, alojamiento(2, 200000, 11)],
      HABS,
    );
    expect(r.hayDesfase).toBe(false);
  });

  describe('legacy: un cargo agregado (fk NULL) y ninguno por habitación', () => {
    it('compara el cargo contra el total de todas las habitaciones', () => {
      const r = detectarDesfaseAlojamiento([alojamiento(1, 500000, null)], HABS);
      expect(r.modo).toBe('legacy');
      expect(r.hayDesfase).toBe(false);
    });

    it('si difiere, informa un único desfase general con cargado y total', () => {
      const r = detectarDesfaseAlojamiento([alojamiento(1, 400000, null)], HABS);
      expect(r.modo).toBe('legacy');
      expect(r.desfases).toEqual([
        { tipo: 'general', idDetalle: null, habitacion: null, cargado: 400000, calculado: 500000 },
      ]);
    });
  });

  describe('mixto: cargo agregado legacy más un cargo propio de una habitación agregada después', () => {
    it('el agregado cubre sólo las habitaciones sin cargo propio', () => {
      const r = detectarDesfaseAlojamiento([alojamiento(1, 300000, null), alojamiento(2, 200000, 11)], HABS);
      expect(r.modo).toBe('por-habitacion');
      expect(r.hayDesfase).toBe(false);
    });

    it('si el agregado no alcanza para el resto, queda como desfase general', () => {
      const r = detectarDesfaseAlojamiento([alojamiento(1, 100000, null), alojamiento(2, 200000, 11)], HABS);
      expect(r.desfases).toEqual([
        { tipo: 'general', idDetalle: null, habitacion: null, cargado: 100000, calculado: 300000 },
      ]);
    });
  });
});
