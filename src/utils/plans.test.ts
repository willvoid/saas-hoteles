import { describe, it, expect } from 'vitest';
import { annualSavings, hotelsLabel, limitLabel, planFeatures } from './plans';
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
  precio_hotel_adicional: null,
  precio_hotel_adicional_anual: null,
  contacto_ventas: false,
  modulos: [],
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
      'Hoteles según contrato',
      'Módulo de contabilidad incluido',
    ]);
  });

  it('never mentions electronic invoicing in the capacity summary', () => {
    expect(planFeatures(base).join(' ')).not.toMatch(/sifen|electr/i);
  });
});

describe('hotelsLabel', () => {
  it('shows the extra-hotel price when the plan has one', () => {
    expect(hotelsLabel({ ...base, precio_hotel_adicional: 180000 })).toMatch(
      /^1 hotel incluido · \+.*180\.000.*\/mes por hotel adicional$/,
    );
  });

  it('says by contract when unlimited or sold by sales', () => {
    expect(hotelsLabel({ ...base, max_hoteles: null })).toBe('Hoteles según contrato');
    expect(hotelsLabel({ ...base, contacto_ventas: true })).toBe('Hoteles según contrato');
  });

  it('falls back to a plain count', () => {
    expect(hotelsLabel(base)).toBe('1 hotel por cuenta');
  });
});
