import { describe, it, expect } from 'vitest';
import {
  DEFAULT_CONFIG_HORARIOS,
  horaAMinutos,
  minutosDeExceso,
  calcularMontoRecargo,
  previewRecargo,
  formatearMinutos,
  requiereMotivo,
  validarConfigHorarios,
  traducirErrorRecargo,
  etiquetaMovimiento,
  type ConfigHorarios,
} from './recargoHorario';

const config = (patch: Partial<ConfigHorarios> = {}): ConfigHorarios => ({
  ...DEFAULT_CONFIG_HORARIOS,
  ...patch,
});

describe('horaAMinutos', () => {
  it('parses HH:MM', () => {
    expect(horaAMinutos('11:00')).toBe(660);
    expect(horaAMinutos('00:05')).toBe(5);
  });

  it('accepts the HH:MM:SS shape Postgres returns for a time column', () => {
    expect(horaAMinutos('14:00:00')).toBe(840);
  });

  it('returns null for something that is not a time', () => {
    expect(horaAMinutos('')).toBeNull();
    expect(horaAMinutos('25:00')).toBeNull();
    expect(horaAMinutos('11:60')).toBeNull();
    expect(horaAMinutos('abc')).toBeNull();
  });
});

describe('minutosDeExceso', () => {
  it('late check-out counts minutes after the scheduled hour', () => {
    expect(minutosDeExceso('LATE_CHECKOUT', '11:00', '13:00')).toBe(120);
  });

  it('early check-in counts minutes before the scheduled hour', () => {
    expect(minutosDeExceso('EARLY_CHECKIN', '14:00', '10:30')).toBe(210);
  });

  it('clamps at 0 when on time or in the favourable direction', () => {
    expect(minutosDeExceso('LATE_CHECKOUT', '11:00', '10:15')).toBe(0);
    expect(minutosDeExceso('EARLY_CHECKIN', '14:00', '15:00')).toBe(0);
  });

  it('returns 0 for invalid times instead of NaN', () => {
    expect(minutosDeExceso('LATE_CHECKOUT', 'x', '13:00')).toBe(0);
  });
});

describe('calcularMontoRecargo', () => {
  it('PORCENTAJE: 25% of 300.000 is 75.000', () => {
    expect(
      calcularMontoRecargo({
        metodo: 'PORCENTAJE', valor: 25, tarifaNoche: 300000, minutosExceso: 120, toleranciaMin: 30,
      }),
    ).toBe(75000);
  });

  it('is 0 within the tolerance (inclusive)', () => {
    const base = { metodo: 'PORCENTAJE' as const, valor: 25, tarifaNoche: 300000, toleranciaMin: 30 };
    expect(calcularMontoRecargo({ ...base, minutosExceso: 30 })).toBe(0);
    expect(calcularMontoRecargo({ ...base, minutosExceso: 31 })).toBe(75000);
  });

  it('PORCENTAJE does not depend on how long the excess is', () => {
    const base = { metodo: 'PORCENTAJE' as const, valor: 25, tarifaNoche: 300000, toleranciaMin: 30 };
    expect(calcularMontoRecargo({ ...base, minutosExceso: 31 })).toBe(
      calcularMontoRecargo({ ...base, minutosExceso: 600 }),
    );
  });

  it('FIJO_HORA rounds the excess up to whole hours', () => {
    const base = { metodo: 'FIJO_HORA' as const, valor: 20000, tarifaNoche: 300000, toleranciaMin: 30 };
    expect(calcularMontoRecargo({ ...base, minutosExceso: 31 })).toBe(20000);
    expect(calcularMontoRecargo({ ...base, minutosExceso: 60 })).toBe(20000);
    expect(calcularMontoRecargo({ ...base, minutosExceso: 61 })).toBe(40000);
    expect(calcularMontoRecargo({ ...base, minutosExceso: 120 })).toBe(40000);
    expect(calcularMontoRecargo({ ...base, minutosExceso: 121 })).toBe(60000);
  });

  it('rounds to whole Gs', () => {
    expect(
      calcularMontoRecargo({
        metodo: 'PORCENTAJE', valor: 12.5, tarifaNoche: 100001, minutosExceso: 90, toleranciaMin: 0,
      }),
    ).toBe(12500);
  });

  it('a zero tolerance charges from the first minute', () => {
    expect(
      calcularMontoRecargo({
        metodo: 'FIJO_HORA', valor: 10000, tarifaNoche: 0, minutosExceso: 1, toleranciaMin: 0,
      }),
    ).toBe(10000);
  });

  it('never returns a negative or NaN amount', () => {
    expect(
      calcularMontoRecargo({
        metodo: 'PORCENTAJE', valor: -5, tarifaNoche: 300000, minutosExceso: 120, toleranciaMin: 30,
      }),
    ).toBe(0);
    expect(
      calcularMontoRecargo({
        metodo: 'PORCENTAJE', valor: 25, tarifaNoche: Number.NaN, minutosExceso: 120, toleranciaMin: 30,
      }),
    ).toBe(0);
  });
});

describe('previewRecargo', () => {
  it('reference example: rate 300.000, out 11:00, real 13:00, 30 min tolerance, 25%', () => {
    expect(previewRecargo(config(), 'LATE_CHECKOUT', 300000, '13:00')).toEqual({
      minutosExceso: 120,
      monto: 75000,
    });
  });

  it('inside the tolerance reports the excess but charges nothing', () => {
    expect(previewRecargo(config(), 'LATE_CHECKOUT', 300000, '11:20')).toEqual({
      minutosExceso: 20,
      monto: 0,
    });
  });

  it('early check-in uses hora_checkin', () => {
    expect(
      previewRecargo(config({ metodo_recargo: 'FIJO_HORA', valor_recargo: 15000 }), 'EARLY_CHECKIN', 300000, '12:00'),
    ).toEqual({ minutosExceso: 120, monto: 30000 });
  });
});

describe('formatearMinutos', () => {
  it('formats minutes, hours and mixed', () => {
    expect(formatearMinutos(0)).toBe('0 min');
    expect(formatearMinutos(45)).toBe('45 min');
    expect(formatearMinutos(60)).toBe('1 h');
    expect(formatearMinutos(120)).toBe('2 h');
    expect(formatearMinutos(90)).toBe('1 h 30 min');
  });
});

describe('requiereMotivo', () => {
  it('is required when exonerating a suggested surcharge', () => {
    expect(requiereMotivo({ exonerar: true, montoFinal: 0, montoSugerido: 75000 })).toBe(true);
  });

  it('is required when the amount differs from the suggestion', () => {
    expect(requiereMotivo({ exonerar: false, montoFinal: 50000, montoSugerido: 75000 })).toBe(true);
  });

  it('is not required when the suggestion is accepted as is', () => {
    expect(requiereMotivo({ exonerar: false, montoFinal: 75000, montoSugerido: 75000 })).toBe(false);
  });

  it('matches the SQL: exonerar always demands a reason, even with nothing suggested', () => {
    expect(requiereMotivo({ exonerar: true, montoFinal: 0, montoSugerido: 0 })).toBe(true);
  });
});

describe('validarConfigHorarios', () => {
  it('accepts the defaults', () => {
    expect(validarConfigHorarios(DEFAULT_CONFIG_HORARIOS)).toBeNull();
  });

  it('rejects a percentage above 100', () => {
    expect(validarConfigHorarios(config({ valor_recargo: 101 }))).toMatch(/100/);
  });

  it('allows a fixed hourly amount above 100', () => {
    expect(validarConfigHorarios(config({ metodo_recargo: 'FIJO_HORA', valor_recargo: 20000 }))).toBeNull();
  });

  it('rejects negative values and tolerance', () => {
    expect(validarConfigHorarios(config({ valor_recargo: -1 }))).not.toBeNull();
    expect(validarConfigHorarios(config({ tolerancia_min: -5 }))).not.toBeNull();
  });

  it('rejects invalid hours', () => {
    expect(validarConfigHorarios(config({ hora_checkout: '' }))).not.toBeNull();
  });
});

describe('traducirErrorRecargo', () => {
  it('passes the Spanish message of 22023 and 55000 through', () => {
    expect(traducirErrorRecargo({ code: '22023', message: 'Se requiere un motivo.' })).toBe('Se requiere un motivo.');
    expect(traducirErrorRecargo({ code: '55000', message: 'El folio esta cerrado.' })).toBe('El folio esta cerrado.');
  });

  it('rewrites permission and not-found errors', () => {
    expect(traducirErrorRecargo({ code: '42501', message: 'new row violates row-level security policy' })).toMatch(/permisos/);
    expect(traducirErrorRecargo({ code: 'P0002', message: 'Reserva no encontrada.' })).toMatch(/no existe/);
  });

  it('falls back when there is nothing usable', () => {
    expect(traducirErrorRecargo(null)).toMatch(/Intentá de nuevo/);
    expect(traducirErrorRecargo({ code: 'XX000', message: '' }, 'Falló')).toBe('Falló');
  });
});

describe('etiquetaMovimiento', () => {
  it('uses friendly labels for the surcharge and manual-charge types', () => {
    expect(etiquetaMovimiento('RECARGO_APLICADO')).toBe('Recargo aplicado');
    expect(etiquetaMovimiento('RECARGO_MODIFICADO')).toBe('Recargo modificado');
    expect(etiquetaMovimiento('RECARGO_EXONERADO')).toBe('Recargo exonerado');
    expect(etiquetaMovimiento('CARGO_MANUAL')).toBe('Cargo manual');
  });

  it('keeps the old rendering for every other type', () => {
    expect(etiquetaMovimiento('CAMBIO_HABITACION')).toBe('CAMBIO HABITACION');
    expect(etiquetaMovimiento('NOTA')).toBe('NOTA');
  });
});
