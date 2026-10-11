import { supabase } from './supabaseClient';

export const CargoService = {
  getCargos: async () => {
    const { data, error } = await supabase
      .from('cargo')
      .select('*')
      .order('id_cargo', { ascending: false });

    if (error) throw error;
    return data || [];
  }
};
