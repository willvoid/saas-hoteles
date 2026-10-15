import { supabase } from './supabaseClient';
import type {
  CategoriaFinanzas,
  CategoriaInput,
  CuentaFondo,
  FondoInput,
  MedioPagoFondo,
  MedioPagoFondoInput,
  Proveedor,
  ProveedorInput,
  SaldoInicialFondo,
  SaldoInicialNuevo,
  TipoCategoria,
  TransferenciaFondos,
  TransferenciaNueva,
} from '../types/finanzas';

/** The database raises clear Spanish messages (closed month, balance exceeded,
 *  duplicate RUC...). They are forwarded untouched; nothing is mapped away. */
export function errorDeBase(error: { message: string }): Error {
  return new Error(error.message);
}

// Catalogs and fund movements of the finance module (suppliers, categories,
// funds, payment-method mapping, transfers, opening balances). Ledger
// documents are never deleted: they are annulled (estado = 'ANULADO').
export const finanzasService = {
  // ─── Proveedores ───────────────────────────────────────────────────────────
  async getProveedores(opts: { soloActivos?: boolean } = {}): Promise<Proveedor[]> {
    let query = supabase.from('proveedores').select('*').order('nombre', { ascending: true });
    if (opts.soloActivos) query = query.eq('activo', true);
    const { data, error } = await query;
    if (error) throw errorDeBase(error);
    return (data ?? []) as Proveedor[];
  },

  async crearProveedor(input: ProveedorInput): Promise<Proveedor> {
    const { data, error } = await supabase.from('proveedores').insert(input).select().single();
    if (error) throw errorDeBase(error);
    return data as Proveedor;
  },

  async actualizarProveedor(id: number, patch: Partial<ProveedorInput>): Promise<Proveedor> {
    const { data, error } = await supabase
      .from('proveedores')
      .update(patch)
      .eq('id', id)
      .select()
      .single();
    if (error) throw errorDeBase(error);
    return data as Proveedor;
  },

  async setProveedorActivo(id: number, activo: boolean): Promise<Proveedor> {
    const { data, error } = await supabase
      .from('proveedores')
      .update({ activo })
      .eq('id', id)
      .select()
      .single();
    if (error) throw errorDeBase(error);
    return data as Proveedor;
  },

  // ─── Categorías ────────────────────────────────────────────────────────────
  async getCategorias(
    opts: { tipo?: TipoCategoria; soloActivas?: boolean } = {},
  ): Promise<CategoriaFinanzas[]> {
    let query = supabase.from('categorias_finanzas').select('*').order('nombre', { ascending: true });
    if (opts.tipo) query = query.eq('tipo', opts.tipo);
    if (opts.soloActivas) query = query.eq('activo', true);
    const { data, error } = await query;
    if (error) throw errorDeBase(error);
    return (data ?? []) as CategoriaFinanzas[];
  },

  async crearCategoria(input: CategoriaInput): Promise<CategoriaFinanzas> {
    const { data, error } = await supabase
      .from('categorias_finanzas')
      .insert(input)
      .select()
      .single();
    if (error) throw errorDeBase(error);
    return data as CategoriaFinanzas;
  },

  async actualizarCategoria(
    id: number,
    patch: { nombre?: string; fk_cuenta_contable?: number },
  ): Promise<CategoriaFinanzas> {
    const { data, error } = await supabase
      .from('categorias_finanzas')
      .update(patch)
      .eq('id', id)
      .select()
      .single();
    if (error) throw errorDeBase(error);
    return data as CategoriaFinanzas;
  },

  async setCategoriaActiva(id: number, activo: boolean): Promise<CategoriaFinanzas> {
    const { data, error } = await supabase
      .from('categorias_finanzas')
      .update({ activo })
      .eq('id', id)
      .select()
      .single();
    if (error) throw errorDeBase(error);
    return data as CategoriaFinanzas;
  },

  // ─── Fondos (cuentas_fondos) ───────────────────────────────────────────────
  async getFondos(opts: { soloActivos?: boolean } = {}): Promise<CuentaFondo[]> {
    let query = supabase.from('cuentas_fondos').select('*').order('nombre', { ascending: true });
    if (opts.soloActivos) query = query.eq('activo', true);
    const { data, error } = await query;
    if (error) throw errorDeBase(error);
    return (data ?? []) as CuentaFondo[];
  },

  async crearFondo(input: FondoInput): Promise<CuentaFondo> {
    // fk_cuenta_contable is NOT NULL in the schema but a trigger fills it.
    const { data, error } = await supabase
      .from('cuentas_fondos')
      .insert(input as never)
      .select()
      .single();
    if (error) throw errorDeBase(error);
    return data as CuentaFondo;
  },

  async actualizarFondo(id: number, patch: { nombre?: string }): Promise<CuentaFondo> {
    const { data, error } = await supabase
      .from('cuentas_fondos')
      .update(patch)
      .eq('id', id)
      .select()
      .single();
    if (error) throw errorDeBase(error);
    return data as CuentaFondo;
  },

  async setFondoActivo(id: number, activo: boolean): Promise<CuentaFondo> {
    const { data, error } = await supabase
      .from('cuentas_fondos')
      .update({ activo })
      .eq('id', id)
      .select()
      .single();
    if (error) throw errorDeBase(error);
    return data as CuentaFondo;
  },

  // ─── Medios de pago por fondo ──────────────────────────────────────────────
  async getMediosPagoFondo(): Promise<MedioPagoFondo[]> {
    const { data, error } = await supabase.from('medios_pago_fondo').select('*');
    if (error) throw errorDeBase(error);
    return (data ?? []) as MedioPagoFondo[];
  },

  // One payment method maps to one fund per hotel (unique tenant + modo_pago),
  // so saving it again re-points the method to the new fund.
  async guardarMedioPagoFondo(input: MedioPagoFondoInput): Promise<MedioPagoFondo> {
    const { data, error } = await supabase
      .from('medios_pago_fondo')
      .upsert(input, { onConflict: 'tenant_id,fk_modo_pago' })
      .select()
      .single();
    if (error) throw errorDeBase(error);
    return data as MedioPagoFondo;
  },

  async eliminarMedioPagoFondo(id: number): Promise<void> {
    const { error } = await supabase.from('medios_pago_fondo').delete().eq('id', id);
    if (error) throw errorDeBase(error);
  },

  // ─── Transferencias entre fondos ───────────────────────────────────────────
  async getTransferencias(desde: string, hasta: string): Promise<TransferenciaFondos[]> {
    const { data, error } = await supabase
      .from('transferencias_fondos')
      .select('*')
      .gte('fecha', desde)
      .lte('fecha', hasta)
      .order('fecha', { ascending: false })
      .order('id', { ascending: false });
    if (error) throw errorDeBase(error);
    return (data ?? []) as TransferenciaFondos[];
  },

  async crearTransferencia(input: TransferenciaNueva): Promise<TransferenciaFondos> {
    const { data, error } = await supabase
      .from('transferencias_fondos')
      .insert(input as never)
      .select()
      .single();
    if (error) throw errorDeBase(error);
    return data as TransferenciaFondos;
  },

  async anularTransferencia(id: number): Promise<TransferenciaFondos> {
    const { data, error } = await supabase
      .from('transferencias_fondos')
      .update({ estado: 'ANULADO' })
      .eq('id', id)
      .select()
      .single();
    if (error) throw errorDeBase(error);
    return data as TransferenciaFondos;
  },

  // ─── Saldos iniciales ──────────────────────────────────────────────────────
  async getSaldosIniciales(): Promise<SaldoInicialFondo[]> {
    const { data, error } = await supabase
      .from('saldos_iniciales_fondos')
      .select('*')
      .order('fecha', { ascending: false })
      .order('id', { ascending: false });
    if (error) throw errorDeBase(error);
    return (data ?? []) as SaldoInicialFondo[];
  },

  async crearSaldoInicial(input: SaldoInicialNuevo): Promise<SaldoInicialFondo> {
    const { data, error } = await supabase
      .from('saldos_iniciales_fondos')
      .insert(input as never)
      .select()
      .single();
    if (error) throw errorDeBase(error);
    return data as SaldoInicialFondo;
  },

  async anularSaldoInicial(id: number): Promise<SaldoInicialFondo> {
    const { data, error } = await supabase
      .from('saldos_iniciales_fondos')
      .update({ estado: 'ANULADO' })
      .eq('id', id)
      .select()
      .single();
    if (error) throw errorDeBase(error);
    return data as SaldoInicialFondo;
  },
};
