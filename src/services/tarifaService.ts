import { supabase } from './supabaseClient';

export const TarifaService = {
  getTarifas: async () => {
    const { data, error } = await supabase
      .from('tarifas')
      .select(`
        *,
        tipo_habitacion ( nombre )
      `)
      .order('id', { ascending: false });
    
    if (error) throw error;
    return data || [];
  },

  checkTarifaNombre: async (nombre: string, excludeId?: number) => {
    let query = supabase
      .from('tarifas')
      .select('id')
      .ilike('nombre', nombre);
      
    if (excludeId) {
      query = query.neq('id', excludeId);
    }
    
    const { data, error } = await query.limit(1);
    if (error) throw error;
    
    return data && data.length > 0;
  },

  createTarifa: async (tarifaData: any) => {
    const { data, error } = await supabase.from('tarifas').insert([tarifaData]).select();
    if (error) throw error;
    return data;
  },

  updateTarifa: async (id: number, tarifaData: any) => {
    const { data, error } = await supabase
      .from('tarifas')
      .update(tarifaData)
      .eq('id', id)
      .select();
    if (error) throw error;
    return data;
  },

  deleteTarifa: async (id: number) => {
    const { data, error } = await supabase
      .from('tarifas')
      .delete()
      .eq('id', id);
    if (error) throw error;
    return data;
  }
};
