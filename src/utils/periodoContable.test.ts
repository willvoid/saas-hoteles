import { describe, expect, it } from 'vitest';
import {
  esMesFuturo,
  estaCerrado,
  etiquetaPeriodo,
  fechaNegocioHoy,
  periodoDe,
} from './periodoContable';

describe('fechaNegocioHoy', () => {
  it('uses the America/Asuncion calendar day, not UTC', () => {
    // 01:30 UTC on Mar 11 is still the evening of Mar 10 in Paraguay (UTC-3 or UTC-4).
    expect(fechaNegocioHoy(new Date('2026-03-11T01:30:00Z'))).toBe('2026-03-10');
  });

  it('rolls over once Paraguay midnight passes', () => {
    expect(fechaNegocioHoy(new Date('2026-03-11T07:30:00Z'))).toBe('2026-03-11');
  });

  it('crosses the year boundary correctly', () => {
    expect(fechaNegocioHoy(new Date('2026-01-01T02:00:00Z'))).toBe('2025-12-31');
  });
});

describe('periodoDe', () => {
  it('extracts year and month from an ISO date', () => {
    expect(periodoDe('2026-03-10')).toEqual({ anio: 2026, mes: 3 });
    expect(periodoDe('2026-12-31')).toEqual({ anio: 2026, mes: 12 });
  });

  it('accepts timestamps by reading the date part only', () => {
    expect(periodoDe('2026-03-10T12:00:00Z')).toEqual({ anio: 2026, mes: 3 });
  });
});

describe('estaCerrado', () => {
  const cerrados = [
    { anio: 2026, mes: 2 },
    { anio: 2025, mes: 12 },
  ];

  it('is true when the month of the date is locked', () => {
    expect(estaCerrado(cerrados, '2026-02-15')).toBe(true);
    expect(estaCerrado(cerrados, '2025-12-31')).toBe(true);
  });

  it('is false for open months and for the same month of another year', () => {
    expect(estaCerrado(cerrados, '2026-03-01')).toBe(false);
    expect(estaCerrado(cerrados, '2025-02-15')).toBe(false);
  });

  it('is false with no locked periods', () => {
    expect(estaCerrado([], '2026-03-01')).toBe(false);
  });
});

describe('esMesFuturo', () => {
  const now = new Date('2026-03-10T15:00:00Z');

  it('is false for the current and past months', () => {
    expect(esMesFuturo(2026, 3, now)).toBe(false);
    expect(esMesFuturo(2026, 1, now)).toBe(false);
    expect(esMesFuturo(2025, 12, now)).toBe(false);
  });

  it('is true for later months and years', () => {
    expect(esMesFuturo(2026, 4, now)).toBe(true);
    expect(esMesFuturo(2027, 1, now)).toBe(true);
  });

  it('uses the business date at the edge of the month', () => {
    // Apr 1 02:00 UTC is still Mar 31 in Paraguay: April is the future.
    expect(esMesFuturo(2026, 4, new Date('2026-04-01T02:00:00Z'))).toBe(true);
  });
});

describe('etiquetaPeriodo', () => {
  it('formats the month name in Spanish with the year', () => {
    expect(etiquetaPeriodo(2026, 3)).toBe('Marzo 2026');
    expect(etiquetaPeriodo(2026, 9)).toBe('Septiembre 2026');
    expect(etiquetaPeriodo(2025, 12)).toBe('Diciembre 2025');
  });
});
