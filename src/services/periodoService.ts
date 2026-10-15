import { supabase } from './supabaseClient';
import { errorDeBase } from './finanzasService';
import type { PeriodoCerrado } from '../types/finanzas';

// Month lock. Reads are open to admin/gerente; writes only go through the RPCs
// (admin only, enforced by the database).
export const periodoService = {
  async getPeriodosCerrados(): Promise<PeriodoCerrado[]> {
    const { data, error } = await supabase
      .from('periodos_cerrados')
      .select('*')
      .order('anio', { ascending: false })
      .order('mes', { ascending: false });
    if (error) throw errorDeBase(error);
    return (data ?? []) as PeriodoCerrado[];
  },

  async cerrarMes(anio: number, mes: number): Promise<void> {
    const { error } = await supabase.rpc('fn_cerrar_mes', { p_anio: anio, p_mes: mes });
    if (error) throw errorDeBase(error);
  },

  async reabrirMes(anio: number, mes: number): Promise<void> {
    const { error } = await supabase.rpc('fn_reabrir_mes', { p_anio: anio, p_mes: mes });
    if (error) throw errorDeBase(error);
  },
};
