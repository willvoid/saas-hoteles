import { supabase } from './supabaseClient';

export const EmpresaService = {
  getEmpresas: async () => {
    const { data, error } = await supabase
      .from('datos_empresa')
      .select(`
        id_empresa,
        created_at,
        razon_social,
        nombre_fantasia,
        ruc,
        estado,
        fk_contribuyente,
        fk_regimen,
        tipo_contribuyente:fk_contribuyente ( descripcion ),
        tipo_regimen:fk_regimen ( descripcion )
      `)
      .order('id_empresa', { ascending: false });

    if (error) throw error;
    return data || [];
  },

  checkRuc: async (ruc: string, excludeId?: number) => {
    let query = supabase
      .from('datos_empresa')
      .select('id_empresa')
      .ilike('ruc', ruc);

    if (excludeId) {
      query = query.neq('id_empresa', excludeId);
    }

    const { data, error } = await query.limit(1);
    if (error) throw error;

    return data && data.length > 0;
  },

  createEmpresa: async (empresaData: any) => {
    const { data, error } = await supabase.from('datos_empresa').insert([empresaData]).select();
    if (error) throw error;
    return data;
  },

  updateEmpresa: async (id: number, empresaData: any) => {
    const { data, error } = await supabase
      .from('datos_empresa')
      .update(empresaData)
      .eq('id_empresa', id)
      .select();
    if (error) throw error;
    return data;
  },

  setEstado: async (id: number, estado: 'Activo' | 'Inactivo') => {
    const { data, error } = await supabase
      .from('datos_empresa')
      .update({ estado })
      .eq('id_empresa', id)
      .select();
    if (error) throw error;
    return data;
  },

  getTiposContribuyente: async () => {
    const { data, error } = await supabase
      .from('tipo_contribuyente')
      .select('id_tipo_contribuyente, descripcion')
      .order('descripcion', { ascending: true });

    if (error) throw error;
    return data || [];
  },

  getTiposRegimen: async () => {
    const { data, error } = await supabase
      .from('tipo_regimen')
      .select('id_regimen, descripcion')
      .order('descripcion', { ascending: true });

    if (error) throw error;
    return data || [];
  }
};
