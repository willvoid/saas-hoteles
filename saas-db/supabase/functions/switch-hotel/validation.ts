// Pure rules of the switch-hotel Edge Function (no Deno/DOM globals).

import { isPlainObject, parsePositiveInt } from '../_shared/rules.ts';

export type SwitchInput = { tenant_id: number };

export type SwitchValidation =
  | { ok: true; value: SwitchInput }
  | { ok: false; error: string };

export function validateSwitchInput(body: unknown): SwitchValidation {
  if (!isPlainObject(body)) return { ok: false, error: 'Cuerpo inválido.' };
  const tenantId = parsePositiveInt(body.tenant_id);
  if (tenantId === null) return { ok: false, error: 'El hotel seleccionado no es válido.' };
  return { ok: true, value: { tenant_id: tenantId } };
}

export interface MembershipRow {
  estado: string | null;
}

export interface TenantRow {
  estado: string | null;
  plan: string | null;
}

export type SwitchAccess = { ok: true } | { ok: false; status: number; error: string };

const norm = (value: string | null | undefined) => (value ?? '').trim().toLowerCase();

// The caller can enter a hotel only through an active profile in it, and only
// while the hotel is not suspended. The template tenant is never enterable.
// A missing profile and a missing tenant answer the same, so the response does
// not reveal which hotel ids exist.
export function checkSwitchAccess(
  membership: MembershipRow | null,
  tenant: TenantRow | null,
): SwitchAccess {
  if (!membership || !tenant || norm(membership.estado) !== 'activo' || norm(tenant.plan) === 'plantilla') {
    return { ok: false, status: 403, error: 'No tienes acceso a ese hotel.' };
  }
  if (!['trial', 'activo'].includes(norm(tenant.estado))) {
    return { ok: false, status: 403, error: 'El hotel está suspendido.' };
  }
  return { ok: true };
}
