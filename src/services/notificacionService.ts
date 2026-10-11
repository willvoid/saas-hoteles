import { supabase } from './supabaseClient';
import type { Tables } from '../types/supabase';

// Single boundary for the notification inbox. The recipient fan-out (who
// gets notified when a room's cleaning status changes) is decided entirely
// by a database trigger; this service only reads the inbox and marks items
// as read.

export type NotificacionRow = Tables<'notificacion'>;

export const NotificacionService = {
  getBandeja: async (limit = 30): Promise<NotificacionRow[]> => {
    const { data, error } = await supabase
      .from('notificacion')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data || [];
  },

  contarNoLeidas: async (): Promise<number> => {
    const { count, error } = await supabase
      .from('notificacion')
      .select('id_notificacion', { count: 'exact', head: true })
      .eq('leida', false);

    if (error) throw error;
    return count || 0;
  },

  marcarLeida: async (id: number): Promise<void> => {
    const { error } = await supabase.rpc('marcar_notificacion_leida', { p_id: id });
    if (error) throw error;
  },

  marcarTodasLeidas: async (): Promise<void> => {
    const { error } = await supabase.rpc('marcar_todas_notificaciones_leidas');
    if (error) throw error;
  },

  // Subscribes to new notifications for this user in real time. Returns a
  // cleanup function that must be called on unmount to remove the channel.
  subscribe: (usuarioId: number, onInsert: (n: NotificacionRow) => void): (() => void) => {
    const channel = supabase
      .channel(`notificaciones-usuario-${usuarioId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notificacion',
          filter: `fk_usuario=eq.${usuarioId}`
        },
        (payload) => onInsert(payload.new as NotificacionRow)
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }
};
