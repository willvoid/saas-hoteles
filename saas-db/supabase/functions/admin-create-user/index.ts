// Admin-only creation of staff accounts for the caller's own tenant.
//
// The browser cannot create auth users on behalf of others (that needs the
// service_role key, which must never reach the client). This function:
//   1. Authenticates the caller from their JWT.
//   2. Takes the tenant from the caller's JWT claim (never from the body) and
//      checks, through the DB helper current_user_role(), that the caller has
//      an active profile in an active tenant and is admin or gerente.
//   3. Validates the payload and the cargo, and rejects duplicate correo/usuario.
//   4. Creates the Auth account with the Admin API and
//      app_metadata = { tenant_id, fk_cargo }. The handle_new_user trigger
//      (migration 0005) then creates the `usuario` profile.
//   5. Deletes the Auth account again if anything fails afterwards.
//
// Deploy (from saas-db/): supabase functions deploy admin-create-user
// Secrets SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are
// injected by the Supabase runtime. Optional: ALLOWED_ORIGIN.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import {
  canAssignCargo,
  canCreateUsers,
  escapeLikePattern,
  isStaffCargo,
  mapAuthCreateError,
  parsePositiveInt,
  validateCreateUserInput,
} from './validation.ts';

const corsHeaders = {
  // Auth is a bearer token, not a cookie, so a wildcard origin does not widen
  // access. ALLOWED_ORIGIN can pin it to the production site.
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function fail(status: number, error: string): Response {
  return json({ error }, status);
}

const clientOptions = { auth: { autoRefreshToken: false, persistSession: false } };

// The JWT has already been validated by auth.getUser(); this only reads the
// claim RLS itself relies on (current_tenant_id() in migration 0001).
function readTenantClaim(jwt: string): number | null {
  try {
    const payload = jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const claims = JSON.parse(atob(payload));
    return parsePositiveInt(claims?.app_metadata?.tenant_id);
  } catch {
    return null;
  }
}

async function handle(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return fail(405, 'Método no permitido.');

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    console.error('admin-create-user: missing runtime secrets');
    return fail(500, 'Configuración del servidor incompleta.');
  }

  const authHeader = req.headers.get('Authorization') ?? '';
  const jwt = /^Bearer\s+(.+)$/i.exec(authHeader)?.[1];
  if (!jwt) return fail(401, 'No autorizado.');

  // 1. Identify the caller. This client carries the caller's JWT, so RPCs and
  //    RLS evaluate as the caller.
  const callerClient = createClient(supabaseUrl, anonKey, {
    ...clientOptions,
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
  const { data: caller, error: callerError } = await callerClient.auth.getUser(jwt);
  if (callerError || !caller?.user) return fail(401, 'Sesión inválida.');

  // 2. Tenant from the JWT, role from the DB helper (null if the profile is
  //    inactive or the tenant is suspended).
  const tenantId = readTenantClaim(jwt);
  if (tenantId === null) return fail(403, 'Tu cuenta no está asociada a un hotel.');

  const { data: callerRole, error: roleError } = await callerClient.rpc('current_user_role');
  if (roleError) {
    console.error('admin-create-user: role lookup failed', roleError.code);
    return fail(500, 'No se pudo verificar el rol.');
  }
  if (!canCreateUsers(callerRole)) {
    return fail(403, 'Solo un administrador o gerente puede crear usuarios.');
  }

  // 3. Validate the payload. Unknown fields (including any tenant_id) are ignored.
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail(400, 'Cuerpo inválido.');
  }
  const parsed = validateCreateUserInput(body);
  if (!parsed.ok) return fail(400, parsed.error);
  const input = parsed.value;

  const admin = createClient(supabaseUrl, serviceRoleKey, clientOptions);

  // 3.a Cargo must exist, be a staff cargo, and be assignable by this caller.
  //     guard_cargo_admin (0005) does not fire for service_role, so this check
  //     is the only one on this path.
  const { data: cargoRow, error: cargoError } = await admin
    .from('cargo')
    .select('id_cargo, cargo')
    .eq('id_cargo', input.fk_cargo)
    .maybeSingle();
  if (cargoError) return fail(500, 'No se pudo verificar el cargo.');
  if (!cargoRow) return fail(400, 'El cargo seleccionado no existe.');
  if (!isStaffCargo(cargoRow.cargo)) return fail(400, 'El cargo seleccionado no es válido.');
  if (!canAssignCargo(callerRole, cargoRow.cargo)) {
    return fail(403, 'Solo un administrador puede asignar el cargo de administrador.');
  }

  const { data: tipoDoc, error: tipoDocError } = await admin
    .from('tipo_documento')
    .select('cod_tipodoc')
    .eq('cod_tipodoc', input.fk_tipo_doc)
    .maybeSingle();
  if (tipoDocError) return fail(500, 'No se pudo verificar el tipo de documento.');
  if (!tipoDoc) return fail(400, 'El tipo de documento no existe.');

  // 4. Duplicates. correo is unique across all tenants (auth.users), the
  //    `usuario` handle only within the tenant. The trigger would silently
  //    rename a colliding handle, so it must be rejected here. Two separate
  //    queries (not an `or` filter string) so input cannot alter the filter.
  const [correoHit, usuarioHit] = await Promise.all([
    admin.from('usuario').select('id_usuario').ilike('correo', escapeLikePattern(input.correo)).limit(1),
    admin
      .from('usuario')
      .select('id_usuario')
      .eq('tenant_id', tenantId)
      .ilike('usuario', escapeLikePattern(input.usuario))
      .limit(1),
  ]);
  if (correoHit.error || usuarioHit.error) {
    return fail(500, 'No se pudo verificar duplicados.');
  }
  if (correoHit.data.length > 0) return fail(409, 'Ya existe un usuario con ese correo.');
  if (usuarioHit.data.length > 0) {
    return fail(409, 'Ya existe un usuario con ese nombre de usuario.');
  }

  // 5. Create the Auth account. tenant_id and fk_cargo go in app_metadata,
  //    which only the server writes; the trigger trusts nothing from user_metadata
  //    for them.
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: input.correo,
    password: input.clave,
    email_confirm: true,
    app_metadata: { tenant_id: tenantId, fk_cargo: input.fk_cargo },
    user_metadata: {
      nombre: input.nombre,
      documento: input.documento,
      telefono: input.telefono,
      usuario: input.usuario,
      fk_tipo_doc: input.fk_tipo_doc,
    },
  });
  if (createError || !created?.user) {
    const mapped = mapAuthCreateError(createError ?? {});
    console.error('admin-create-user: createUser failed', createError?.code, createError?.status);
    return fail(mapped.status, mapped.message);
  }
  const authId = created.user.id;

  // 6. The profile is created by the trigger; confirm it landed in this tenant
  //    and roll the Auth account back otherwise.
  try {
    const { data: profile, error: profileError } = await admin
      .from('usuario')
      .select('id_usuario, tenant_id')
      .eq('auth_id', authId)
      .eq('tenant_id', tenantId)
      .maybeSingle();
    if (profileError || !profile || Number(profile.tenant_id) !== tenantId) {
      throw new Error('profile not created');
    }
  } catch {
    const { error: deleteError } = await admin.auth.admin.deleteUser(authId);
    if (deleteError) console.error('admin-create-user: rollback failed', deleteError.code);
    return fail(500, 'No se pudo crear el perfil del usuario.');
  }

  return json({ ok: true, id: authId }, 201);
}

Deno.serve(async (req) => {
  try {
    return await handle(req);
  } catch (err) {
    // Log the error type only: the request carries a password.
    console.error('admin-create-user: unhandled', err instanceof Error ? err.name : typeof err);
    return fail(500, 'Error interno del servidor.');
  }
});
