import { supabase } from './supabaseClient';

export interface LocationItem {
  id: number;
  name: string;
}

export const ClientService = {
  // Fetch Catalogs
  getTipoDocumento: async () => {
    const { data, error } = await supabase.from('tipo_documento').select('cod_tipodoc, descripcion_tipodoc');
    if (error) throw error;
    return data || [];
  },

  getTipoContribuyente: async () => {
    const { data, error } = await supabase.from('tipo_contribuyente').select('id_tipo_contribuyente, descripcion');
    if (error) throw error;
    return data || [];
  },

  getTipoOperacion: async () => {
    const { data, error } = await supabase.from('tipo_operacion').select('id_tipo_operacion, codigo_tipo_op');
    if (error) throw error;
    return data || [];
  },

  // Ubicación anidada (Cascada)
  getPaises: async () => {
    const { data, error } = await supabase.from('paises').select('id_pais, pais');
    if (error) throw error;
    return data || [];
  },

  getDepartamentos: async (fk_pais: number) => {
    if (!fk_pais) return [];
    const { data, error } = await supabase.from('departamentos').select('cod_depto, nombre_depto').eq('fk_pais', fk_pais);
    if (error) throw error;
    return data || [];
  },

  getDistritos: async (fk_depto: number) => {
    if (!fk_depto) return [];
    const { data, error } = await supabase.from('distritos').select('cod_distrito, nombre_distrito').eq('fk_depto', fk_depto);
    if (error) throw error;
    return data || [];
  },

  getCiudades: async (fk_distrito: number) => {
    if (!fk_distrito) return [];
    const { data, error } = await supabase.from('ciudades').select('cod_ciudades, nombre_ciudad').eq('fk_distrito', fk_distrito);
    if (error) throw error;
    return data || [];
  },

  getBarrios: async (fk_ciudad: number) => {
    if (!fk_ciudad) return [];
    const { data, error } = await supabase.from('barrios').select('cod_barrio, nombre_barrio').eq('fk_ciudad', fk_ciudad);
    if (error) throw error;
    return data || [];
  },

  // CRUD
  getClients: async () => {
    const { data, error } = await supabase
      .from('clientes')
      .select('*, tipo_documento(descripcion_tipodoc), reservas(id_reserva)')
      .order('id_cliente', { ascending: false });
    if (error) {
      console.warn('Error fetching clients with reservas, attempting fallback:', error);
      const fallback = await supabase
        .from('clientes')
        .select('*, tipo_documento(descripcion_tipodoc)')
        .order('id_cliente', { ascending: false });
      if (fallback.error) throw fallback.error;
      return fallback.data || [];
    }
    return data || [];
  },

  createClient: async (clientData: any) => {
    const { data, error } = await supabase.from('clientes').insert([clientData]).select();
    if (error) throw error;
    return data;
  },

  updateClient: async (id_cliente: number, clientData: any) => {
    const { data, error } = await supabase
      .from('clientes')
      .update(clientData)
      .eq('id_cliente', id_cliente)
      .select();
    if (error) throw error;
    return data;
  },

  checkExistingDocument: async (documento: string) => {
    const { data, error } = await supabase
      .from('clientes')
      .select('id_cliente')
      .eq('documento', documento)
      .limit(1);
    if (error) throw error;
    return data && data.length > 0 ? data[0] : null;
  }
};
