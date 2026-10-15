import { supabase } from './supabaseClient';
import { errorDeBase } from './finanzasService';
import type {
  FilaCxc,
  FilaCxp,
  FilaFlujoFondos,
  FilaLibroIva,
  FilaMovimientoFondo,
  FilaResultado,
} from '../types/finanzas';

// Postgres `numeric` can arrive as a string depending on the client path
// (reporteService guards the same way with Number()). Null maps to 0.
function num(value: unknown): number {
  return Number(value) || 0;
}

/** Applies Number() to the listed numeric columns of every row. */
function numerico<T extends object>(rows: unknown, campos: (keyof T)[]): T[] {
  return ((rows ?? []) as T[]).map((row) => {
    const out = { ...row };
    for (const campo of campos) (out[campo] as unknown) = num(row[campo]);
    return out;
  });
}

// One function per report RPC (security invoker; admin/gerente get rows, any
// other role gets none). Dates are ISO 'YYYY-MM-DD' strings.
export const reporteFinanzasService = {
  async getResultado(desde: string, hasta: string): Promise<FilaResultado[]> {
    const { data, error } = await supabase.rpc('fn_rep_resultado', {
      p_desde: desde,
      p_hasta: hasta,
    });
    if (error) throw errorDeBase(error);
    return numerico<FilaResultado>(data, ['fk_categoria', 'monto']);
  },

  // `corte` only drives the aging; null = today in America/Asuncion. The
  // balance is the current one, not reconstructed at the cutoff.
  async getCxc(corte: string | null = null): Promise<FilaCxc[]> {
    const { data, error } = await supabase.rpc('fn_rep_cxc', { p_corte: corte });
    if (error) throw errorDeBase(error);
    return numerico<FilaCxc>(data, [
      'fk_cliente',
      'id_factura',
      'total_general',
      'saldo_pendiente',
      'dias_vencido',
    ]);
  },

  async getCxp(corte: string | null = null): Promise<FilaCxp[]> {
    const { data, error } = await supabase.rpc('fn_rep_cxp', { p_corte: corte });
    if (error) throw errorDeBase(error);
    return numerico<FilaCxp>(data, [
      'fk_proveedor',
      'id_gasto',
      'total',
      'saldo_pendiente',
      'dias_vencido',
    ]);
  },

  async getFlujoFondos(desde: string, hasta: string): Promise<FilaFlujoFondos[]> {
    const { data, error } = await supabase.rpc('fn_rep_flujo_fondos', {
      p_desde: desde,
      p_hasta: hasta,
    });
    if (error) throw errorDeBase(error);
    return numerico<FilaFlujoFondos>(data, [
      'fk_fondo',
      'saldo_inicial',
      'ingresos',
      'egresos',
      'saldo_final',
    ]);
  },

  async getMovimientosFondo(
    fondo: number,
    desde: string,
    hasta: string,
  ): Promise<FilaMovimientoFondo[]> {
    const { data, error } = await supabase.rpc('fn_rep_movimientos_fondo', {
      p_fondo: fondo,
      p_desde: desde,
      p_hasta: hasta,
    });
    if (error) throw errorDeBase(error);
    return numerico<FilaMovimientoFondo>(data, [
      'nro_asiento',
      'fk_origen',
      'debe',
      'haber',
      'saldo_acumulado',
    ]);
  },

  async getLibroIva(anio: number): Promise<FilaLibroIva[]> {
    const { data, error } = await supabase.rpc('fn_rep_libro_iva', { p_anio: anio });
    if (error) throw errorDeBase(error);
    return numerico<FilaLibroIva>(data, [
      'mes',
      'base_ventas_10',
      'base_ventas_5',
      'base_ventas_exentas',
      'iva_debito',
      'compras_gravadas_10',
      'compras_gravadas_5',
      'compras_exentas',
      'iva_credito',
      'iva_a_pagar',
    ]);
  },
};
