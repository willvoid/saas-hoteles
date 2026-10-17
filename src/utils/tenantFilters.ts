import type { TenantEstado, TenantSummary } from '../services/superadminService';

// Pure list helpers of the super-admin panel.

export interface TenantFilters {
  estado: TenantEstado | 'todos';
  plan: string;
  search: string;
}

export const DEFAULT_TENANT_FILTERS: TenantFilters = { estado: 'todos', plan: 'todos', search: '' };

// Internal plan of the seed tenant copied into every new hotel: never managed from the panel.
export const TEMPLATE_PLAN = 'plantilla';

export const isManageable = (tenant: { plan: string }): boolean => tenant.plan !== TEMPLATE_PLAN;

const normalize = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

export function filterTenants(tenants: TenantSummary[], filters: TenantFilters): TenantSummary[] {
  const term = normalize(filters.search.trim());
  return tenants.filter((t) => {
    if (filters.estado !== 'todos' && t.estado !== filters.estado) return false;
    if (filters.plan !== 'todos' && t.plan !== filters.plan) return false;
    if (!term) return true;
    return normalize(t.nombre).includes(term) || normalize(t.slug).includes(term);
  });
}

export const planOptions = (tenants: TenantSummary[]): string[] =>
  [...new Set(tenants.map((t) => t.plan))].sort();

// "2026-03-05" or an ISO timestamp -> "05/03/2026"; null/invalid -> "-".
export function formatDateOnly(value: string | null | undefined): string {
  const match = value ? /^(\d{4})-(\d{2})-(\d{2})/.exec(value) : null;
  return match ? `${match[3]}/${match[2]}/${match[1]}` : '-';
}
