import { supabase } from './supabaseClient';
import { getCurrentTenantId } from './tenantService';
import { IMAGEN_EXTENSIONES, validarImagen } from '../utils/imagenes';

interface HabitacionRow {
  id: number;
  numero_habitacion: number;
  descripcion: string | null;
  fk_piso: number;
  fk_tipo_habitacion: number;
  tipo_habitacion?: { nombre?: string; capacidad?: number } | null;
  pisos?: { numero?: number } | null;
  imagenes_habitacion?: { id: number; ruta_storage: string; es_principal: boolean }[];
}

// Las imágenes de habitaciones y las de tipos de habitación viven en buckets y tablas
// distintas, pero el flujo es el mismo: subir al Storage, guardar la URL pública, y
// marcar una sola como principal.
const imagenesDe = (config: { bucket: string; table: string; fkColumn: string }) => ({
  upload: async (file: File, ownerId: number) => {
    const errorImagen = validarImagen(file);
    if (errorImagen) throw new Error(errorImagen);

    const tenantId = await getCurrentTenantId();
    if (tenantId === null) throw new Error('No se pudo determinar el hotel de la sesión.');

    // El primer segmento es el tenant: las policies de Storage lo exigen.
    const filePath = `${tenantId}/${ownerId}/${crypto.randomUUID()}.${IMAGEN_EXTENSIONES[file.type]}`;

    const { error: uploadError } = await supabase.storage
      .from(config.bucket)
      .upload(filePath, file, { contentType: file.type });
    if (uploadError) throw uploadError;

    const { data: { publicUrl } } = supabase.storage
      .from(config.bucket)
      .getPublicUrl(filePath);

    const { data, error } = await supabase
      .from(config.table)
      .insert([{ [config.fkColumn]: ownerId, ruta_storage: publicUrl, es_principal: false }])
      .select();
    if (error) throw error;
    return data;
  },

  setPrincipal: async (imageId: number, ownerId: number) => {
    await supabase
      .from(config.table)
      .update({ es_principal: false })
      .eq(config.fkColumn, ownerId);

    const { data, error } = await supabase
      .from(config.table)
      .update({ es_principal: true })
      .eq('id', imageId)
      .select();
    if (error) throw error;
    return data;
  },

  remove: async (imageId: number, imageUrl: string) => {
    // La ruta dentro del bucket es todo lo que sigue a "/object/public/{bucket}/".
    // Partir por el nombre del bucket a secas no sirve: las imágenes de habitaciones
    // se guardaron bajo una carpeta homónima y la URL lo repite dos veces.
    const marker = `/object/public/${config.bucket}/`;
    const markerIndex = imageUrl.indexOf(marker);
    if (markerIndex !== -1) {
      const path = imageUrl.slice(markerIndex + marker.length);
      await supabase.storage.from(config.bucket).remove([path]);
    }

    const { error } = await supabase.from(config.table).delete().eq('id', imageId);
    if (error) throw error;
    return true;
  }
});

const imagenesHabitacion = imagenesDe({
  bucket: 'habitaciones',
  table: 'imagenes_habitacion',
  fkColumn: 'fk_habitacion'
});

const imagenesTipoHabitacion = imagenesDe({
  bucket: 'tipo_habitaciones',
  table: 'imagenes_tipo_habitacion',
  fkColumn: 'fk_tipo_habitacion'
});

export const HabitacionService = {
  // Fetch Catalogs
  getTiposHabitacion: async () => {
    const { data, error } = await supabase
      .from('tipo_habitacion')
      .select(`
        id, nombre, capacidad, descripcion,
        imagenes_tipo_habitacion ( id, ruta_storage, es_principal )
      `);
    if (error) throw error;
    return data || [];
  },

  getPisos: async () => {
    const { data, error } = await supabase.from('pisos').select('id, numero, estado');
    if (error) throw error;
    return data || [];
  },

  // CRUD for Tipos de Habitacion
  createTipoHabitacion: async (tipoData: any) => {
    const { data, error } = await supabase.from('tipo_habitacion').insert([tipoData]).select();
    if (error) throw error;
    return data;
  },

  updateTipoHabitacion: async (id: number, tipoData: any) => {
    const { data, error } = await supabase
      .from('tipo_habitacion')
      .update(tipoData)
      .eq('id', id)
      .select();
    if (error) throw error;
    return data;
  },

  deleteTipoHabitacion: async (id: number) => {
    const { data, error } = await supabase
      .from('tipo_habitacion')
      .delete()
      .eq('id', id);
    if (error) throw error;
    return data;
  },

  checkTipoHabitacionNombre: async (nombre: string, excludeId?: number) => {
    let query = supabase
      .from('tipo_habitacion')
      .select('id')
      .ilike('nombre', nombre); // Case insensitive check
      
    if (excludeId) {
      query = query.neq('id', excludeId);
    }
    
    const { data, error } = await query.limit(1);
    if (error) throw error;
    
    return data && data.length > 0;
  },

  // CRUD for Habitaciones
  getHabitaciones: async (): Promise<HabitacionRow[]> => {
    const { data, error } = await supabase
      .from('habitaciones')
      .select(`
        *,
        tipo_habitacion ( nombre, capacidad ),
        pisos ( numero ),
        imagenes_habitacion ( id, ruta_storage, es_principal )
      `)
      .order('numero_habitacion', { ascending: true });
    
    if (error) {
      console.error("Error fetching habitaciones:", error);
      const fallback = await supabase.from('habitaciones').select('*').order('numero_habitacion', { ascending: true });
      if (fallback.error) throw fallback.error;
      return fallback.data || [];
    }
    return data || [];
  },

  checkHabitacionNumber: async (numero_habitacion: number, excludeId?: number) => {
    let query = supabase
      .from('habitaciones')
      .select('id')
      .eq('numero_habitacion', numero_habitacion);
      
    if (excludeId) {
      query = query.neq('id', excludeId);
    }
    
    const { data, error } = await query.limit(1);
    if (error) throw error;
    
    return data && data.length > 0;
  },

  createHabitacion: async (habitacionData: any) => {
    const { data, error } = await supabase.from('habitaciones').insert([habitacionData]).select();
    if (error) throw error;
    return data;
  },

  updateHabitacion: async (id: number, habitacionData: any) => {
    const { data, error } = await supabase
      .from('habitaciones')
      .update(habitacionData)
      .eq('id', id)
      .select();
    if (error) throw error;
    return data;
  },

  deleteHabitacion: async (id: number) => {
    const { data, error } = await supabase
      .from('habitaciones')
      .delete()
      .eq('id', id);
    if (error) throw error;
    return data;
  },

  // Image Management
  uploadImage: imagenesHabitacion.upload,
  setPrincipalImage: imagenesHabitacion.setPrincipal,
  deleteImage: imagenesHabitacion.remove,

  uploadImageTipo: imagenesTipoHabitacion.upload,
  setPrincipalImageTipo: imagenesTipoHabitacion.setPrincipal,
  deleteImageTipo: imagenesTipoHabitacion.remove
};
