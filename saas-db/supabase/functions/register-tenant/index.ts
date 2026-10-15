// Public sign-up: creates the Auth user and their first hotel (30-day trial) in
// one call. Native Supabase signup stays disabled; this is the only door.
//
// Flow: validate body -> Cloudflare Turnstile -> rate limit (per IP and per
// email, fail closed) -> RUC pre-check -> createUser (unconfirmed) -> send the
// confirmation email -> fn_provision_tenant. If provisioning fails the Auth user
// is deleted (compensating rollback).
//
// No account enumeration: an email that already exists gets the same 201
// `{ ok: true }` as a new one, and nothing is provisioned.
//
// Confirmation email: admin.createUser({ email_confirm: false }) sends nothing,
// and admin.generateLink only returns a link. auth.resend({ type: 'signup' }) on
// an anon client is what actually sends the confirmation email for a password
// user (the same call the login page uses to resend it).
//
// This function is PUBLIC (no user JWT). Deploy (from saas-db/):
//   supabase functions deploy register-tenant --use-api --no-verify-jwt
// Secrets: supabase secrets set TURNSTILE_SECRET=<Cloudflare Turnstile secret key>
// (never commit it). Optional: ALLOWED_ORIGIN pins CORS to the production site.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders, fail, json } from '../_shared/http.ts';
import { buildProvisionPayload, mapProvisionError } from '../_shared/hotelInput.ts';
import { validateRegisterInput } from './validation.ts';

const TURNSTILE_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const WINDOW = '1 hour';
const MAX_PER_IP = 5;
const MAX_PER_EMAIL = 3;

const clientOptions = { auth: { autoRefreshToken: false, persistSession: false } };

// First hop of x-forwarded-for (or cf-connecting-ip) is the client address.
function clientIp(req: Request): string | null {
  const cf = req.headers.get('cf-connecting-ip')?.trim();
  if (cf) return cf;
  const forwarded = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || null;
}

// Fails closed: any network error or unsuccessful verdict rejects the request.
async function verifyTurnstile(secret: string, token: string, ip: string | null): Promise<boolean> {
  const form = new URLSearchParams({ secret, response: token });
  if (ip) form.set('remoteip', ip);
  try {
    const res = await fetch(TURNSTILE_URL, { method: 'POST', body: form });
    if (!res.ok) return false;
    const verdict = await res.json();
    return verdict?.success === true;
  } catch {
    return false;
  }
}

async function handle(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return fail(405, 'Método no permitido.');

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const turnstileSecret = Deno.env.get('TURNSTILE_SECRET');
  if (!supabaseUrl || !anonKey || !serviceRoleKey || !turnstileSecret) {
    console.error('register-tenant: missing runtime secrets');
    return fail(500, 'Configuración del servidor incompleta.');
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail(400, 'Cuerpo inválido.');
  }
  const parsed = validateRegisterInput(body);
  if (!parsed.ok) return fail(400, parsed.error);
  const { email, password, turnstileToken, hotel } = parsed.value;

  const ip = clientIp(req);
  if (!(await verifyTurnstile(turnstileSecret, turnstileToken, ip))) {
    return fail(400, 'No se pudo completar la verificación de seguridad. Intentá de nuevo.');
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, clientOptions);

  // Rate limit per IP and per email. An RPC error fails closed.
  const keys: Array<[string, number]> = [[`email:${email}`, MAX_PER_EMAIL]];
  if (ip) keys.unshift([`ip:${ip}`, MAX_PER_IP]);
  for (const [key, max] of keys) {
    const { data, error } = await admin.rpc('fn_registro_rate_limit', {
      p_key: key,
      p_max: max,
      p_window: WINDOW,
    });
    if (error) {
      console.error('register-tenant: rate limit failed', error.code);
      return fail(503, 'No pudimos procesar tu registro. Intentá más tarde.');
    }
    if (data !== true) {
      return fail(429, 'Demasiados intentos. Probá de nuevo más tarde.');
    }
  }

  // The RUC is unique across all hotels; the unique index still covers a race.
  const rucHit = await admin
    .from('datos_empresa')
    .select('id_empresa')
    .eq('ruc', hotel.empresa.ruc)
    .limit(1);
  if (rucHit.error) {
    console.error('register-tenant: ruc lookup failed', rucHit.error.code);
    return fail(500, 'No se pudo verificar el RUC.');
  }
  if ((rucHit.data ?? []).length > 0) {
    return fail(409, 'Ya existe un hotel registrado con ese RUC.');
  }

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: false,
  });
  if (createError || !created?.user) {
    if (createError?.code === 'email_exists') {
      // Same response as success: do not reveal that the account exists.
      console.error('register-tenant: email already registered');
      return json({ ok: true }, 201);
    }
    console.error('register-tenant: createUser failed', createError?.code, createError?.status);
    return fail(500, 'No se pudo crear la cuenta.');
  }
  const userId = created.user.id;

  const { error: provisionError } = await admin.rpc('fn_provision_tenant', {
    p_payload: buildProvisionPayload(hotel, userId),
  });
  if (provisionError) {
    console.error('register-tenant: provisioning failed', provisionError.code);
    const { error: rollbackError } = await admin.auth.admin.deleteUser(userId);
    if (rollbackError) {
      console.error('register-tenant: rollback failed', rollbackError.code, rollbackError.status);
    }
    const mapped = mapProvisionError(provisionError);
    return fail(mapped.status, mapped.message);
  }

  // Send the confirmation email. The account is already provisioned, so a send
  // failure is logged but not fatal: the login page can resend it.
  const mailer = createClient(supabaseUrl, anonKey, clientOptions);
  const { error: mailError } = await mailer.auth.resend({ type: 'signup', email });
  if (mailError) {
    console.error('register-tenant: confirmation email failed', mailError.code, mailError.status);
  }

  return json({ ok: true }, 201);
}

Deno.serve(async (req) => {
  try {
    return await handle(req);
  } catch (err) {
    // Log the error type only: the request carries personal data.
    console.error('register-tenant: unhandled', err instanceof Error ? err.name : typeof err);
    return fail(500, 'Error interno del servidor.');
  }
});
