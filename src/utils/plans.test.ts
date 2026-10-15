import { describe, it, expect } from 'vitest';
import { annualSavings, limitLabel, planFeatures } from './plans';
import type { PublicPlan } from './plans';

const base: PublicPlan = {
  codigo: 'pro',
  nombre: 'Pro',
  precio_mensual: 100000,
  precio_anual: 1000000,
  moneda: 'PYG',
  max_habitaciones: 20,
  max_usuarios: 5,
  max_hoteles: 1,
  mod_contabilidad: false,
};

describe('annualSavings', () => {
  it('reports months free and percent vs 12x monthly', () => {
    expect(annualSavings(base)).toEqual({ monthsFree: 2, percent: 17 });
  });

  it('is zero when there is no annual price or no discount', () => {
    expect(annualSavings({ ...base, precio_anual: null })).toEqual({ monthsFree: 0, percent: 0 });
    expect(annualSavings({ ...base, precio_anual: 1200000 })).toEqual({ monthsFree: 0, percent: 0 });
    expect(annualSavings({ ...base, precio_mensual: 0, precio_anual: 0 })).toEqual({ monthsFree: 0, percent: 0 });
  });
});

describe('limitLabel', () => {
  it('formats a finite limit with singular/plural', () => {
    expect(limitLabel(20, 'habitación', 'habitaciones')).toBe('20 habitaciones');
    expect(limitLabel(1, 'hotel', 'hoteles')).toBe('1 hotel');
  });

  it('formats null as unlimited with matching gender', () => {
    expect(limitLabel(null, 'habitación', 'habitaciones')).toBe('Habitaciones ilimitadas');
    expect(limitLabel(null, 'usuario', 'usuarios')).toBe('Usuarios ilimitados');
  });
});

describe('planFeatures', () => {
  it('lists rooms, users, hotels and accounting in order', () => {
    expect(planFeatures(base)).toEqual([
      '20 habitaciones',
      '5 usuarios',
      '1 hotel por cuenta',
      'Sin módulo de contabilidad',
    ]);
  });

  it('handles unlimited limits and accounting included', () => {
    const f = planFeatures({
      ...base, max_habitaciones: null, max_usuarios: null, max_hoteles: null, mod_contabilidad: true,
    });
    expect(f).toEqual([
      'Habitaciones ilimitadas',
      'Usuarios ilimitados',
      'Hoteles ilimitados por cuenta',
      'Módulo de contabilidad incluido',
    ]);
  });

  it('never mentions electronic invoicing', () => {
    expect(planFeatures(base).join(' ')).not.toMatch(/sifen|electr/i);
  });
});
