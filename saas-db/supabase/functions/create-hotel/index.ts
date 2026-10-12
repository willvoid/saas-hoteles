// Creates a hotel (tenant) owned by the caller's account.
//
// fn_provision_tenant (migration 0008) is service_role only, so the browser
// cannot call it. This function authenticates the caller, checks they may open
// another hotel, and provisions it with the caller as its administrator. The
// account's auth_id is always the caller's, never taken from the body.
//
// fn_provision_tenant leaves `app_metadata.tenant_id` pointing at the new hotel,
// so the new hotel becomes the active one: the client must call
// supabase.auth.refreshSession() afterwards.
//
// Deploy (from saas-db/): supabase functions deploy create-hotel --use-api

import { authenticate, fail, json } from '../_shared/http.ts';
import {
  buildProvisionPayload,
  checkHotelEligibility,
  mapProvisionError,
  validateCreateHotelInput,
} from './validation.ts';

async function handle(req: Request): Promise<Response> {
  const call = await authenticate(req);
  if (call instanceof Response) return call;
  const { userId, admin } = call;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail(400, 'Cuerpo inválido.');
  }
  const parsed = validateCreateHotelInput(body);
  if (!parsed.ok) return fail(400, parsed.error);
  const input = parsed.value;

  // Eligibility: the cargo of every active profile of the caller (no embeds,
  // as in switch-hotel).
  const profiles = await admin
    .from('usuario')
    .select('fk_cargo')
    .eq('auth_id', userId)
    .ilike('estado', 'activo');
  if (profiles.error) {
    console.error('create-hotel: profiles lookup failed', profiles.error.code);
    return fail(500, 'No se pudo verificar tu cuenta.');
  }

  const cargoIds = [...new Set((profiles.data ?? []).map((p) => p.fk_cargo))];
  let cargoNames = new Map<number, string>();
  if (cargoIds.length > 0) {
    const cargos = await admin.from('cargo').select('id_cargo, cargo').in('id_cargo', cargoIds);
    if (cargos.error) {
      console.error('create-hotel: cargo lookup failed', cargos.error.code);
      return fail(500, 'No se pudo verificar tu cuenta.');
    }
    cargoNames = new Map((cargos.data ?? []).map((c) => [Number(c.id_cargo), String(c.cargo)]));
  }
  const eligibility = checkHotelEligibility(
    (profiles.data ?? []).map((p) => cargoNames.get(Number(p.fk_cargo)) ?? ''),
  );
  if (!eligibility.ok) return fail(eligibility.status, eligibility.error);

  // The RUC is unique across all hotels. Checked up front for a clean message;
  // the unique index still covers a concurrent request (mapped below).
  const rucHit = await admin.from('datos_empresa').select('id_empresa').eq('ruc', input.empresa.ruc).limit(1);
  if (rucHit.error) {
    console.error('create-hotel: ruc lookup failed', rucHit.error.code);
    return fail(500, 'No se pudo verificar el RUC.');
  }
  if ((rucHit.data ?? []).length > 0) {
    return fail(409, 'Ya existe un hotel registrado con ese RUC.');
  }

  // One transaction inside the function: nothing to roll back on failure.
  const { data, error } = await admin.rpc('fn_provision_tenant', {
    p_payload: buildProvisionPayload(input, userId),
  });
  if (error) {
    console.error('create-hotel: provisioning failed', error.code);
    const mapped = mapProvisionError(error);
    return fail(mapped.status, mapped.message);
  }

  return json({ ok: true, tenant_id: data?.tenant_id }, 201);
}

Deno.serve(async (req) => {
  try {
    return await handle(req);
  } catch (err) {
    // Log the error type only: the request carries personal data.
    console.error('create-hotel: unhandled', err instanceof Error ? err.name : typeof err);
    return fail(500, 'Error interno del servidor.');
  }
});
