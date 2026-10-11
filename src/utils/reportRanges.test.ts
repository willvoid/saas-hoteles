import { describe, it, expect } from 'vitest';
import { resolveRange } from './reportRanges';

// Miércoles 2026-07-15, para tener un "hoy" fijo y sin ambigüedad de semana.
const TODAY = '2026-07-15';

describe('resolveRange', () => {
  it('hoy: desde y hasta son el mismo día', () => {
    expect(resolveRange('hoy', TODAY)).toEqual({ desde: TODAY, hasta: TODAY });
  });

  it('estaSemana: arranca el lunes de esa semana y termina hoy', () => {
    expect(resolveRange('estaSemana', TODAY)).toEqual({ desde: '2026-07-13', hasta: TODAY });
  });

  it('estaSemana: si hoy es lunes, desde === hasta === hoy', () => {
    expect(resolveRange('estaSemana', '2026-07-13')).toEqual({ desde: '2026-07-13', hasta: '2026-07-13' });
  });

  it('estaSemana: si hoy es domingo, retrocede 6 días hasta el lunes', () => {
    expect(resolveRange('estaSemana', '2026-07-19')).toEqual({ desde: '2026-07-13', hasta: '2026-07-19' });
  });

  it('esteMes: arranca el día 1 del mes y termina hoy', () => {
    expect(resolveRange('esteMes', TODAY)).toEqual({ desde: '2026-07-01', hasta: TODAY });
  });

  it('mesAnterior: cubre el mes calendario completo anterior', () => {
    expect(resolveRange('mesAnterior', TODAY)).toEqual({ desde: '2026-06-01', hasta: '2026-06-30' });
  });

  it('mesAnterior: cruza el límite de año en enero', () => {
    expect(resolveRange('mesAnterior', '2026-01-15')).toEqual({ desde: '2025-12-01', hasta: '2025-12-31' });
  });
});
