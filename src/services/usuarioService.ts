import { supabase } from './supabaseClient';

export const UsuarioService = {
  getUsuarios: async () => {
    const { data, error } = await supabase
      .from('usuario')
      .select(`
        id_usuario,
        created_at,
        documento,
        nombre,
        correo,
        usuario,
        telefono,
        estado,
        fk_cargo,
        fk_tipo_doc,
        cargo:fk_cargo ( cargo ),
        tipo_documento:fk_tipo_doc ( descripcion_tipodoc )
      `)
      .order('id_usuario', { ascending: false });

    if (error) throw error;
    return data || [];
  },

  checkDuplicado: async (correo: string, usuario: string, excludeId?: number) => {
    let query = supabase
      .from('usuario')
      .select('id_usuario')
      .or(`correo.eq.${correo},usuario.eq.${usuario}`);

    if (excludeId) {
      query = query.neq('id_usuario', excludeId);
    }

    const { data, error } = await query.limit(1);
    if (error) throw error;

    return data && data.length > 0;
  },

  updateUsuario: async (id: number, usuarioData: any) => {
    const { data, error } = await supabase
      .from('usuario')
      .update(usuarioData)
      .eq('id_usuario', id)
      .select();
    if (error) throw error;
    return data;
  },

  setEstado: async (id: number, estado: 'Activo' | 'Inactivo') => {
    const { data, error } = await supabase
      .from('usuario')
      .update({ estado })
      .eq('id_usuario', id)
      .select();
    if (error) throw error;
    return data;
  },

  getTiposDocumento: async () => {
    const { data, error } = await supabase
      .from('tipo_documento')
      .select('cod_tipodoc, descripcion_tipodoc');

    if (error) throw error;
    return data || [];
  },

  // Estado actual del usuario, para revalidar la sesión sin depender de
  // realtime (por ejemplo al volver a la pestaña).
  getEstado: async (id: number): Promise<string | null> => {
    const { data, error } = await supabase
      .from('usuario')
      .select('estado')
      .eq('id_usuario', id)
      .maybeSingle();

    if (error) throw error;
    return data?.estado ?? null;
  },

  // Avisa en vivo cuando cambia el estado de este usuario, para poder cerrarle
  // la sesión apenas un admin lo desactiva. Devuelve la función de limpieza.
  subscribeEstado: (id: number, onEstado: (estado: string) => void): (() => void) => {
    const channel = supabase
      .channel(`usuario-estado-${id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'usuario',
          filter: `id_usuario=eq.${id}`
        },
        (payload) => {
          const estado = (payload.new as { estado?: string | null })?.estado;
          if (estado) onEstado(estado);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }
};
