import { supabase } from './supabaseClient';

export const EstablecimientoService = {
  getEstablecimientos: async () => {
    const { data, error } = await supabase
      .from('establecimientos')
      .select(`
        id_establecimiento,
        created_at,
        codigo_establecimiento,
        denominacion,
        direccion,
        numero_casa,
        complemento_direccion_1,
        complemento_direccion_2,
        telefono,
        email,
        estado_establecimiento,
        fk_barrio,
        fk_empresa,
        empresa:datos_empresa!establecimientos_fk_empresa_fkey ( razon_social, nombre_fantasia ),
        barrio:fk_barrio ( nombre_barrio )
      `)
      .order('id_establecimiento', { ascending: false });

    if (error) throw error;
    return data || [];
  },

  checkCodigo: async (codigo: string, excludeId?: number) => {
    let query = supabase
      .from('establecimientos')
      .select('id_establecimiento')
      .ilike('codigo_establecimiento', codigo);

    if (excludeId) {
      query = query.neq('id_establecimiento', excludeId);
    }

    const { data, error } = await query.limit(1);
    if (error) throw error;

    return data && data.length > 0;
  },

  createEstablecimiento: async (establecimientoData: any) => {
    const { data, error } = await supabase.from('establecimientos').insert([establecimientoData]).select();
    if (error) throw error;
    return data;
  },

  updateEstablecimiento: async (id: number, establecimientoData: any) => {
    const { data, error } = await supabase
      .from('establecimientos')
      .update(establecimientoData)
      .eq('id_establecimiento', id)
      .select();
    if (error) throw error;
    return data;
  },

  setEstado: async (id: number, estado: 'Activo' | 'Inactivo') => {
    const { data, error } = await supabase
      .from('establecimientos')
      .update({ estado_establecimiento: estado })
      .eq('id_establecimiento', id)
      .select();
    if (error) throw error;
    return data;
  },

  getEmpresas: async () => {
    const { data, error } = await supabase
      .from('datos_empresa')
      .select('id_empresa, razon_social, nombre_fantasia, estado')
      .order('razon_social', { ascending: true });

    if (error) throw error;
    return data || [];
  },

  getBarrios: async () => {
    const { data, error } = await supabase
      .from('barrios')
      .select('cod_barrio, nombre_barrio')
      .order('nombre_barrio', { ascending: true });

    if (error) throw error;
    return data || [];
  }
};
