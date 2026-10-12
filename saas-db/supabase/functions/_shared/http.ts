// HTTP plumbing shared by the multi-hotel Edge Functions (Deno runtime only).

import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';

export const corsHeaders = {
  // Auth is a bearer token, not a cookie, so a wildcard origin does not widen
  // access. ALLOWED_ORIGIN can pin it to the production site.
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

export function fail(status: number, error: string): Response {
  return json({ error }, status);
}

const clientOptions = { auth: { autoRefreshToken: false, persistSession: false } };

export interface AuthenticatedCall {
  jwt: string;
  userId: string;
  // Carries the caller's JWT: RPCs and RLS evaluate as the caller.
  callerClient: SupabaseClient;
  // service_role: bypasses RLS. Use only after the caller has been authorized.
  admin: SupabaseClient;
}

// Handles preflight, method and bearer authentication. Returns the Response to
// send back, or the authenticated call context.
export async function authenticate(req: Request): Promise<Response | AuthenticatedCall> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return fail(405, 'Método no permitido.');

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    console.error('missing runtime secrets');
    return fail(500, 'Configuración del servidor incompleta.');
  }

  const jwt = /^Bearer\s+(.+)$/i.exec(req.headers.get('Authorization') ?? '')?.[1];
  if (!jwt) return fail(401, 'No autorizado.');

  const callerClient = createClient(supabaseUrl, anonKey, {
    ...clientOptions,
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
  const { data, error } = await callerClient.auth.getUser(jwt);
  if (error || !data?.user) return fail(401, 'Sesión inválida.');

  return {
    jwt,
    userId: data.user.id,
    callerClient,
    admin: createClient(supabaseUrl, serviceRoleKey, clientOptions),
  };
}
