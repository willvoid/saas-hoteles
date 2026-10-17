// Platform super-admin API. One entry point, `POST { action, ...params }`.
//
// Auth: the caller's JWT is validated (authenticate), then fn_es_platform_admin
// (migration 0024, service_role only) decides whether the caller is an operator.
// `whoami` answers any valid JWT; every other action returns 403 to non-admins
// before reading any parameter. Every mutating action writes platform_audit and
// fails loudly if that insert fails.
//
// Deploy (from saas-db/): supabase functions deploy superadmin --use-api

import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { authenticate, fail, json } from '../_shared/http.ts';
import {
  buildProvisionPayload,
  EMAIL_RE,
  mapProvisionError,
  validateCreateHotelInput,
} from '../_shared/hotelInput.ts';
import { isPlainObject, parsePositiveInt } from '../_shared/rules.ts';

const ESTADOS = ['trial', 'activo', 'suspendido'] as const;
const CICLOS = ['mensual', 'anual'] as const;
const PLAN_RE = /^[a-z][a-z0-9_]{1,19}$/;
const PASSWORD_MIN = 8;
const PASSWORD_MAX = 72;

type Ctx = { admin: SupabaseClient; userId: string; body: Record<string, unknown> };

function tenantIdOf(body: Record<string, unknown>): number | null {
  return parsePositiveInt(body.tenant_id);
}

// A failed audit write must surface: the mutation already happened, so say so.
async function audit(
  { admin, userId }: Ctx,
  action: string,
  tenantId: number | null,
  payload: Record<string, unknown>,
): Promise<Response | null> {
  const { error } = await admin
    .from('platform_audit')
    .insert({ actor: userId, action, tenant_id: tenantId, payload });
  if (error) {
    console.error('superadmin: audit insert failed', action, error.code);
    return fail(500, 'La acción se aplicó pero no se pudo registrar la auditoría.');
  }
  return null;
}

async function listTenants({ admin }: Ctx): Promise<Response> {
  const { data, error } = await admin.rpc('fn_admin_tenants_resumen');
  if (error) {
    console.error('superadmin: list_tenants failed', error.code);
    return fail(500, 'No se pudo obtener el listado.');
  }
  return json({ data });
}

async function getTenant({ admin, body }: Ctx): Promise<Response> {
  const tenantId = tenantIdOf(body);
  if (tenantId === null) return fail(400, 'tenant_id inválido.');

  const [tenant, usuarios, estabs] = await Promise.all([
    admin.from('tenants').select('*').eq('id', tenantId).maybeSingle(),
    admin
      .from('usuario')
      .select('id_usuario, nombre, correo, estado, cargo:fk_cargo(cargo)')
      .eq('tenant_id', tenantId)
      .order('id_usuario'),
    admin
      .from('establecimientos')
      .select('id_establecimiento, codigo_establecimiento, denominacion, direccion, estado_establecimiento')
      .eq('tenant_id', tenantId)
      .order('id_establecimiento'),
  ]);
  if (tenant.error || usuarios.error || estabs.error) {
    console.error('superadmin: get_tenant failed', tenant.error?.code, usuarios.error?.code, estabs.error?.code);
    return fail(500, 'No se pudo obtener el hotel.');
  }
  if (!tenant.data) return fail(404, 'No existe el hotel.');

  return json({
    data: {
      tenant: tenant.data,
      usuarios: (usuarios.data ?? []).map((u) => {
        const cargo = (u as { cargo?: { cargo?: string } | { cargo?: string }[] | null }).cargo;
        const cargoName = Array.isArray(cargo) ? cargo[0]?.cargo : cargo?.cargo;
        return {
          id: u.id_usuario,
          nombre: u.nombre,
          correo: u.correo,
          estado: u.estado,
          cargo: cargoName ?? null,
        };
      }),
      establecimientos: estabs.data ?? [],
    },
  });
}

async function setEstado(ctx: Ctx): Promise<Response> {
  const { admin, body } = ctx;
  const tenantId = tenantIdOf(body);
  if (tenantId === null) return fail(400, 'tenant_id inválido.');
  const estado = body.estado;
  if (typeof estado !== 'string' || !(ESTADOS as readonly string[]).includes(estado)) {
    return fail(400, 'Estado inválido: usar trial, activo o suspendido.');
  }

  const { data: tenant, error: lookupError } = await admin
    .from('tenants')
    .select('id, estado, plan')
    .eq('id', tenantId)
    .maybeSingle();
  if (lookupError) {
    console.error('superadmin: set_estado lookup failed', lookupError.code);
    return fail(500, 'No se pudo verificar el hotel.');
  }
  if (!tenant) return fail(404, 'No existe el hotel.');
  if (tenant.plan === 'plantilla') return fail(400, 'El hotel plantilla no se puede modificar.');

  const { error } = await admin.from('tenants').update({ estado }).eq('id', tenantId);
  if (error) {
    console.error('superadmin: set_estado update failed', error.code);
    return fail(500, 'No se pudo cambiar el estado.');
  }

  const auditFail = await audit(ctx, 'set_estado', tenantId, { from: tenant.estado, to: estado });
  if (auditFail) return auditFail;
  return json({ data: { tenant_id: tenantId, estado } });
}

async function setPlan(ctx: Ctx): Promise<Response> {
  const { admin, body } = ctx;
  const tenantId = tenantIdOf(body);
  if (tenantId === null) return fail(400, 'tenant_id inválido.');
  const { plan, ciclo, monto, referencia } = body;
  if (typeof plan !== 'string' || !PLAN_RE.test(plan)) return fail(400, 'Plan inválido.');
  if (typeof ciclo !== 'string' || !(CICLOS as readonly string[]).includes(ciclo)) {
    return fail(400, 'Ciclo inválido: usar mensual o anual.');
  }
  let montoValue: number | null = null;
  if (monto !== undefined && monto !== null) {
    if (typeof monto !== 'number' || !Number.isFinite(monto) || monto < 0) {
      return fail(400, 'Monto inválido.');
    }
    montoValue = monto;
  }
  let referenciaValue: string | null = null;
  if (referencia !== undefined && referencia !== null) {
    if (typeof referencia !== 'string' || referencia.length > 200) return fail(400, 'Referencia inválida.');
    referenciaValue = referencia.trim() || null;
  }

  const { data: vigenteHasta, error } = await admin.rpc('fn_activar_plan', {
    p_tenant: tenantId,
    p_plan: plan,
    p_ciclo: ciclo,
    p_monto: montoValue,
    p_referencia: referenciaValue,
  });
  if (error) {
    if (error.code === '22023') return fail(400, error.message || 'Datos de plan inválidos.');
    console.error('superadmin: set_plan failed', error.code);
    return fail(500, 'No se pudo activar el plan.');
  }

  const auditFail = await audit(ctx, 'set_plan', tenantId, {
    plan,
    ciclo,
    monto: montoValue,
    referencia: referenciaValue,
    vigente_hasta: vigenteHasta,
  });
  if (auditFail) return auditFail;
  return json({ data: { tenant_id: tenantId, plan, ciclo, vigente_hasta: vigenteHasta } });
}

// Duplicates the createUser + fn_provision_tenant + rollback core of
// register-tenant (that file's logic lives inline in its handler and editing it
// is out of scope). Differences: no Turnstile or rate limit (caller is an
// operator) and the account is created email-confirmed.
async function createTenant(ctx: Ctx): Promise<Response> {
  const { admin, body } = ctx;
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (email.length > 254 || !EMAIL_RE.test(email)) return fail(400, 'El correo no es válido.');
  const password = body.password;
  if (typeof password !== 'string' || password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) {
    return fail(400, `La contraseña debe tener entre ${PASSWORD_MIN} y ${PASSWORD_MAX} caracteres.`);
  }
  const hotelParsed = validateCreateHotelInput(body);
  if (!hotelParsed.ok) return fail(400, hotelParsed.error);
  const hotel = hotelParsed.value;

  const rucHit = await admin.from('datos_empresa').select('id_empresa').eq('ruc', hotel.empresa.ruc).limit(1);
  if (rucHit.error) {
    console.error('superadmin: ruc lookup failed', rucHit.error.code);
    return fail(500, 'No se pudo verificar el RUC.');
  }
  if ((rucHit.data ?? []).length > 0) return fail(409, 'Ya existe un hotel registrado con ese RUC.');

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createError || !created?.user) {
    if (createError?.code === 'email_exists') return fail(409, 'Ya existe una cuenta con ese correo.');
    console.error('superadmin: createUser failed', createError?.code, createError?.status);
    return fail(500, 'No se pudo crear la cuenta.');
  }
  const authId = created.user.id;

  const { data: provisioned, error: provisionError } = await admin.rpc('fn_provision_tenant', {
    p_payload: buildProvisionPayload(hotel, authId),
  });
  if (provisionError) {
    console.error('superadmin: provisioning failed', provisionError.code);
    const { error: rollbackError } = await admin.auth.admin.deleteUser(authId);
    if (rollbackError) console.error('superadmin: rollback failed', rollbackError.code, rollbackError.status);
    const mapped = mapProvisionError(provisionError);
    return fail(mapped.status, mapped.message);
  }

  const tenantId = parsePositiveInt((provisioned as { tenant_id?: unknown } | null)?.tenant_id);
  // Never store the password in the audit payload.
  const auditFail = await audit(ctx, 'create_tenant', tenantId, {
    email,
    auth_id: authId,
    nombre: hotel.hotel.nombre,
    slug: hotel.hotel.slug,
    ruc: hotel.empresa.ruc,
  });
  if (auditFail) return auditFail;
  return json({ data: { tenant_id: tenantId, auth_id: authId } }, 201);
}

const ACTIONS: Record<string, (ctx: Ctx) => Promise<Response>> = {
  list_tenants: listTenants,
  get_tenant: getTenant,
  set_estado: setEstado,
  set_plan: setPlan,
  create_tenant: createTenant,
};

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
  if (!isPlainObject(body) || typeof body.action !== 'string') return fail(400, 'Acción inválida.');
  const action = body.action;

  const { data: isAdmin, error } = await admin.rpc('fn_es_platform_admin', { p_uid: userId });
  if (error) {
    console.error('superadmin: admin check failed', error.code);
    return fail(500, 'No se pudo verificar el acceso.');
  }

  if (action === 'whoami') return json({ data: { isPlatformAdmin: isAdmin === true } });
  if (isAdmin !== true) return fail(403, 'Acceso denegado.');

  const handler = Object.hasOwn(ACTIONS, action) ? ACTIONS[action] : undefined;
  if (!handler) return fail(400, 'Acción desconocida.');
  return await handler({ admin, userId, body });
}

Deno.serve(async (req) => {
  try {
    return await handle(req);
  } catch (err) {
    console.error('superadmin: unhandled', err instanceof Error ? err.name : typeof err);
    return fail(500, 'Error interno del servidor.');
  }
});
