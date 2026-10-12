// Changes the active hotel of the caller's account.
//
// The active hotel is `app_metadata.tenant_id` in the JWT (current_tenant_id(),
// migration 0001), which only the server can write. This function checks that
// the caller has an active profile in the requested hotel and that the hotel is
// not suspended, then writes the claim with the Admin API. The client must call
// supabase.auth.refreshSession() afterwards to get a token with the new claim.
//
// The active hotel belongs to the whole account: another tab or device switches
// on its next token refresh.
//
// Deploy (from saas-db/): supabase functions deploy switch-hotel --use-api

import { authenticate, fail, json } from '../_shared/http.ts';
import { checkSwitchAccess, validateSwitchInput } from './validation.ts';

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
  const parsed = validateSwitchInput(body);
  if (!parsed.ok) return fail(400, parsed.error);
  const tenantId = parsed.value.tenant_id;

  // Two queries instead of an embed: usuario and tenants have more than one
  // relationship (tenants.fk_usuario_web), which makes an embed ambiguous.
  const [membership, tenant] = await Promise.all([
    admin.from('usuario').select('estado').eq('auth_id', userId).eq('tenant_id', tenantId).maybeSingle(),
    admin.from('tenants').select('estado, plan').eq('id', tenantId).maybeSingle(),
  ]);
  if (membership.error || tenant.error) {
    console.error('switch-hotel: lookup failed', membership.error?.code, tenant.error?.code);
    return fail(500, 'No se pudo verificar el acceso al hotel.');
  }

  const access = checkSwitchAccess(membership.data, tenant.data);
  if (!access.ok) return fail(access.status, access.error);

  // app_metadata is merged by GoTrue: only tenant_id changes. fk_cargo keeps its
  // old value on purpose; handle_new_user is a no-op here because the profile
  // for this hotel already exists.
  const { error } = await admin.auth.admin.updateUserById(userId, {
    app_metadata: { tenant_id: tenantId },
  });
  if (error) {
    console.error('switch-hotel: update failed', error.code, error.status);
    return fail(500, 'No se pudo cambiar de hotel.');
  }

  return json({ ok: true });
}

Deno.serve(async (req) => {
  try {
    return await handle(req);
  } catch (err) {
    console.error('switch-hotel: unhandled', err instanceof Error ? err.name : typeof err);
    return fail(500, 'Error interno del servidor.');
  }
});
