import { describe, it, expect } from 'vitest';
import { isBlockingEstado, rowHasBlockingEstado } from './reservaBlockingState';

describe('isBlockingEstado', () => {
  it('blocks the exact lowercase literals', () => {
    expect(isBlockingEstado('pendiente')).toBe(true);
    expect(isBlockingEstado('confirmada')).toBe(true);
    expect(isBlockingEstado('check-in')).toBe(true);
  });

  it('blocks uppercase variants (defensive against web-origin RPC literals)', () => {
    expect(isBlockingEstado('PENDIENTE')).toBe(true);
    expect(isBlockingEstado('CONFIRMADA')).toBe(true);
  });

  it('blocks values with surrounding whitespace', () => {
    expect(isBlockingEstado(' pendiente ')).toBe(true);
  });

  it('does not block cancelled or checked-out reservations', () => {
    expect(isBlockingEstado('Cancelada')).toBe(false);
    expect(isBlockingEstado('Check-out')).toBe(false);
  });

  it('does not block non-string or missing estado', () => {
    expect(isBlockingEstado(undefined)).toBe(false);
    expect(isBlockingEstado(null)).toBe(false);
    expect(isBlockingEstado(42)).toBe(false);
  });
});

describe('rowHasBlockingEstado', () => {
  it('handles the embed as a plain object', () => {
    expect(rowHasBlockingEstado({ reservas: { estado: 'Confirmada' } })).toBe(true);
  });

  it('handles the embed as a single-element array', () => {
    expect(rowHasBlockingEstado({ reservas: [{ estado: 'Confirmada' }] })).toBe(true);
  });

  it('does not block a non-blocking estado in either shape', () => {
    expect(rowHasBlockingEstado({ reservas: { estado: 'Cancelada' } })).toBe(false);
    expect(rowHasBlockingEstado({ reservas: [{ estado: 'Check-out' }] })).toBe(false);
  });

  it('does not block when the embed is missing entirely', () => {
    expect(rowHasBlockingEstado({ reservas: null })).toBe(false);
    expect(rowHasBlockingEstado({ reservas: [] })).toBe(false);
  });
});
