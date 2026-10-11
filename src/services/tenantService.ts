import { supabase } from './supabaseClient';

export interface TenantInfo {
  id: number;
  nombre: string;
  slug: string;
  estado: string;
}

export const TENANT_SUSPENDIDO = 'suspendido';

// Lee el claim del JWT (`app_metadata.tenant_id`), que solo escribe el servidor.
export async function getCurrentTenantId(): Promise<number | null> {
  const { data } = await supabase.auth.getSession();
  const raw = data.session?.user.app_metadata?.tenant_id;
  if (raw === undefined || raw === null || raw === '') return null;
  const id = Number(raw);
  return Number.isFinite(id) ? id : null;
}

// Un usuario solo puede leer la fila de su propio tenant, incluso suspendido.
export async function loadTenant(): Promise<TenantInfo | null> {
  const { data, error } = await supabase
    .from('tenants')
    .select('id, nombre, slug, estado')
    .maybeSingle();

  if (error) throw error;
  return (data as TenantInfo | null) ?? null;
}
