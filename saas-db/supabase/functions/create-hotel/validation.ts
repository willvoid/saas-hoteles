// Pure rules of the create-hotel Edge Function (no Deno/DOM globals).
// The hotel-input validation lives in _shared/hotelInput.ts (also used by
// register-tenant); it is re-exported here so existing imports keep working.

export {
  buildProvisionPayload,
  mapProvisionError,
  RESERVED_SLUGS,
  validateCreateHotelInput,
} from '../_shared/hotelInput.ts';
export type {
  CreateHotelInput,
  CreateHotelValidation,
  ProvisionErrorLike,
} from '../_shared/hotelInput.ts';

const ADMIN_CARGOS: readonly string[] = ['admin', 'administrador'];

export type Eligibility = { ok: true } | { ok: false; status: number; error: string };

// One entry per active profile of the caller. Only admins of every hotel they
// belong to can open another one, so a staff account created by a hotel's admin
// cannot spawn trial hotels. An account with no hotel can open its first one.
//
// `maxHoteles` comes from fn_max_hoteles_cuenta() (migration 0014): the highest
// hotel limit among the plans of the hotels the account administers. null means
// unlimited. The trigger-level checks in the DB stay authoritative.
export function checkHotelEligibility(
  cargos: readonly string[],
  maxHoteles: number | null,
): Eligibility {
  const normalized = cargos.map((c) => c.trim().toLowerCase());
  if (normalized.some((c) => !ADMIN_CARGOS.includes(c))) {
    return { ok: false, status: 403, error: 'Solo un administrador puede crear hoteles.' };
  }
  if (maxHoteles !== null && normalized.length >= maxHoteles) {
    return {
      ok: false,
      status: 403,
      error: `Tu plan permite un máximo de ${maxHoteles} ${maxHoteles === 1 ? 'hotel' : 'hoteles'} por cuenta. Mejorá tu plan para crear más.`,
    };
  }
  return { ok: true };
}
