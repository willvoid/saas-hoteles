import { supabase } from './supabaseClient';
import { errorDeBase } from './finanzasService';
import { CONDICION_VENTA_CREDITO } from '../types/factura';
import type {
  Cobro,
  CobroListado,
  CobroNuevo,
  FacturaPendiente,
  Pago,
  PagoListado,
  PagoNuevo,
} from '../types/finanzas';

// Composite FKs (tenant_id, fk_*): constraint names disambiguate the embeds.
const SELECT_COBRO =
  '*, fondo:cuentas_fondos!cobros_fondo_fkey(nombre), ' +
  'factura:facturas!cobros_factura_fkey(nro_secuencial, cliente:clientes(razon_social))';
const SELECT_PAGO =
  '*, fondo:cuentas_fondos!pagos_fondo_fkey(nombre), ' +
  'gasto:gastos!pagos_gasto_fkey(nro_comprobante, proveedor:proveedores(nombre))';

// Collections against credit invoices (cobros) and payments against credit
// expenses (pagos). The database lowers the balance and refuses an amount
// above it; its messages are forwarded as is.
export const cobroService = {
  // ─── Cobros ────────────────────────────────────────────────────────────────
  async getCobrosPorFactura(fk_factura: number): Promise<CobroListado[]> {
    const { data, error } = await supabase
      .from('cobros')
      .select(SELECT_COBRO)
      .eq('fk_factura', fk_factura)
      .order('fecha', { ascending: false })
      .order('id', { ascending: false });
    if (error) throw errorDeBase(error);
    return (data ?? []) as unknown as CobroListado[];
  },

  async getCobros(desde: string, hasta: string): Promise<CobroListado[]> {
    const { data, error } = await supabase
      .from('cobros')
      .select(SELECT_COBRO)
      .gte('fecha', desde)
      .lte('fecha', hasta)
      .order('fecha', { ascending: false })
      .order('id', { ascending: false });
    if (error) throw errorDeBase(error);
    return (data ?? []) as unknown as CobroListado[];
  },

  async crearCobro(input: CobroNuevo): Promise<Cobro> {
    const { data, error } = await supabase.from('cobros').insert(input).select().single();
    if (error) throw errorDeBase(error);
    return data as Cobro;
  },

  async anularCobro(id: number): Promise<Cobro> {
    const { data, error } = await supabase
      .from('cobros')
      .update({ estado: 'ANULADO' })
      .eq('id', id)
      .select()
      .single();
    if (error) throw errorDeBase(error);
    return data as Cobro;
  },

  // ─── Pagos ─────────────────────────────────────────────────────────────────
  async getPagosPorGasto(fk_gasto: number): Promise<PagoListado[]> {
    const { data, error } = await supabase
      .from('pagos')
      .select(SELECT_PAGO)
      .eq('fk_gasto', fk_gasto)
      .order('fecha', { ascending: false })
      .order('id', { ascending: false });
    if (error) throw errorDeBase(error);
    return (data ?? []) as unknown as PagoListado[];
  },

  async getPagos(desde: string, hasta: string): Promise<PagoListado[]> {
    const { data, error } = await supabase
      .from('pagos')
      .select(SELECT_PAGO)
      .gte('fecha', desde)
      .lte('fecha', hasta)
      .order('fecha', { ascending: false })
      .order('id', { ascending: false });
    if (error) throw errorDeBase(error);
    return (data ?? []) as unknown as PagoListado[];
  },

  async crearPago(input: PagoNuevo): Promise<Pago> {
    const { data, error } = await supabase.from('pagos').insert(input).select().single();
    if (error) throw errorDeBase(error);
    return data as Pago;
  },

  async anularPago(id: number): Promise<Pago> {
    const { data, error } = await supabase
      .from('pagos')
      .update({ estado: 'ANULADO' })
      .eq('id', id)
      .select()
      .single();
    if (error) throw errorDeBase(error);
    return data as Pago;
  },

  // ─── Facturas a crédito con saldo, para el formulario de cobro ─────────────
  // Same client embed as facturaService.getFacturas. Oldest due date first.
  async getFacturasPendientes(): Promise<FacturaPendiente[]> {
    const { data, error } = await supabase
      .from('facturas')
      .select(
        'id_factura, nro_secuencial, fecha_emision, fecha_vencimiento, total_general, saldo_pendiente, ' +
          'cliente:clientes(razon_social, documento)',
      )
      .eq('estado', 'EMITIDA')
      .eq('condicion_venta', CONDICION_VENTA_CREDITO)
      .gt('saldo_pendiente', 0)
      .order('fecha_vencimiento', { ascending: true });
    if (error) throw errorDeBase(error);
    return (data ?? []) as unknown as FacturaPendiente[];
  },
};
