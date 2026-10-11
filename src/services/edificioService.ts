import { supabase } from './supabaseClient';

export const EdificioService = {
  getEdificios: async () => {
    const { data, error } = await supabase
      .from('edificios')
      .select(`
        id,
        created_at,
        nombre,
        estado,
        fk_sucursal,
        establecimiento:establecimientos!edificios_fk_sucursal_fkey ( denominacion ),
        pisos ( id, numero, estado )
      `)
      .order('id', { ascending: false });

    if (error) throw error;
    return data || [];
  },

  checkNombre: async (nombre: string, fkSucursal: number, excludeId?: number) => {
    let query = supabase
      .from('edificios')
      .select('id')
      .ilike('nombre', nombre)
      .eq('fk_sucursal', fkSucursal);

    if (excludeId) {
      query = query.neq('id', excludeId);
    }

    const { data, error } = await query.limit(1);
    if (error) throw error;

    return data && data.length > 0;
  },

  createEdificio: async (edificioData: any) => {
    const { data, error } = await supabase.from('edificios').insert([edificioData]).select();
    if (error) throw error;
    return data;
  },

  updateEdificio: async (id: number, edificioData: any) => {
    const { data, error } = await supabase
      .from('edificios')
      .update(edificioData)
      .eq('id', id)
      .select();
    if (error) throw error;
    return data;
  },

  setEstado: async (id: number, estado: 'Activo' | 'Inactivo') => {
    const { data, error } = await supabase
      .from('edificios')
      .update({ estado })
      .eq('id', id)
      .select();
    if (error) throw error;
    return data;
  },

  getSucursales: async () => {
    const { data, error } = await supabase
      .from('establecimientos')
      .select('id_establecimiento, denominacion')
      .order('denominacion', { ascending: true });

    if (error) throw error;
    return data || [];
  }
};
