import { supabase } from './supabaseClient';

export const ConceptoService = {
  getConceptos: async () => {
    const { data, error } = await supabase
      .from('conceptos')
      .select(`
        id_concepto,
        created_at,
        nombre,
        descripcion,
        arancel,
        estado,
        fk_iva,
        fk_unidad_medida,
        iva:fk_iva ( descripcion, valor ),
        unidad:fk_unidad_medida ( descripcion, representacion )
      `)
      .order('nombre', { ascending: true });

    if (error) throw error;
    return data || [];
  },

  checkNombre: async (nombre: string, excludeId?: number) => {
    let query = supabase
      .from('conceptos')
      .select('id_concepto')
      .ilike('nombre', nombre);

    if (excludeId) {
      query = query.neq('id_concepto', excludeId);
    }

    const { data, error } = await query.limit(1);
    if (error) throw error;

    return data && data.length > 0;
  },

  createConcepto: async (conceptoData: any) => {
    const { data, error } = await supabase.from('conceptos').insert([conceptoData]).select();
    if (error) throw error;
    return data;
  },

  updateConcepto: async (id: number, conceptoData: any) => {
    const { data, error } = await supabase
      .from('conceptos')
      .update(conceptoData)
      .eq('id_concepto', id)
      .select();
    if (error) throw error;
    return data;
  },

  setEstado: async (id: number, estado: 'ACTIVO' | 'INACTIVO') => {
    const { data, error } = await supabase
      .from('conceptos')
      .update({ estado })
      .eq('id_concepto', id)
      .select();
    if (error) throw error;
    return data;
  },

  getIvas: async () => {
    const { data, error } = await supabase
      .from('iva')
      .select('id_iva, descripcion, valor')
      .order('valor', { ascending: true });

    if (error) throw error;
    return data || [];
  },

  getUnidadesMedida: async () => {
    const { data, error } = await supabase
      .from('unidades_medida')
      .select('id_unidades, descripcion, representacion')
      .order('descripcion', { ascending: true });

    if (error) throw error;
    return data || [];
  }
};
