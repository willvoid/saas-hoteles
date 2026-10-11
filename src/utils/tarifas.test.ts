import { describe, expect, it } from 'vitest';
import { resolveTarifaForStay, type TarifaCandidate } from './tarifas';

function makeTarifa(overrides: Partial<TarifaCandidate> = {}): TarifaCandidate {
  return {
    id: 1,
    fk_tipo_habitacion: 10,
    estado: 'Activa',
    fecha_inicio: '2026-01-01',
    fecha_fin: null,
    ...overrides,
  };
}

describe('resolveTarifaForStay', () => {
  it('returns the matching tarifa', () => {
    const t = makeTarifa();
    expect(resolveTarifaForStay([t], 10, '2026-06-01')).toBe(t);
  });

  it('excludes tarifas for a different room type', () => {
    const t = makeTarifa({ fk_tipo_habitacion: 99 });
    expect(resolveTarifaForStay([t], 10, '2026-06-01')).toBeNull();
  });

  it('excludes tarifas with estado Inactiva', () => {
    const t = makeTarifa({ estado: 'Inactiva' });
    expect(resolveTarifaForStay([t], 10, '2026-06-01')).toBeNull();
  });

  it('includes tarifas with estado ACTIVA (case-insensitive)', () => {
    const t = makeTarifa({ estado: 'ACTIVA' });
    expect(resolveTarifaForStay([t], 10, '2026-06-01')).toBe(t);
  });

  it('matches an open-ended tarifa (fecha_fin: null)', () => {
    const t = makeTarifa({ fecha_inicio: '2026-01-01', fecha_fin: null });
    expect(resolveTarifaForStay([t], 10, '2099-01-01')).toBe(t);
  });

  it('includes fechaEntrada exactly on fecha_inicio (inclusive)', () => {
    const t = makeTarifa({ fecha_inicio: '2026-06-01', fecha_fin: '2026-06-30' });
    expect(resolveTarifaForStay([t], 10, '2026-06-01')).toBe(t);
  });

  it('includes fechaEntrada exactly on fecha_fin (inclusive)', () => {
    const t = makeTarifa({ fecha_inicio: '2026-06-01', fecha_fin: '2026-06-30' });
    expect(resolveTarifaForStay([t], 10, '2026-06-30')).toBe(t);
  });

  it('excludes fechaEntrada one day before fecha_inicio', () => {
    const t = makeTarifa({ fecha_inicio: '2026-06-01', fecha_fin: '2026-06-30' });
    expect(resolveTarifaForStay([t], 10, '2026-05-31')).toBeNull();
  });

  it('excludes fechaEntrada one day after fecha_fin', () => {
    const t = makeTarifa({ fecha_inicio: '2026-06-01', fecha_fin: '2026-06-30' });
    expect(resolveTarifaForStay([t], 10, '2026-07-01')).toBeNull();
  });

  it('returns null when nothing matches', () => {
    const t = makeTarifa({ fecha_inicio: '2026-06-01', fecha_fin: '2026-06-30' });
    expect(resolveTarifaForStay([t], 10, '2027-01-01')).toBeNull();
  });

  it('picks the tarifa with the later fecha_inicio when two are valid', () => {
    const older = makeTarifa({ id: 1, fecha_inicio: '2026-01-01', fecha_fin: null });
    const newer = makeTarifa({ id: 2, fecha_inicio: '2026-05-01', fecha_fin: null });
    expect(resolveTarifaForStay([older, newer], 10, '2026-06-01')).toBe(newer);
    expect(resolveTarifaForStay([newer, older], 10, '2026-06-01')).toBe(newer);
  });

  it('breaks a fecha_inicio tie by the highest id', () => {
    const lowId = makeTarifa({ id: 1, fecha_inicio: '2026-01-01', fecha_fin: null });
    const highId = makeTarifa({ id: 2, fecha_inicio: '2026-01-01', fecha_fin: null });
    expect(resolveTarifaForStay([lowId, highId], 10, '2026-06-01')).toBe(highId);
  });

  it('returns null for an empty array', () => {
    expect(resolveTarifaForStay([], 10, '2026-06-01')).toBeNull();
  });
});
