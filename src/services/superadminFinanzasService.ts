import { call } from './superadminService';

// Platform finance API (Edge Function `superadmin`, finanzas actions).
// Amounts are PYG integers. Transport and error handling live in superadminService.

export type MovimientoTipo = 'ingreso' | 'egreso';
export type MovimientoOrigen = 'manual' | 'suscripcion';

export interface DateRange {
  desde: string;
  hasta: string;
}

export interface FinanzasTotales {
  ingresos_suscripcion: number;
  ingresos_manuales: number;
  egresos: number;
  neto: number;
}

export interface SerieMensualItem {
  mes: string;
  ingresos: number;
  egresos: number;
}

export interface PorCategoriaItem {
  categoria: string;
  tipo: MovimientoTipo;
  total: number;
}

export interface PorTenantItem {
  tenant_id: number;
  nombre: string;
  total: number;
}

export interface FinanzasResumen {
  totales: FinanzasTotales;
  serie_mensual: SerieMensualItem[];
  por_categoria: PorCategoriaItem[];
  por_tenant: PorTenantItem[];
  mrr: number;
}

export interface MovimientoFilters extends DateRange {
  tipo?: MovimientoTipo | null;
  categoria_id?: string | null;
}

// One row of list_movimientos: manual rows carry id/categoria fields,
// subscription rows carry tenant/plan fields.
export interface Movimiento {
  origen: MovimientoOrigen;
  tipo: MovimientoTipo;
  fecha: string;
  monto: number;
  referencia: string | null;
  created_at: string;
  anulado: boolean;
  id?: string;
  categoria_id?: string;
  categoria_nombre?: string | null;
  descripcion?: string | null;
  created_by?: string | null;
  updated_at?: string | null;
  tenant_id?: number;
  tenant_nombre?: string | null;
  plan?: string;
  ciclo?: string;
}

export interface MovimientoInput {
  tipo: MovimientoTipo;
  categoria_id: string;
  monto: number;
  fecha: string;
  descripcion?: string | null;
  referencia?: string | null;
}

export type MovimientoChanges = Partial<MovimientoInput>;

export interface Categoria {
  id: string;
  nombre: string;
  tipo: MovimientoTipo;
  activo: boolean;
  created_at: string;
}

export interface CategoriaInput {
  id?: string | null;
  nombre: string;
  tipo: MovimientoTipo;
}

export function getFinanzasResumen(desde: string, hasta: string) {
  return call<FinanzasResumen>({ action: 'finanzas_resumen', desde, hasta });
}

export function listMovimientos(filters: MovimientoFilters) {
  return call<Movimiento[]>({ action: 'list_movimientos', ...filters });
}

export function createMovimiento(input: MovimientoInput) {
  return call<{ id: string }>({ action: 'create_movimiento', ...input });
}

export function updateMovimiento(id: string, changes: MovimientoChanges) {
  return call<{ id: string }>({ action: 'update_movimiento', id, ...changes });
}

export function anularMovimiento(id: string) {
  return call<{ id: string }>({ action: 'anular_movimiento', id });
}

export function listCategorias() {
  return call<Categoria[]>({ action: 'list_categorias' });
}

export function upsertCategoria(input: CategoriaInput) {
  return call<{ id: string }>({ action: 'upsert_categoria', ...input });
}

export function setCategoriaActiva(id: string, activo: boolean) {
  return call<{ id: string; activo: boolean }>({ action: 'set_categoria_activa', id, activo });
}
