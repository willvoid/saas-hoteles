import { supabase } from './supabaseClient';
import type {
  Reserva, DetalleReserva, HuespedReserva,
  HistorialEstancia, Habitacion, Tarifa, ReservaEstado
} from '../types/reservation';
import { canTransition } from '../utils/reservaEstado';

// ════════════════════════════════════════════════════════════════════════════
// RESERVAS (cabecera)
// ════════════════════════════════════════════════════════════════════════════

export const ReservationService = {
  getReservations: async (): Promise<Reserva[]> => {
    const { data, error } = await supabase
      .from('reservas')
      .select(`
        *,
        clientes ( id_cliente, razon_social, documento, reservas(id_reserva) ),
        usuario ( nombre )
      `)
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('Error fetching reservations with nested client reservas, trying simple client select:', error);
      const fallback = await supabase
        .from('reservas')
        .select(`
          *,
          clientes ( razon_social, documento ),
          usuario ( nombre )
        `)
        .order('created_at', { ascending: false });
      if (fallback.error) throw fallback.error;
      return (fallback.data as Reserva[]) || [];
    }
    return (data as Reserva[]) || [];
  },

  getReservationById: async (id: number): Promise<Reserva | null> => {
    const { data, error } = await supabase
      .from('reservas')
      .select(`*, clientes ( id_cliente, razon_social, documento, reservas(id_reserva) ), usuario ( nombre )`)
      .eq('id_reserva', id)
      .single();
    if (error) {
      const fallback = await supabase
        .from('reservas')
        .select(`*, clientes ( razon_social, documento ), usuario ( nombre )`)
        .eq('id_reserva', id)
        .single();
      if (fallback.error) throw fallback.error;
      return fallback.data as Reserva;
    }
    return data as Reserva;
  },

  createReservation: async (payload: Partial<Reserva>) => {
    const { data, error } = await supabase
      .from('reservas')
      .insert([payload])
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  updateReservation: async (id: number, payload: Partial<Reserva>) => {
    const { data, error } = await supabase
      .from('reservas')
      .update(payload)
      .eq('id_reserva', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  /**
   * Cambia el estado de una reserva validando la transición contra la máquina
   * de estados. Lanza si `from → to` no es una transición permitida (defensa
   * por si se invoca fuera del flujo de UI).
   */
  changeEstado: async (id: number, from: string, to: ReservaEstado) => {
    if (!canTransition(from, to)) {
      throw new Error(`Transición de estado inválida: ${from} → ${to}`);
    }
    const { data, error } = await supabase
      .from('reservas')
      .update({ estado: to })
      .eq('id_reserva', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  // ════════════════════════════════════════════════════════════════════════════
  // DETALLE DE RESERVAS (habitaciones + tarifas)
  // ════════════════════════════════════════════════════════════════════════════

  getDetalleReserva: async (idReserva: number): Promise<DetalleReserva[]> => {
    // Try with joins, fallback to simple select
    const { data, error } = await supabase
      .from('detalle_reservas')
      .select(`
        *,
        habitaciones ( id, numero_habitacion, fk_tipo_habitacion, descripcion, tipo_habitacion ( id, nombre, capacidad ) ),
        tarifas ( id, nombre, precio_base, estado )
      `)
      .eq('fk_reserva', idReserva)
      .eq('estado', 'Activo')
      .order('created_at', { ascending: true });
    if (error) {
      console.warn('Join failed for detalle_reservas, using simple select:', error.message);
      const fallback = await supabase
        .from('detalle_reservas')
        .select('*')
        .eq('fk_reserva', idReserva)
        .eq('estado', 'Activo')
        .order('created_at', { ascending: true });
      if (fallback.error) throw fallback.error;
      return (fallback.data as DetalleReserva[]) || [];
    }
    return (data as DetalleReserva[]) || [];
  },

  createDetalleReserva: async (payload: {
    fk_reserva: number;
    fk_habitacion: number;
    fk_tarifa: number;
    cantidad_adultos: number;
    cantidad_ninos: number;
    precio_unitario: number;
    subtotal: number;
    estado?: string;
  }) => {
    const { data, error } = await supabase
      .from('detalle_reservas')
      .insert([payload])
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  updateDetalleReserva: async (id: number, payload: Partial<DetalleReserva>) => {
    const { data, error } = await supabase
      .from('detalle_reservas')
      .update(payload)
      .eq('id_detalle', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  // Soft-delete: marca la row como INACTIVO en vez de borrarla físicamente.
  // Preserva los huéspedes atados (fk_detalle_reserva) y el rastro de auditoría.
  // getDetalleReserva y las queries de ocupación filtran por estado='Activo',
  // así que una row INACTIVO queda excluida de total, tabla, huéspedes y disponibilidad.
  deleteDetalleReserva: async (id: number) => {
    const { error } = await supabase
      .from('detalle_reservas')
      .update({ estado: 'INACTIVO' })
      .eq('id_detalle', id);
    if (error) throw error;
  },

  // ════════════════════════════════════════════════════════════════════════════
  // HUÉSPEDES
  // ════════════════════════════════════════════════════════════════════════════

  getHuespedesDetalle: async (idDetalle: number): Promise<HuespedReserva[]> => {
    const { data, error } = await supabase
      .from('huespedes_reserva')
      .select('*')
      .eq('fk_detalle_reserva', idDetalle)
      .order('es_titular', { ascending: false });
    if (error) throw error;
    return (data as HuespedReserva[]) || [];
  },

  createHuesped: async (payload: Partial<HuespedReserva>) => {
    const { data, error } = await supabase
      .from('huespedes_reserva')
      .insert([payload])
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  deleteHuesped: async (id: number) => {
    const { error } = await supabase
      .from('huespedes_reserva')
      .delete()
      .eq('id_huesped', id);
    if (error) throw error;
  },

  // ════════════════════════════════════════════════════════════════════════════
  // HISTORIAL / BITÁCORA
  // ════════════════════════════════════════════════════════════════════════════

  getHistorialEstancia: async (idReserva: number): Promise<HistorialEstancia[]> => {
    const { data, error } = await supabase
      .from('historial_estancia')
      .select(`*, usuario ( nombre )`)
      .eq('fk_reserva', idReserva)
      .order('fecha_movimiento', { ascending: false });
    if (error) throw error;
    return (data as HistorialEstancia[]) || [];
  },

  addHistorialEntry: async (payload: {
    fk_reserva: number;
    tipo_movimiento: string;
    descripcion?: string;
    fk_usuario: number;
  }) => {
    const { data, error } = await supabase
      .from('historial_estancia')
      .insert([{ ...payload, fecha_movimiento: new Date().toISOString() }])
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  // ════════════════════════════════════════════════════════════════════════════
  // CATÁLOGOS
  // ════════════════════════════════════════════════════════════════════════════

  getHabitaciones: async (): Promise<Habitacion[]> => {
    // Simple query first - guaranteed to work
    const { data, error } = await supabase
      .from('habitaciones')
      .select('*')
      .order('numero_habitacion', { ascending: true });
    if (error) throw error;
    const habitaciones = (data as Habitacion[]) || [];
    
    // Try to enrich with tipo_habitacion names
    if (habitaciones.length > 0) {
      try {
        const tipoIds = [...new Set(habitaciones.map(h => h.fk_tipo_habitacion).filter(Boolean))];
        if (tipoIds.length > 0) {
          const { data: tipos } = await supabase
            .from('tipo_habitacion')
            .select('id, nombre, capacidad, descripcion')
            .in('id', tipoIds);
          if (tipos) {
            const tipoMap = new Map(tipos.map((t: any) => [t.id, t]));
            habitaciones.forEach(h => {
              h.tipo_habitacion = tipoMap.get(h.fk_tipo_habitacion) || undefined;
            });
          }
        }
      } catch (e) { console.warn('Could not load tipo_habitacion:', e); }
    }
    return habitaciones;
  },

  getTarifas: async (): Promise<Tarifa[]> => {
    // Simple query first
    const { data, error } = await supabase
      .from('tarifas')
      .select('*')
      .order('nombre', { ascending: true });
    if (error) throw error;
    const tarifas = (data as Tarifa[]) || [];
    
    // Try to enrich with tipo_habitacion names
    if (tarifas.length > 0) {
      try {
        const tipoIds = [...new Set(tarifas.map(t => t.fk_tipo_habitacion).filter(Boolean))];
        if (tipoIds.length > 0) {
          const { data: tipos } = await supabase
            .from('tipo_habitacion')
            .select('id, nombre')
            .in('id', tipoIds);
          if (tipos) {
            const tipoMap = new Map(tipos.map((t: any) => [t.id, t]));
            tarifas.forEach(t => {
              t.tipo_habitacion = tipoMap.get(t.fk_tipo_habitacion) || undefined;
            });
          }
        }
      } catch (e) { console.warn('Could not load tipo_habitacion for tarifas:', e); }
    }
    return tarifas;
  },

  // ════════════════════════════════════════════════════════════════════════════
  // CLIENTES (para autocomplete)
  // ════════════════════════════════════════════════════════════════════════════

  getClientsList: async () => {
    const { data, error } = await supabase
      .from('clientes')
      .select('id_cliente, razon_social, documento, reservas(id_reserva)')
      .order('razon_social', { ascending: true });
    if (error) {
      console.warn('Error fetching clients list with reservas, attempting fallback:', error);
      const fallback = await supabase
        .from('clientes')
        .select('id_cliente, razon_social, documento')
        .order('razon_social', { ascending: true });
      if (fallback.error) throw fallback.error;
      return fallback.data || [];
    }
    return data || [];
  },

  getTiposDocumento: async (): Promise<{ cod_tipodoc: number; descripcion_tipodoc: string }[]> => {
    const { data, error } = await supabase
      .from('tipo_documento')
      .select('cod_tipodoc, descripcion_tipodoc');
    if (error) throw error;
    return data || [];
  },
};
