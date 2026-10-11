import { describe, it, expect } from 'vitest';
import { getReservationCount, isClienteRecurrente } from './clienteRecurrencia';

describe('clienteRecurrencia utils', () => {
  describe('getReservationCount', () => {
    it('returns 0 for null or undefined client', () => {
      expect(getReservationCount(null)).toBe(0);
      expect(getReservationCount(undefined)).toBe(0);
    });

    it('returns total_reservas if present as a number', () => {
      expect(getReservationCount({ total_reservas: 5 })).toBe(5);
      expect(getReservationCount({ total_reservas: 0 })).toBe(0);
    });

    it('returns reservas_count if present as a number', () => {
      expect(getReservationCount({ reservas_count: 3 })).toBe(3);
    });

    it('returns length of reservas array if present', () => {
      expect(getReservationCount({ reservas: [{ id_reserva: 1 }, { id_reserva: 2 }] })).toBe(2);
      expect(getReservationCount({ reservas: [] })).toBe(0);
    });

    it('returns count from aggregate reservas array object if present', () => {
      expect(getReservationCount({ reservas: [{ count: 4 }] })).toBe(4);
    });

    it('returns 2 if es_recurrente is true and no count', () => {
      expect(getReservationCount({ es_recurrente: true })).toBe(2);
    });

    it('returns 1 if es_recurrente is false and no count', () => {
      expect(getReservationCount({ es_recurrente: false })).toBe(1);
    });
  });

  describe('isClienteRecurrente', () => {
    it('returns false for null or undefined', () => {
      expect(isClienteRecurrente(null)).toBe(false);
      expect(isClienteRecurrente(undefined)).toBe(false);
    });

    it('returns true when es_recurrente is explicitly true', () => {
      expect(isClienteRecurrente({ es_recurrente: true })).toBe(true);
    });

    it('returns false when es_recurrente is explicitly false', () => {
      expect(isClienteRecurrente({ es_recurrente: false })).toBe(false);
    });

    it('returns true when client has 2 or more reservations', () => {
      expect(isClienteRecurrente({ total_reservas: 2 })).toBe(true);
      expect(isClienteRecurrente({ total_reservas: 10 })).toBe(true);
      expect(isClienteRecurrente({ reservas: [{ id_reserva: 1 }, { id_reserva: 2 }] })).toBe(true);
      expect(isClienteRecurrente({ reservas: [{ count: 3 }] })).toBe(true);
    });

    it('returns false when client has 0 or 1 reservation', () => {
      expect(isClienteRecurrente({ total_reservas: 1 })).toBe(false);
      expect(isClienteRecurrente({ total_reservas: 0 })).toBe(false);
      expect(isClienteRecurrente({ reservas: [{ id_reserva: 1 }] })).toBe(false);
      expect(isClienteRecurrente({ reservas: [] })).toBe(false);
    });
  });
});
