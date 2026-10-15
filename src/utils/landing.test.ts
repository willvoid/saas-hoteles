import { describe, it, expect } from 'vitest';
import { buildWhatsAppUrl, pickHighlightedPlan } from './landing';
import type { PublicPlan } from './plans';

const plan = (codigo: string): PublicPlan => ({
  codigo,
  nombre: codigo,
  precio_mensual: 1,
  precio_anual: null,
  moneda: 'PYG',
  max_habitaciones: null,
  max_usuarios: null,
  max_hoteles: null,
  mod_contabilidad: false,
});

describe('buildWhatsAppUrl', () => {
  it('returns null when the number is missing or blank', () => {
    expect(buildWhatsAppUrl(undefined)).toBeNull();
    expect(buildWhatsAppUrl('')).toBeNull();
    expect(buildWhatsAppUrl('   ')).toBeNull();
  });

  it('returns null when the value has no digits', () => {
    expect(buildWhatsAppUrl('abc')).toBeNull();
  });

  it('keeps only digits', () => {
    expect(buildWhatsAppUrl('+595 981-123 456')).toBe('https://wa.me/595981123456');
  });

  it('adds an encoded prefilled message when given', () => {
    expect(buildWhatsAppUrl('595981123456', 'Hola, quiero info')).toBe(
      'https://wa.me/595981123456?text=Hola%2C%20quiero%20info',
    );
  });
});

describe('pickHighlightedPlan', () => {
  it('returns null for no plans', () => {
    expect(pickHighlightedPlan([])).toBeNull();
  });

  it('returns null for a single plan', () => {
    expect(pickHighlightedPlan([plan('a')])).toBeNull();
  });

  it('picks the middle plan of three', () => {
    expect(pickHighlightedPlan([plan('a'), plan('b'), plan('c')])).toBe('b');
  });

  it('picks the upper-middle plan of two', () => {
    expect(pickHighlightedPlan([plan('a'), plan('b')])).toBe('b');
  });
});
