import { supabase } from './supabaseClient';
import { errorDeBase } from './finanzasService';
import type {
  CondicionGasto,
  EstadoDocumento,
  Gasto,
  GastoListado,
  GastoNuevo,
} from '../types/finanzas';

export interface FiltrosGasto {
  desde?: string;
  hasta?: string;
  estado?: EstadoDocumento;
  fk_proveedor?: number;
  condicion?: CondicionGasto;
}

// Composite FKs (tenant_id, fk_*): the constraint name disambiguates the embed.
const SELECT_GASTO =
  '*, proveedor:proveedores!gastos_proveedor_fkey(id, nombre, ruc), ' +
  'categoria:categorias_finanzas!gastos_categoria_fkey(id, nombre), ' +
  'fondo:cuentas_fondos!gastos_fondo_fkey(id, nombre)';

// Only these columns may be sent: iva_10, iva_5, total, saldo_pendiente and
// estado are computed by the BEFORE INSERT trigger, whatever the client sends.
const COLUMNAS_CLIENTE = [
  'fecha',
  'fk_establecimientos',
  'fk_proveedor',
  'fk_categoria',
  'nro_comprobante',
  'gravado_10',
  'gravado_5',
  'exenta',
  'condicion',
  'fecha_vencimiento',
  'fk_cuenta_fondo',
  'observacion',
] as const;

export const gastoService = {
  async getGastos(filtros: FiltrosGasto = {}): Promise<GastoListado[]> {
    let query = supabase
      .from('gastos')
      .select(SELECT_GASTO)
      .order('fecha', { ascending: false })
      .order('id', { ascending: false });
    if (filtros.desde) query = query.gte('fecha', filtros.desde);
    if (filtros.hasta) query = query.lte('fecha', filtros.hasta);
    if (filtros.estado) query = query.eq('estado', filtros.estado);
    if (filtros.fk_proveedor != null) query = query.eq('fk_proveedor', filtros.fk_proveedor);
    if (filtros.condicion) query = query.eq('condicion', filtros.condicion);

    const { data, error } = await query;
    if (error) throw errorDeBase(error);
    return (data ?? []) as unknown as GastoListado[];
  },

  async getGasto(id: number): Promise<GastoListado> {
    const { data, error } = await supabase
      .from('gastos')
      .select(SELECT_GASTO)
      .eq('id', id)
      .single();
    if (error) throw errorDeBase(error);
    return data as unknown as GastoListado;
  },

  async crearGasto(input: GastoNuevo): Promise<Gasto> {
    const payload: Record<string, unknown> = {};
    for (const col of COLUMNAS_CLIENTE) {
      if (input[col] !== undefined) payload[col] = input[col];
    }
    const { data, error } = await supabase
      .from('gastos')
      .insert(payload as never)
      .select()
      .single();
    if (error) throw errorDeBase(error);
    return data as Gasto;
  },

  // The database refuses it while the expense has active payments or its
  // month is closed; the message is forwarded as is.
  async anularGasto(id: number): Promise<Gasto> {
    const { data, error } = await supabase
      .from('gastos')
      .update({ estado: 'ANULADO' })
      .eq('id', id)
      .select()
      .single();
    if (error) throw errorDeBase(error);
    return data as Gasto;
  },
};
