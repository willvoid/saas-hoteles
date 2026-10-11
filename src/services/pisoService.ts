import { supabase } from './supabaseClient';

export const PisoService = {
  getPisos: async () => {
    const { data, error } = await supabase
      .from('pisos')
      .select(`
        id,
        created_at,
        numero,
        estado,
        fk_edificio,
        edificio:edificios!pisos_fk_edificio_fkey ( nombre )
      `)
      .order('id', { ascending: false });

    if (error) throw error;
    return data || [];
  },

  checkNumero: async (numero: number, fkEdificio: number, excludeId?: number) => {
    let query = supabase
      .from('pisos')
      .select('id')
      .eq('numero', numero)
      .eq('fk_edificio', fkEdificio);

    if (excludeId) {
      query = query.neq('id', excludeId);
    }

    const { data, error } = await query.limit(1);
    if (error) throw error;

    return data && data.length > 0;
  },

  createPiso: async (pisoData: any) => {
    const { data, error } = await supabase.from('pisos').insert([pisoData]).select();
    if (error) throw error;
    return data;
  },

  updatePiso: async (id: number, pisoData: any) => {
    const { data, error } = await supabase
      .from('pisos')
      .update(pisoData)
      .eq('id', id)
      .select();
    if (error) throw error;
    return data;
  },

  setEstado: async (id: number, estado: 'Activo' | 'Inactivo') => {
    const { data, error } = await supabase
      .from('pisos')
      .update({ estado })
      .eq('id', id)
      .select();
    if (error) throw error;
    return data;
  },

  getEdificios: async () => {
    const { data, error } = await supabase
      .from('edificios')
      .select('id, nombre, estado')
      .order('nombre', { ascending: true });

    if (error) throw error;
    return data || [];
  }
};
