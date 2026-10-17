import { supabase } from './supabaseClient';
import { readFunctionError } from '../utils/functionError';

// Single boundary for the platform super-admin API (Edge Function `superadmin`).
// Components and hooks must go through here; tenant RLS is never involved.

export type TenantEstado = 'trial' | 'activo' | 'suspendido';
export type PlanCiclo = 'mensual' | 'anual';

// One row of fn_admin_tenants_resumen.
export interface TenantSummary {
  id: number;
  nombre: string;
  slug: string;
  estado: TenantEstado;
  plan: string;
  trial_fin: string | null;
  vigente_hasta: string | null;
  suscripcion_vigente: boolean;
  created_at: string;
  usuarios: number;
  establecimientos: number;
  habitaciones: number;
}

export interface TenantRow {
  id: number;
  nombre: string;
  slug: string;
  estado: TenantEstado;
  plan: string;
  ciclo_facturacion: string | null;
  trial_fin: string | null;
  vigente_hasta: string | null;
  created_at: string;
  fk_usuario_web: number | null;
}

export interface TenantUsuario {
  id: number;
  nombre: string;
  correo: string | null;
  estado: boolean | string | null;
  cargo: string | null;
}

export interface TenantEstablecimiento {
  id_establecimiento: number;
  codigo_establecimiento: string | null;
  denominacion: string | null;
  direccion: string | null;
  estado_establecimiento: boolean | string | null;
}

export interface TenantDetail {
  tenant: TenantRow;
  usuarios: TenantUsuario[];
  establecimientos: TenantEstablecimiento[];
}

export interface SetPlanInput {
  plan: string;
  ciclo: PlanCiclo;
  monto?: number | null;
  referencia?: string | null;
}

export interface SetPlanResult {
  tenant_id: number;
  plan: string;
  ciclo: PlanCiclo;
  vigente_hasta: string | null;
}

export interface CreateTenantInput {
  email: string;
  password: string;
  hotel: { nombre: string; slug: string };
  admin: { nombre: string; documento: string; fk_tipo_doc: number; telefono: string | null };
  empresa: {
    ruc: string;
    razon_social: string;
    nombre_fantasia: string | null;
    fk_contribuyente: number;
    fk_regimen: number;
  };
  establecimiento: {
    direccion: string;
    fk_barrio: number;
    denominacion: string | null;
    numero_casa: string | null;
    complemento_direccion_1: string | null;
    complemento_direccion_2: string | null;
    telefono: string | null;
    email: string | null;
  };
}

export interface CreateTenantResult {
  tenant_id: number | null;
  auth_id: string;
}

const GENERIC_ERROR = 'No se pudo completar la operación. Intentá de nuevo.';

// invoke() drops the body on non-2xx, so the message is recovered from the
// error context; a 2xx can still carry `{ error }`.
async function call<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('superadmin', { body });
  if (error) throw new Error(await readFunctionError(error));
  const payload = data as { data?: T; error?: unknown } | null;
  if (payload && typeof payload.error === 'string' && payload.error) throw new Error(payload.error);
  if (!payload || payload.data === undefined) throw new Error(GENERIC_ERROR);
  return payload.data;
}

export function whoami() {
  return call<{ isPlatformAdmin: boolean }>({ action: 'whoami' });
}

export function listTenants() {
  return call<TenantSummary[]>({ action: 'list_tenants' });
}

export function getTenant(tenantId: number) {
  return call<TenantDetail>({ action: 'get_tenant', tenant_id: tenantId });
}

export function setTenantEstado(tenantId: number, estado: TenantEstado) {
  return call<{ tenant_id: number; estado: TenantEstado }>({
    action: 'set_estado',
    tenant_id: tenantId,
    estado,
  });
}

export function setTenantPlan(tenantId: number, input: SetPlanInput) {
  return call<SetPlanResult>({ action: 'set_plan', tenant_id: tenantId, ...input });
}

export function createTenant(input: CreateTenantInput) {
  return call<CreateTenantResult>({ action: 'create_tenant', ...input });
}
