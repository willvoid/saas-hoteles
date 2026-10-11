import { supabase } from './supabaseClient';
import type { BookingPayload, LandingCatalogo, LandingReservaResult } from '../types/booking';

interface CatalogoCrudo {
  tipos_habitacion: Omit<LandingCatalogo['tipos_habitacion'][number], 'imagen_url'>[];
  imagenes_tipo_habitacion: { id: number; fk_tipo_habitacion: number; ruta_storage: string; es_principal: boolean }[];
  tarifas: LandingCatalogo['tarifas'];
  habitaciones: LandingCatalogo['habitaciones'];
  tipos_documento: LandingCatalogo['tipos_documento'];
}

// Único acceso del sitio público: anon no lee tablas, solo estas tres RPC.
export const LandingService = {
  getCatalogo: async (slug: string): Promise<LandingCatalogo | null> => {
    const { data, error } = await supabase.rpc('fn_landing_catalogo', { p_slug: slug });
    if (error) throw error;
    if (!data) return null;

    const crudo = data as unknown as CatalogoCrudo;
    const imagenes = crudo.imagenes_tipo_habitacion || [];

    return {
      tipos_habitacion: (crudo.tipos_habitacion || []).map((tipo) => {
        const propias = imagenes.filter((img) => img.fk_tipo_habitacion === tipo.id);
        const principal = propias.find((img) => img.es_principal) || propias[0];
        return { ...tipo, imagen_url: principal?.ruta_storage ?? null };
      }),
      tarifas: crudo.tarifas || [],
      habitaciones: crudo.habitaciones || [],
      tipos_documento: crudo.tipos_documento || [],
    };
  },

  // Habitaciones no disponibles en [desde, hasta): reservas que bloquean o bloqueos de mantenimiento.
  getHabitacionesOcupadas: async (slug: string, desde: string, hasta: string): Promise<Set<number>> => {
    const { data, error } = await supabase.rpc('fn_landing_ocupacion', {
      p_slug: slug,
      p_desde: desde,
      p_hasta: hasta,
    });
    if (error) throw error;
    return new Set((data || []).map((row: { fk_habitacion: number }) => row.fk_habitacion));
  },

  submitReserva: async (slug: string, payload: BookingPayload): Promise<LandingReservaResult> => {
    const { data, error } = await supabase.rpc('fn_registrar_reserva_landing', {
      p_slug: slug,
      p_payload: payload,
    });
    if (error) throw error;

    const result = data as { success: boolean; error_message?: string } & Partial<LandingReservaResult>;
    if (!result?.success) {
      throw new Error(result?.error_message || 'No se pudo registrar la reserva. Intenta nuevamente.');
    }

    return {
      id_reserva: result.id_reserva as number,
      codigo_reserva: result.codigo_reserva as string,
      total_estimado: result.total_estimado as number,
    };
  },
};
