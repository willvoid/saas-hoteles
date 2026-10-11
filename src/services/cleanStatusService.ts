import { supabase } from './supabaseClient';
import { normalizeRole } from '../utils/permissions';

export interface EstadoLimpiezaRow {
  id_estado_limpieza: number;
  estado: string;
  fk_empleado: number | null;
  ultima_actualizacion: string | null;
  usuario?: {
    nombre: string;
  } | null;
}

export interface BloqueoHabitacionRow {
  id_bloqueo: number;
  fk_habitacion: number;
  fecha_inicio: string;
  fecha_fin: string | null;
  motivo: string;
  observaciones: string | null;
}

export interface EmpleadoRow {
  id_usuario: number;
  nombre: string;
  /** Nombre de usuario, para distinguir homónimos al asignar la limpieza. */
  usuario: string;
}

export interface HabitacionConEstado {
  id: number;
  numero_habitacion: number;
  fk_piso: number;
  fk_tipo_habitacion: number;
  descripcion: string | null;
  created_at: string;
  tipo_habitacion?: {
    id: number;
    nombre: string;
    capacidad: number;
    descripcion: string | null;
  };
  estado_limpieza?: EstadoLimpiezaRow | EstadoLimpiezaRow[] | null;
  bloqueos_habitacion?: BloqueoHabitacionRow[] | null;
}

export const CleanStatusService = {
  // Fetch the cleaning status of every room, keyed by fk_habitacion
  getEstadosLimpieza: async (): Promise<Map<number, EstadoLimpiezaRow>> => {
    const estadosMap = new Map<number, EstadoLimpiezaRow>();

    const { data: estados, error } = await supabase
      .from('estado_limpieza')
      .select(`
        id_estado_limpieza,
        estado,
        fk_empleado,
        fk_habitacion,
        ultima_actualizacion,
        usuario ( nombre )
      `);

    if (error) {
      console.warn('Error loading estado_limpieza:', error);
      return estadosMap;
    }

    type EstadoLimpiezaSelectRow = {
      id_estado_limpieza: number;
      estado: string;
      fk_empleado: number | null;
      fk_habitacion: number;
      ultima_actualizacion: string | null;
      // PostgREST returns the embedded resource as an object or an array
      // depending on the inferred relationship cardinality.
      usuario: { nombre: string } | { nombre: string }[] | null;
    };

    (estados || []).forEach((est: EstadoLimpiezaSelectRow) => {
      // Normalise usuario to match type definition
      const rawUser = est.usuario;
      estadosMap.set(est.fk_habitacion, {
        id_estado_limpieza: est.id_estado_limpieza,
        estado: est.estado,
        fk_empleado: est.fk_empleado,
        ultima_actualizacion: est.ultima_actualizacion,
        usuario: Array.isArray(rawUser) ? rawUser[0] : rawUser
      });
    });

    return estadosMap;
  },

  // Fetch all rooms along with their status and blockages
  getHabitacionesConEstado: async (): Promise<HabitacionConEstado[]> => {
    // 1. Get rooms first
    const { data: rooms, error: roomsError } = await supabase
      .from('habitaciones')
      .select('*')
      .order('numero_habitacion', { ascending: true });

    if (roomsError) throw roomsError;
    const habitaciones = (rooms as HabitacionConEstado[]) || [];

    if (habitaciones.length === 0) return [];

    // 2. Fetch tipo_habitacion details
    try {
      const tipoIds = [...new Set(habitaciones.map(h => h.fk_tipo_habitacion).filter(Boolean))];
      if (tipoIds.length > 0) {
        const { data: tipos } = await supabase
          .from('tipo_habitacion')
          .select('id, nombre, capacidad, descripcion')
          .in('id', tipoIds);
        if (tipos) {
          type TipoHabitacionSelectRow = { id: number; nombre: string; capacidad: number; descripcion: string | null };
          const tipoMap = new Map(tipos.map((t: TipoHabitacionSelectRow) => [t.id, t]));
          habitaciones.forEach(h => {
            h.tipo_habitacion = tipoMap.get(h.fk_tipo_habitacion) || undefined;
          });
        }
      }
    } catch (e) {
      console.warn('Error loading tipo_habitacion in CleanStatusService:', e);
    }

    // 3. Fetch estado_limpieza joined with usuario
    try {
      const estadosMap = await CleanStatusService.getEstadosLimpieza();
      habitaciones.forEach(h => {
        h.estado_limpieza = estadosMap.get(h.id) || null;
      });
    } catch (e) {
      console.warn('Error loading estado_limpieza:', e);
    }

    // 4. Fetch Active Blockages
    try {
      const { data: blockages, error: blockagesError } = await supabase
        .from('bloqueos_habitacion')
        .select('*');

      if (!blockagesError && blockages) {
        const blockMap = new Map<number, BloqueoHabitacionRow[]>();
        blockages.forEach((block: BloqueoHabitacionRow) => {
          const arr = blockMap.get(block.fk_habitacion) || [];
          arr.push(block);
          blockMap.set(block.fk_habitacion, arr);
        });

        habitaciones.forEach(h => {
          h.bloqueos_habitacion = blockMap.get(h.id) || [];
        });
      }
    } catch (e) {
      console.warn('Error loading bloqueos_habitacion:', e);
    }

    return habitaciones;
  },

  // Empleados a los que se les puede asignar una limpieza: sólo los de cargo
  // limpiador y en estado activo. El cargo es texto libre escrito por el
  // usuario, así que se normaliza igual que en el control de acceso en vez de
  // filtrarlo por id o por un literal exacto.
  getEmpleados: async (): Promise<EmpleadoRow[]> => {
    const { data, error } = await supabase
      .from('usuario')
      .select('id_usuario, nombre, usuario, estado, cargo ( cargo )')
      .order('nombre', { ascending: true });
    if (error) throw error;

    type UsuarioConCargo = {
      id_usuario: number;
      nombre: string;
      usuario: string;
      estado: string | null;
      // PostgREST devuelve el embed como objeto o como array según la
      // cardinalidad que infiera.
      cargo: { cargo: string } | { cargo: string }[] | null;
    };

    return ((data || []) as unknown as UsuarioConCargo[])
      .filter((u) => {
        const activo = (u.estado || 'Activo').trim().toLowerCase() === 'activo';
        const rawCargo = Array.isArray(u.cargo) ? u.cargo[0] : u.cargo;
        return activo && normalizeRole(rawCargo?.cargo) === 'limpiador';
      })
      .map((u) => ({ id_usuario: u.id_usuario, nombre: u.nombre, usuario: u.usuario }));
  },

  // Save/Update cleaning status
  updateEstadoLimpieza: async (
    fk_habitacion: number,
    estado: string,
    fk_empleado: number | null
  ) => {
    // Check if there is already an entry for this room
    const { data: existing, error: checkError } = await supabase
      .from('estado_limpieza')
      .select('id_estado_limpieza')
      .eq('fk_habitacion', fk_habitacion)
      .maybeSingle();

    if (checkError) throw checkError;

    const payload = {
      estado,
      fk_empleado,
      fk_habitacion,
      ultima_actualizacion: new Date().toISOString()
    };

    if (existing) {
      const { data, error } = await supabase
        .from('estado_limpieza')
        .update(payload)
        .eq('id_estado_limpieza', existing.id_estado_limpieza)
        .select();
      if (error) throw error;
      return data;
    } else {
      const { data, error } = await supabase
        .from('estado_limpieza')
        .insert([payload])
        .select();
      if (error) throw error;
      return data;
    }
  },

  // Block a room: create a blockage entry and update status to 'Bloqueada'
  bloquearHabitacion: async (
    fk_habitacion: number,
    motivo: string,
    observaciones: string | null,
    fecha_inicio: string,
    fecha_fin: string | null
  ) => {
    const { data, error } = await supabase
      .from('bloqueos_habitacion')
      .insert([{
        fk_habitacion,
        motivo,
        observaciones,
        fecha_inicio,
        fecha_fin
      }])
      .select();

    if (error) throw error;

    // Update status to Bloqueada
    await CleanStatusService.updateEstadoLimpieza(fk_habitacion, 'Bloqueada', null);

    return data;
  },

  // Unblock a room: delete the blockage record and reset cleaning status (default 'Limpia')
  desbloquearHabitacion: async (
    fk_habitacion: number,
    id_bloqueo: number,
    nuevo_estado: string = 'Limpia'
  ) => {
    const { error: deleteError } = await supabase
      .from('bloqueos_habitacion')
      .delete()
      .eq('id_bloqueo', id_bloqueo);

    if (deleteError) throw deleteError;

    // Reset status
    await CleanStatusService.updateEstadoLimpieza(fk_habitacion, nuevo_estado, null);
  },

  // Update a room blockage (e.g. extension of date, reason, observations)
  updateBloqueoHabitacion: async (
    id_bloqueo: number,
    motivo: string,
    observaciones: string | null,
    fecha_inicio: string,
    fecha_fin: string | null
  ) => {
    const { data, error } = await supabase
      .from('bloqueos_habitacion')
      .update({
        motivo,
        observaciones,
        fecha_inicio,
        fecha_fin
      })
      .eq('id_bloqueo', id_bloqueo)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  // Live updates: another session (e.g. the cleaner marking a room, or
  // reception blocking one) should reflect here without a manual reload.
  // Callback receives no payload on purpose — callers just refetch.
  subscribeToChanges: (onChange: () => void): (() => void) => {
    const channel = supabase
      .channel('estado-limpieza-cambios')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'estado_limpieza' }, onChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bloqueos_habitacion' }, onChange)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }
};

