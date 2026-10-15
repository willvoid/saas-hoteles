import { supabase } from './supabaseClient';

export interface TenantInfo {
  id: number;
  nombre: string;
  slug: string;
  estado: string;
  /** Plan modules; both false when the plan could not be read. */
  modulos: TenantModulos;
}

export interface TenantModulos {
  contabilidad: boolean;
  sifen: boolean;
}

const SIN_MODULOS: TenantModulos = { contabilidad: false, sifen: false };

export const TENANT_SUSPENDIDO = 'suspendido';

// Lee el claim del JWT (`app_metadata.tenant_id`), que solo escribe el servidor.
export async function getCurrentTenantId(): Promise<number | null> {
  const { data } = await supabase.auth.getSession();
  const raw = data.session?.user.app_metadata?.tenant_id;
  if (raw === undefined || raw === null || raw === '') return null;
  const id = Number(raw);
  return Number.isFinite(id) ? id : null;
}

// Modules included in the tenant's plan (`planes` is readable by any
// authenticated user). A failed read degrades to "no modules" so the rest of
// the app keeps working exactly as before.
async function loadModulos(plan: string | null | undefined): Promise<TenantModulos> {
  if (!plan) return SIN_MODULOS;
  const { data, error } = await supabase
    .from('planes')
    .select('mod_contabilidad, mod_sifen')
    .eq('codigo', plan)
    .maybeSingle();
  if (error || !data) return SIN_MODULOS;
  return { contabilidad: data.mod_contabilidad === true, sifen: data.mod_sifen === true };
}

// Un usuario solo puede leer la fila de su propio tenant, incluso suspendido.
export async function loadTenant(): Promise<TenantInfo | null> {
  const { data, error } = await supabase
    .from('tenants')
    .select('id, nombre, slug, estado, plan')
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const { plan, ...tenant } = data;
  return { ...tenant, modulos: await loadModulos(plan) };
}
