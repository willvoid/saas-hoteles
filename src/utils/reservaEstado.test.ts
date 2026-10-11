import { describe, it, expect } from 'vitest';
import {
  canTransition,
  esReservaCerrada,
  getAllowedTargets,
  INITIAL_ESTADOS,
  requiresConfirmation,
  toCanonicalEstado,
} from './reservaEstado';

describe('canTransition', () => {
  it('allows the valid forward transitions', () => {
    expect(canTransition('Pendiente', 'Confirmada')).toBe(true);
    expect(canTransition('Pendiente', 'Check-in')).toBe(true); // walk-in
    expect(canTransition('Pendiente', 'Cancelada')).toBe(true);
    expect(canTransition('Confirmada', 'Check-in')).toBe(true);
    expect(canTransition('Confirmada', 'Cancelada')).toBe(true);
    expect(canTransition('Check-in', 'Check-out')).toBe(true);
  });

  it('rejects going backwards or reviving terminal states', () => {
    expect(canTransition('Check-out', 'Check-in')).toBe(false);
    expect(canTransition('Check-out', 'Confirmada')).toBe(false);
    expect(canTransition('Cancelada', 'Check-in')).toBe(false);
    expect(canTransition('Cancelada', 'Pendiente')).toBe(false);
    expect(canTransition('Check-in', 'Cancelada')).toBe(false);
    expect(canTransition('Confirmada', 'Pendiente')).toBe(false);
  });

  it('is not a transition when from === to', () => {
    expect(canTransition('Confirmada', 'Confirmada')).toBe(false);
    expect(canTransition('Check-in', 'Check-in')).toBe(false);
  });

  it('normalizes DB casing on both sides', () => {
    expect(canTransition('PENDIENTE', 'Confirmada')).toBe(true);
    expect(canTransition('pendiente', 'CHECK-IN')).toBe(true);
  });

  it('rejects unknown estados', () => {
    expect(canTransition('Fantasma', 'Confirmada')).toBe(false);
    expect(canTransition('Pendiente', 'Activa')).toBe(false);
    expect(canTransition(null, 'Confirmada')).toBe(false);
  });
});

describe('getAllowedTargets', () => {
  it('lists the valid next states', () => {
    expect(getAllowedTargets('Pendiente')).toEqual(['Confirmada', 'Check-in', 'Cancelada']);
    expect(getAllowedTargets('Confirmada')).toEqual(['Check-in', 'Cancelada']);
    expect(getAllowedTargets('Check-in')).toEqual(['Check-out']);
  });

  it('returns no targets for terminal states', () => {
    expect(getAllowedTargets('Check-out')).toEqual([]);
    expect(getAllowedTargets('Cancelada')).toEqual([]);
  });

  it('normalizes casing', () => {
    expect(getAllowedTargets('check-in')).toEqual(['Check-out']);
  });

  it('returns no targets for unknown estados', () => {
    expect(getAllowedTargets('Fantasma')).toEqual([]);
  });
});

describe('requiresConfirmation', () => {
  it('requires confirmation for critical states', () => {
    expect(requiresConfirmation('Check-in')).toBe(true);
    expect(requiresConfirmation('Check-out')).toBe(true);
    expect(requiresConfirmation('Cancelada')).toBe(true);
  });

  it('does not require confirmation for non-critical states', () => {
    expect(requiresConfirmation('Confirmada')).toBe(false);
    expect(requiresConfirmation('Pendiente')).toBe(false);
  });
});

describe('INITIAL_ESTADOS', () => {
  it('sólo deja crear la reserva como Pendiente o Confirmada', () => {
    expect(INITIAL_ESTADOS).toEqual(['Pendiente', 'Confirmada']);
  });
});

describe('esReservaCerrada', () => {
  it('es verdadero sólo después del Check-out', () => {
    expect(esReservaCerrada('Check-out')).toBe(true);
    expect(esReservaCerrada('CHECK-OUT')).toBe(true);
  });

  it('es falso mientras la estancia sigue viva o fue cancelada', () => {
    expect(esReservaCerrada('Pendiente')).toBe(false);
    expect(esReservaCerrada('Confirmada')).toBe(false);
    expect(esReservaCerrada('Check-in')).toBe(false);
    expect(esReservaCerrada('Cancelada')).toBe(false);
    expect(esReservaCerrada(null)).toBe(false);
  });
});

describe('toCanonicalEstado', () => {
  it('maps arbitrary casing to the canonical value', () => {
    expect(toCanonicalEstado('CHECK-OUT')).toBe('Check-out');
    expect(toCanonicalEstado('pendiente')).toBe('Pendiente');
  });

  it('returns null for unknown or empty input', () => {
    expect(toCanonicalEstado('Activa')).toBe(null);
    expect(toCanonicalEstado(null)).toBe(null);
    expect(toCanonicalEstado('')).toBe(null);
  });
});
