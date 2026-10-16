import { supabase } from './supabaseClient';
import {
  DEFAULT_CONFIG_HORARIOS,
  horaCorta,
  traducirErrorRecargo,
  type ConfigHorarios,
  type MetodoRecargo,
  type TipoRecargo,
} from '../utils/recargoHorario';

/** Suggested surcharge for a reservation (rows of `calcular_recargo_horario`). */
export interface RecargoSugerido {
  minutosExceso: number;
  montoSugerido: number;
  conceptoId: number | null;
  metodo: MetodoRecargo;
  toleranciaMin: number;
  valorRecargo: number;
  tarifaNoche: number;
}

/** What reception decided for the surcharge. All fields optional = accept the suggestion. */
export interface DecisionRecargo {
  /** Final amount in Gs. Omitted/null = accept the suggested one. */
  monto?: number | null;
  /** Mandatory when exonerating or when the amount differs from the suggestion. */
  motivo?: string | null;
  exonerar?: boolean;
}

export type AccionRecargo = 'NINGUNO' | 'APLICADO' | 'MODIFICADO' | 'EXONERADO';

/** jsonb returned by `checkout_con_recargo` / `checkin_con_recargo`. */
export interface ResultadoEstancia {
  id_reserva: number;
  estado: string;
  tipo: TipoRecargo;
  accion: AccionRecargo;
  minutos_exceso: number;
  monto_sugerido: number;
  monto_final: number;
  id_folio: number | null;
  id_cargo: number | null;
  /** True when the RPC had to create the folio (first check-in). */
  folio_creado: boolean;
}

/** Settings of one establishment; `existe` is false while it still uses the defaults. */
export interface ConfigHorariosEstablecimiento extends ConfigHorarios {
  existe: boolean;
}

const aMetodo = (valor: string): MetodoRecargo =>
  valor === 'FIJO_HORA' ? 'FIJO_HORA' : 'PORCENTAJE';

export const horarioService = {
  /** Settings of an establishment, or the defaults (`existe: false`) when it has none yet. */
  async getConfig(fkEstablecimiento: number): Promise<ConfigHorariosEstablecimiento> {
    const { data, error } = await supabase
      .from('config_horarios_establecimiento')
      .select('hora_checkin, hora_checkout, tolerancia_min, metodo_recargo, valor_recargo')
      .eq('fk_establecimiento', fkEstablecimiento)
      .maybeSingle();
    if (error) throw new Error(traducirErrorRecargo(error, 'No se pudo cargar la configuración de horarios.'));
    if (!data) return { ...DEFAULT_CONFIG_HORARIOS, existe: false };
    return {
      hora_checkin: horaCorta(data.hora_checkin),
      hora_checkout: horaCorta(data.hora_checkout),
      tolerancia_min: Number(data.tolerancia_min),
      metodo_recargo: aMetodo(data.metodo_recargo),
      valor_recargo: Number(data.valor_recargo),
      existe: true,
    };
  },

  /**
   * Creates or updates the settings of an establishment (admin/gerente only,
   * enforced by RLS). The tenant comes from the column default.
   */
  async guardarConfig(fkEstablecimiento: number, config: ConfigHorarios): Promise<void> {
    const payload = {
      hora_checkin: config.hora_checkin,
      hora_checkout: config.hora_checkout,
      tolerancia_min: config.tolerancia_min,
      metodo_recargo: config.metodo_recargo,
      valor_recargo: config.valor_recargo,
    };

    const { data: existente, error: findError } = await supabase
      .from('config_horarios_establecimiento')
      .select('id_config')
      .eq('fk_establecimiento', fkEstablecimiento)
      .maybeSingle();
    if (findError) throw new Error(traducirErrorRecargo(findError));

    const { data, error } = existente
      ? await supabase
          .from('config_horarios_establecimiento')
          .update(payload)
          .eq('id_config', existente.id_config)
          .select('id_config')
      : await supabase
          .from('config_horarios_establecimiento')
          .insert({ ...payload, fk_establecimiento: fkEstablecimiento })
          .select('id_config');
    if (error) throw new Error(traducirErrorRecargo(error, 'No se pudo guardar la configuración de horarios.'));
    // RLS filters an unauthorized UPDATE to zero rows instead of failing.
    if (!data || data.length === 0) {
      throw new Error('No tenés permisos para modificar la configuración de horarios.');
    }
  },

  /** Surcharge suggested by the database for a reservation, at `momento` (default: now). */
  async calcularRecargo(
    idReserva: number,
    tipo: TipoRecargo,
    momento?: Date,
  ): Promise<RecargoSugerido> {
    const { data, error } = await supabase.rpc('calcular_recargo_horario', {
      p_reserva: idReserva,
      p_tipo: tipo,
      ...(momento ? { p_momento: momento.toISOString() } : {}),
    });
    if (error) throw new Error(traducirErrorRecargo(error, 'No se pudo calcular el recargo.'));
    const fila = data?.[0];
    if (!fila) throw new Error('No se pudo calcular el recargo.');
    return {
      minutosExceso: Number(fila.minutos_exceso),
      montoSugerido: Number(fila.monto_sugerido),
      conceptoId: fila.concepto_id == null ? null : Number(fila.concepto_id),
      metodo: aMetodo(fila.metodo),
      toleranciaMin: Number(fila.tolerancia_min),
      valorRecargo: Number(fila.valor_recargo),
      tarifaNoche: Number(fila.tarifa_noche),
    };
  },

  /** Atomic check-out: surcharge + historial + estado Check-out in one transaction. */
  async checkoutConRecargo(idReserva: number, decision: DecisionRecargo = {}): Promise<ResultadoEstancia> {
    const { data, error } = await supabase.rpc('checkout_con_recargo', {
      p_reserva: idReserva,
      p_monto: decision.monto ?? null,
      p_motivo: decision.motivo ?? null,
      p_exonerar: decision.exonerar ?? false,
    });
    if (error) throw new Error(traducirErrorRecargo(error, 'No se pudo hacer el check-out.'));
    return data as unknown as ResultadoEstancia;
  },

  /**
   * Atomic check-in. The RPC also creates the folio and its automatic
   * "Alojamiento" charge when the reservation has none: callers must not repeat that.
   */
  async checkinConRecargo(idReserva: number, decision: DecisionRecargo = {}): Promise<ResultadoEstancia> {
    const { data, error } = await supabase.rpc('checkin_con_recargo', {
      p_reserva: idReserva,
      p_monto: decision.monto ?? null,
      p_motivo: decision.motivo ?? null,
      p_exonerar: decision.exonerar ?? false,
    });
    if (error) throw new Error(traducirErrorRecargo(error, 'No se pudo hacer el check-in.'));
    return data as unknown as ResultadoEstancia;
  },
};
