import { describe, expect, it } from 'vitest';
import type { TenantSummary } from '../services/superadminService';
import { DEFAULT_TENANT_FILTERS, filterTenants, formatDateOnly, isManageable, planOptions } from './tenantFilters';

const make = (over: Partial<TenantSummary>): TenantSummary => ({
  id: 1,
  nombre: 'Hotel Sol',
  slug: 'hotel-sol',
  estado: 'activo',
  plan: 'pro',
  trial_fin: null,
  vigente_hasta: null,
  suscripcion_vigente: true,
  created_at: '2026-01-01',
  usuarios: 1,
  establecimientos: 1,
  habitaciones: 1,
  ...over,
});

const sol = make({ id: 1 });
const luna = make({ id: 2, nombre: 'Posada Luna', slug: 'luna-azul', estado: 'suspendido', plan: 'basico' });
const trial = make({ id: 3, nombre: 'Árbol Hostal', slug: 'arbol', estado: 'trial', plan: 'trial' });
const template = make({ id: 4, nombre: 'Plantilla', slug: 'plantilla-base', plan: 'plantilla' });
const all = [sol, luna, trial, template];

describe('filterTenants', () => {
  it('returns everything with the default filters', () => {
    expect(filterTenants(all, DEFAULT_TENANT_FILTERS)).toEqual(all);
  });

  it('filters by estado', () => {
    expect(filterTenants(all, { ...DEFAULT_TENANT_FILTERS, estado: 'suspendido' })).toEqual([luna]);
  });

  it('filters by plan', () => {
    expect(filterTenants(all, { ...DEFAULT_TENANT_FILTERS, plan: 'pro' })).toEqual([sol]);
  });

  it('searches name or slug, ignoring case and accents', () => {
    expect(filterTenants(all, { ...DEFAULT_TENANT_FILTERS, search: 'LUNA' })).toEqual([luna]);
    expect(filterTenants(all, { ...DEFAULT_TENANT_FILTERS, search: 'arbol' })).toEqual([trial]);
    expect(filterTenants(all, { ...DEFAULT_TENANT_FILTERS, search: 'azul' })).toEqual([luna]);
  });

  it('combines filters', () => {
    expect(filterTenants(all, { estado: 'activo', plan: 'basico', search: '' })).toEqual([]);
  });

  it('ignores a whitespace-only search', () => {
    expect(filterTenants(all, { ...DEFAULT_TENANT_FILTERS, search: '   ' })).toEqual(all);
  });
});

describe('isManageable', () => {
  it('rejects the internal template tenant only', () => {
    expect(isManageable(template)).toBe(false);
    expect(isManageable(sol)).toBe(true);
  });
});

describe('planOptions', () => {
  it('lists distinct plans sorted', () => {
    expect(planOptions(all)).toEqual(['basico', 'plantilla', 'pro', 'trial']);
  });
});

describe('formatDateOnly', () => {
  it('formats dates and timestamps as dd/mm/yyyy', () => {
    expect(formatDateOnly('2026-03-05')).toBe('05/03/2026');
    expect(formatDateOnly('2026-03-05T10:00:00Z')).toBe('05/03/2026');
  });

  it('returns a dash for empty or invalid values', () => {
    expect(formatDateOnly(null)).toBe('-');
    expect(formatDateOnly('soon')).toBe('-');
  });
});
