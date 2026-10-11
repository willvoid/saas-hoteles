import { describe, it, expect } from 'vitest';
import {
  canTransition,
  getAllowedTargets,
  requiresConfirmation,
  toCanonicalEstado,
} from './facturaEstado';

describe('canTransition', () => {
  it('allows emitida → anulada', () => {
    expect(canTransition('EMITIDA', 'ANULADA')).toBe(true);
  });

  it('rejects reviving a terminal state', () => {
    expect(canTransition('ANULADA', 'EMITIDA')).toBe(false);
  });

  it('is not a transition when from === to', () => {
    expect(canTransition('EMITIDA', 'EMITIDA')).toBe(false);
    expect(canTransition('ANULADA', 'ANULADA')).toBe(false);
  });

  it('normalizes DB casing on both sides', () => {
    expect(canTransition('emitida', 'ANULADA')).toBe(true);
    expect(canTransition('Emitida', 'anulada')).toBe(true);
  });

  it('rejects unknown or null estados', () => {
    expect(canTransition('FANTASMA', 'ANULADA')).toBe(false);
    expect(canTransition(null, 'ANULADA')).toBe(false);
  });
});

describe('getAllowedTargets', () => {
  it('lists anulada as the only target of emitida', () => {
    expect(getAllowedTargets('EMITIDA')).toEqual(['ANULADA']);
  });

  it('returns no targets for a terminal state', () => {
    expect(getAllowedTargets('ANULADA')).toEqual([]);
  });

  it('returns no targets for unknown estados', () => {
    expect(getAllowedTargets('FANTASMA')).toEqual([]);
  });
});

describe('requiresConfirmation', () => {
  it('requires confirmation for anulación', () => {
    expect(requiresConfirmation('ANULADA')).toBe(true);
  });

  it('does not require confirmation for emisión', () => {
    expect(requiresConfirmation('EMITIDA')).toBe(false);
  });
});

describe('toCanonicalEstado', () => {
  it('maps arbitrary casing to the canonical value', () => {
    expect(toCanonicalEstado('anulada')).toBe('ANULADA');
    expect(toCanonicalEstado('EmItIdA')).toBe('EMITIDA');
  });

  it('returns null for unknown or empty input', () => {
    expect(toCanonicalEstado('OTRO')).toBe(null);
    expect(toCanonicalEstado(null)).toBe(null);
    expect(toCanonicalEstado('')).toBe(null);
  });
});
