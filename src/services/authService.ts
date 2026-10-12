import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';
import type { Tables } from '../types/supabase';
import { getCurrentTenantId, loadTenant, TENANT_SUSPENDIDO } from './tenantService';
import type { TenantInfo } from './tenantService';
import { readFunctionError } from '../utils/functionError';

// Single boundary for all Supabase Auth interaction. Components and hooks must
// go through this service instead of importing the supabase client directly.

export interface SignUpMetadata {
  nombre: string;
  documento: string;
  telefono: string | null;
  usuario: string;
  fk_tipo_doc: number;
  fk_cargo: number;
}

// The authenticated user as the app consumes it: the `usuario` profile with
// the joined cargo name flattened to a string and the tenant (hotel) it belongs to.
export type SessionUser = Tables<'usuario'> & { cargo: string; tenant: TenantInfo };

// RLS hides the profile of a suspended tenant, so it is told apart from a missing one via the tenant row.
export type SessionResult =
  | { status: 'ok'; user: SessionUser }
  | { status: 'suspended'; tenant: TenantInfo }
  | { status: 'missing' };

// Loads the `usuario` profile linked to a Supabase Auth user, flattens the
// joined cargo name and attaches the tenant. Returns null when RLS hides the
// profile (suspended tenant, inactive user) or the tenant row is unreadable.
//
// El CARGO no se toma del embed sino de `current_user_role()`, el mismo RPC
// (SECURITY DEFINER) contra el que evalúan las policies de RLS. Motivo: desde
// la migración 20260731000000 la tabla `cargo` sólo es legible por
// admin/gerente, así que para un limpiador o un recepcionista el embed vuelve
// **null sin error** y el rol caía en el fallback permisivo de normalizeRole
// ('unknown' ≈ recepcionista) — un limpiador terminaba viendo todos los
// módulos y con el botón de bloquear habitaciones habilitado.
//
// Usar el RPC además garantiza que el rol del front y el que aplica la base
// no puedan divergir nunca: salen de la misma función.
export async function loadProfile(authId: string): Promise<SessionUser | null> {
  // One account can have a profile per hotel: the active one is the JWT claim.
  const tenantId = await getCurrentTenantId();
  if (tenantId === null) return null;

  const { data, error } = await supabase
    .from('usuario')
    .select('*, cargo:fk_cargo ( cargo )')
    .eq('auth_id', authId)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const { cargo, ...profile } = data;

  // El embed queda como respaldo por si el RPC no estuviera disponible en el
  // entorno (para admin/gerente sí devuelve el cargo).
  const [{ data: rolRpc, error: rolError }, tenant] = await Promise.all([
    supabase.rpc('current_user_role'),
    loadTenant(),
  ]);
  if (rolError) {
    console.warn('No se pudo resolver el cargo con current_user_role():', rolError.message);
  }
  if (!tenant) return null;

  return { ...profile, cargo: rolRpc || cargo?.cargo || '', tenant } as SessionUser;
}

export async function resolveSession(authId: string): Promise<SessionResult> {
  const user = await loadProfile(authId);
  if (user) {
    return user.tenant.estado === TENANT_SUSPENDIDO
      ? { status: 'suspended', tenant: user.tenant }
      : { status: 'ok', user };
  }

  const tenant = await loadTenant();
  if (tenant?.estado === TENANT_SUSPENDIDO) return { status: 'suspended', tenant };
  return { status: 'missing' };
}

export function signInWithPassword(email: string, password: string) {
  return supabase.auth.signInWithPassword({ email, password });
}

export function signOut() {
  return supabase.auth.signOut();
}

export function resendSignupConfirmation(email: string) {
  return supabase.auth.resend({ type: 'signup', email });
}

// Sends the "forgot password" recovery email. The link lands on `redirectTo`,
// where the temporary recovery session lets the user set a new password.
export function sendPasswordReset(email: string, redirectTo: string) {
  return supabase.auth.resetPasswordForEmail(email, { redirectTo });
}

// Updates the password of the currently authenticated (or recovery) session.
export function updatePassword(password: string) {
  return supabase.auth.updateUser({ password });
}

export async function getCurrentUser() {
  const { data } = await supabase.auth.getUser();
  return data.user;
}

export async function getCurrentSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export function onAuthStateChange(callback: (event: AuthChangeEvent, session: Session | null) => void) {
  return supabase.auth.onAuthStateChange(callback);
}

// Admin-only staff creation. Delegates to the admin-create-user Edge Function,
// which uses the service_role key (never exposed to the browser).
//
// invoke() discards the response body on a non-2xx, so the function's Spanish
// message is read from the error context and put back in `data.error`, which is
// where the caller (UsuarioForm) already looks for it.
export async function adminCreateUser(payload: SignUpMetadata & { correo: string; clave: string }) {
  const { data, error } = await supabase.functions.invoke('admin-create-user', { body: payload });
  if (error) return { data: { error: await readFunctionError(error) }, error };
  return { data, error };
}
