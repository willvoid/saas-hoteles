import { supabase } from './supabaseClient';
import type { PublicPlan } from '../utils/plans';

// numeric/bigint columns may arrive as strings through PostgREST.
const toNumber = (value: unknown): number => Number(value);
const toNullableNumber = (value: unknown): number | null =>
  value === null || value === undefined ? null : Number(value);

type PlanRow = Record<keyof PublicPlan, unknown>;

// Plans offered on the landing; callable without a session.
export async function getPublicPlans(): Promise<PublicPlan[]> {
  const { data, error } = await supabase.rpc('fn_planes_publicos');
  if (error) throw new Error('No se pudieron cargar los planes. Intentá de nuevo en unos minutos.');

  return ((data ?? []) as PlanRow[]).map((row) => ({
    codigo: String(row.codigo),
    nombre: String(row.nombre),
    precio_mensual: toNumber(row.precio_mensual),
    precio_anual: toNullableNumber(row.precio_anual),
    moneda: String(row.moneda),
    max_habitaciones: toNullableNumber(row.max_habitaciones),
    max_usuarios: toNullableNumber(row.max_usuarios),
    max_hoteles: toNullableNumber(row.max_hoteles),
    mod_contabilidad: Boolean(row.mod_contabilidad),
  }));
}
