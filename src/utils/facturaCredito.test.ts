import { describe, expect, it } from 'vitest';
import {
  esPendiente,
  etiquetaCondicion,
  mensajeDeError,
  puedeFacturarACredito,
  validarVencimiento,
} from './facturaCredito';

describe('puedeFacturarACredito', () => {
  it('requires the contabilidad module', () => {
    expect(puedeFacturarACredito({ modulos: { contabilidad: false }, cliente: 5 })).toBe(false);
  });

  it('requires an identified client', () => {
    const modulos = { contabilidad: true };
    expect(puedeFacturarACredito({ modulos, cliente: '' })).toBe(false);
    expect(puedeFacturarACredito({ modulos, cliente: null })).toBe(false);
    expect(puedeFacturarACredito({ modulos, cliente: undefined })).toBe(false);
    expect(puedeFacturarACredito({ modulos, cliente: 0 })).toBe(false);
  });

  it('allows credit with the module and a chosen client', () => {
    expect(puedeFacturarACredito({ modulos: { contabilidad: true }, cliente: 12 })).toBe(true);
  });
});

describe('validarVencimiento', () => {
  it('accepts an empty due date (optional)', () => {
    expect(validarVencimiento('2026-03-10', '')).toBeNull();
  });

  it('accepts the emission day and later dates', () => {
    expect(validarVencimiento('2026-03-10', '2026-03-10')).toBeNull();
    expect(validarVencimiento('2026-03-10', '2026-04-09')).toBeNull();
  });

  it('rejects a due date before the emission day', () => {
    expect(validarVencimiento('2026-03-10', '2026-03-09')).toMatch(/anterior/i);
  });

  it('compares only the date part of a timestamp emission', () => {
    expect(validarVencimiento('2026-03-10T23:30:00-03:00', '2026-03-10')).toBeNull();
  });

  it('rejects a malformed due date', () => {
    expect(validarVencimiento('2026-03-10', '10/03/2026')).not.toBeNull();
  });
});

describe('esPendiente', () => {
  const base = { condicion_venta: 2, estado: 'EMITIDA', saldo_pendiente: 50000 };

  it('is true for an emitted credit invoice with balance', () => {
    expect(esPendiente(base)).toBe(true);
  });

  it('is false for cash, annulled or settled invoices', () => {
    expect(esPendiente({ ...base, condicion_venta: 1 })).toBe(false);
    expect(esPendiente({ ...base, estado: 'ANULADA' })).toBe(false);
    expect(esPendiente({ ...base, saldo_pendiente: 0 })).toBe(false);
    expect(esPendiente({ ...base, saldo_pendiente: null })).toBe(false);
  });

  it('coerces a numeric string balance', () => {
    expect(esPendiente({ ...base, saldo_pendiente: '1000' as unknown as number })).toBe(true);
  });
});

describe('mensajeDeError', () => {
  it('returns the message of an Error or a plain database error object', () => {
    expect(mensajeDeError(new Error('boom'), 'x')).toBe('boom');
    expect(mensajeDeError({ message: 'Anule primero los cobros' }, 'x')).toBe(
      'Anule primero los cobros',
    );
  });

  it('uses the fallback for anything else', () => {
    expect(mensajeDeError(null, 'x')).toBe('x');
    expect(mensajeDeError('texto', 'x')).toBe('x');
    expect(mensajeDeError({ message: '' }, 'x')).toBe('x');
  });
});

describe('etiquetaCondicion', () => {
  it('maps the sale condition to its label', () => {
    expect(etiquetaCondicion(1)).toBe('Contado');
    expect(etiquetaCondicion(2)).toBe('Crédito');
  });

  it('falls back to contado for null or unknown legacy values', () => {
    expect(etiquetaCondicion(null)).toBe('Contado');
    expect(etiquetaCondicion(undefined)).toBe('Contado');
  });
});
