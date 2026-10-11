import { supabase } from './supabaseClient';
import { RoomOccupancyService, getLocalToday } from './roomOccupancyService';
import { normalizeEstado } from '../utils/reservaBlockingState';

// Estados de reserva considerados "activos" para el KPI de Home. Mismos
// literales que ReservationForm.tsx guarda en la columna `estado`.
const ESTADOS_RESERVA_ACTIVA = ['Pendiente', 'Confirmada', 'Check-in'];

// Estados que significan que la habitación estuvo REALMENTE ocupada esa noche.
// Se incluye 'check-out' porque una reserva ya cerrada igual ocupó las noches
// de su rango — sin ella los días pasados del gráfico darían 0. Quedan fuera
// 'cancelada' y también 'pendiente'/'confirmada', que en fechas pasadas son
// no-shows, no ocupación real. Normalizados en minúscula porque el casing de
// `estado` no es confiable (ver reservaBlockingState.ts).
const ESTADOS_ESTADIA_REAL = ['check-in', 'check-out'];

const DETALLE_ACTIVO = 'Activo';
const DIAS_GRAFICO = 7;
const NOMBRES_DIA = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

const addDays = (isoDate: string, n: number): string => {
  const d = new Date(`${isoDate}T00:00:00`);
  d.setDate(d.getDate() + n);
  return d.toLocaleDateString('en-CA');
};

const nombreDia = (isoDate: string): string =>
  NOMBRES_DIA[new Date(`${isoDate}T00:00:00`).getDay()];

export interface HomeStats {
  reservasActivas: number;
  totalClientes: number;
  ocupacionPct: number;
}

export interface OcupacionDia {
  /** 'YYYY-MM-DD' */
  fecha: string;
  /** Etiqueta corta para el eje X, p. ej. 'Lun'. */
  label: string;
  ocupacionPct: number;
}

/**
 * El embed de PostgREST vuelve como objeto o como array de un elemento según
 * la forma de la query — misma varianza que maneja reservaBlockingState.ts.
 */
interface DetalleConReservaRow {
  fk_habitacion: number | null;
  reservas:
    | { estado?: unknown; fecha_entrada?: string; fecha_salida?: string }
    | Array<{ estado?: unknown; fecha_entrada?: string; fecha_salida?: string }>
    | null;
}

const unwrapReserva = (row: DetalleConReservaRow) =>
  Array.isArray(row.reservas) ? row.reservas[0] : row.reservas;

export const dashboardService = {
  async getHomeStats(): Promise<HomeStats> {
    const [reservasRes, clientesRes, habitacionesRes, ocupadas] = await Promise.all([
      supabase
        .from('reservas')
        .select('id_reserva', { count: 'exact', head: true })
        .in('estado', ESTADOS_RESERVA_ACTIVA),
      supabase
        .from('clientes')
        .select('id_cliente', { count: 'exact', head: true })
        .eq('estado_cliente', 'Activo'),
      supabase
        .from('habitaciones')
        .select('id', { count: 'exact', head: true }),
      RoomOccupancyService.getHabitacionesOcupadas(),
    ]);

    if (reservasRes.error) throw reservasRes.error;
    if (clientesRes.error) throw clientesRes.error;
    if (habitacionesRes.error) throw habitacionesRes.error;

    const totalHabitaciones = habitacionesRes.count || 0;
    const ocupacionPct = totalHabitaciones === 0
      ? 0
      : Math.round((ocupadas.size / totalHabitaciones) * 100);

    return {
      reservasActivas: reservasRes.count || 0,
      totalClientes: clientesRes.count || 0,
      ocupacionPct,
    };
  },

  /**
   * Porcentaje de ocupación de cada uno de los últimos 7 días (el último es hoy).
   *
   * Se resuelve con UNA sola query al rango completo y el conteo por día se
   * hace en memoria, en vez de 7 consultas separadas. Una habitación cuenta
   * como ocupada el día D si su reserva cubre esa noche
   * (`fecha_entrada <= D < fecha_salida`), comparando los 'YYYY-MM-DD' como
   * strings, que ordenan igual que como fechas.
   */
  async getOcupacionUltimos7Dias(): Promise<OcupacionDia[]> {
    const hoy = getLocalToday();
    const primerDia = addDays(hoy, -(DIAS_GRAFICO - 1));

    const dias = Array.from({ length: DIAS_GRAFICO }, (_, i) => addDays(primerDia, i));

    const [habitacionesRes, detallesRes, ocupadasHoy] = await Promise.all([
      supabase
        .from('habitaciones')
        .select('id', { count: 'exact', head: true }),
      supabase
        .from('detalle_reservas')
        .select('fk_habitacion, reservas!inner(estado, fecha_entrada, fecha_salida)')
        .eq('estado', DETALLE_ACTIVO)
        .lt('reservas.fecha_entrada', addDays(hoy, 1))
        .gt('reservas.fecha_salida', primerDia),
      // Mismo cálculo que el KPI "Ocupación" de arriba (sólo estado exacto
      // 'Check-in'), para que el día "Hoy" del gráfico nunca contradiga al
      // KPI: son la misma pregunta ("¿está ocupada ahora mismo?") y deben
      // coincidir siempre, aunque para los días pasados sí haga falta el
      // criterio más amplio de abajo (Check-in + Check-out).
      RoomOccupancyService.getHabitacionesOcupadas(hoy),
    ]);

    if (habitacionesRes.error) throw habitacionesRes.error;
    if (detallesRes.error) throw detallesRes.error;

    const totalHabitaciones = habitacionesRes.count || 0;

    // Sólo las estadías reales, ya desenvueltas, para no repetir el trabajo
    // por cada uno de los 7 días.
    const estadias = ((detallesRes.data || []) as unknown as DetalleConReservaRow[])
      .map(row => ({ habitacion: row.fk_habitacion, reserva: unwrapReserva(row) }))
      .filter(({ habitacion, reserva }) =>
        habitacion != null &&
        reserva?.fecha_entrada != null &&
        reserva?.fecha_salida != null &&
        ESTADOS_ESTADIA_REAL.includes(normalizeEstado(reserva.estado))
      );

    const ocupacionDe = (ocupadas: Set<number>) =>
      totalHabitaciones === 0 ? 0 : Math.round((ocupadas.size / totalHabitaciones) * 100);

    return dias.map(fecha => {
      if (fecha === hoy) {
        return { fecha, label: nombreDia(fecha), ocupacionPct: ocupacionDe(ocupadasHoy) };
      }

      // Set: la misma habitación puede aparecer en más de un detalle y no
      // debe contarse dos veces el mismo día.
      const ocupadas = new Set<number>();

      for (const { habitacion, reserva } of estadias) {
        if (reserva!.fecha_entrada! <= fecha && fecha < reserva!.fecha_salida!) {
          ocupadas.add(habitacion!);
        }
      }

      return { fecha, label: nombreDia(fecha), ocupacionPct: ocupacionDe(ocupadas) };
    });
  },
};
