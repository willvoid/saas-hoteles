import { supabase } from './supabaseClient';
import { folioService } from './folioService';
import { calcularTotales, calcularVuelto } from '../utils/facturaTotals';
import { canTransition } from '../utils/facturaEstado';
import {
  CONDICION_VENTA_CONTADO,
  CONDICION_VENTA_CREDITO,
  type Factura,
  type LineaFactura,
} from '../types/factura';

// Valor fijo de esta versión (ticket interno, sin Sifen).
const TIPO_EMISION_NORMAL = 1;

export interface FacturacionDefaults {
  fk_establecimientos: number;
  fk_monedas: number;
  fk_tipo_factura: number;
  // fk_inmueble no tiene FK ni tabla `inmuebles` en el esquema: es un entero
  // NOT NULL sin semántica documentada. Reusamos el id de establecimiento
  // (hotel de una sola propiedad). Aclarar antes de cualquier fase Sifen.
  fk_inmueble: number;
}

export interface CrearFacturaInput {
  fk_cliente: number;
  fk_folio?: number | null;
  /** Null only for credit invoices (the database rejects it for contado). */
  fk_modo_pago: number | null;
  fk_turno: number;
  esEfectivo: boolean;
  efectivo?: number;
  /** Defaults to contado. Credit needs the `contabilidad` module (enforced in the DB). */
  condicion_venta?: typeof CONDICION_VENTA_CONTADO | typeof CONDICION_VENTA_CREDITO;
  /** Optional due date (YYYY-MM-DD); only sent for credit invoices. */
  fecha_vencimiento?: string | null;
  observacion?: string;
  lineas: LineaFactura[];
}

export const facturaService = {
  // Datos de referencia para los dropdowns del formulario, en un solo lugar.
  async getReferencias() {
    const [monedas, tiposFactura, modosPago, motivos, establecimientos, conceptos] =
      await Promise.all([
        supabase.from('monedas').select('*'),
        supabase.from('tipo_factura').select('*'),
        supabase.from('modo_pago').select('*').order('id_modo_pago'),
        supabase.from('motivos_emision').select('*'),
        supabase.from('establecimientos').select('*'),
        supabase.from('conceptos').select('*, iva(valor)').order('nombre'),
      ]);

    return {
      monedas: monedas.data ?? [],
      tiposFactura: tiposFactura.data ?? [],
      modosPago: modosPago.data ?? [],
      motivos: motivos.data ?? [],
      establecimientos: establecimientos.data ?? [],
      conceptos: conceptos.data ?? [],
    };
  },

  // Resuelve los ids por defecto (establecimiento único, moneda PYG, tipo de
  // comprobante interno). La migración sembró estas filas.
  async getFacturacionDefaults(): Promise<FacturacionDefaults> {
    const [{ data: estabs }, { data: monedas }, { data: tipos }] = await Promise.all([
      supabase.from('establecimientos').select('id_establecimiento, estado_establecimiento'),
      supabase.from('monedas').select('id_monedas, divisa'),
      supabase.from('tipo_factura').select('id_tipo_factura, descripcion'),
    ]);

    const estab =
      estabs?.find((e) => (e.estado_establecimiento || '').toLowerCase().includes('activ')) ??
      estabs?.[0];
    if (!estab) throw new Error('No hay establecimientos cargados.');

    const pyg =
      monedas?.find((m) => ['PYG', 'GS'].includes((m.divisa || '').toUpperCase())) ??
      monedas?.[0];
    if (!pyg) throw new Error('No hay una moneda configurada.');

    const tipo =
      tipos?.find((t) => (t.descripcion || '') === 'Ticket interno') ?? tipos?.[0];
    if (!tipo) throw new Error('No hay un tipo de factura configurado.');

    return {
      fk_establecimientos: estab.id_establecimiento,
      fk_monedas: pyg.id_monedas,
      fk_tipo_factura: tipo.id_tipo_factura,
      fk_inmueble: estab.id_establecimiento,
    };
  },

  // Listado de facturas con datos de cliente y establecimiento para la tabla.
  async getFacturas(estado?: string) {
    let query = supabase
      .from('facturas')
      .select('*, cliente:clientes(razon_social, documento), establecimiento:establecimientos(denominacion)')
      .order('fecha_emision', { ascending: false });

    if (estado) query = query.eq('estado', estado);

    const { data, error } = await query;
    if (error) throw error;
    return data;
  },

  // Factura con su detalle (líneas + concepto), cliente y establecimiento,
  // para el detalle y el ticket imprimible. De datos_empresa sólo se pide
  // razon_social/nombre_fantasia -- el RUC se excluye a nivel de query, no
  // sólo ocultado en la UI, porque el ticket interno no debe mostrarlo.
  async getFacturaById(id_factura: number) {
    const { data, error } = await supabase
      .from('facturas')
      .select(`
        *,
        cliente:clientes(*),
        modo_pago:modo_pago(descripcion),
        motivo:motivos_emision(descripcion),
        establecimiento:establecimientos(
          denominacion, direccion, numero_casa, complemento_direccion_1, telefono, email,
          empresa:datos_empresa(razon_social, nombre_fantasia)
        ),
        detalle_factura(*, concepto:conceptos(nombre))
      `)
      .eq('id_factura', id_factura)
      .single();

    if (error) throw error;
    return data;
  },

  // Cargos activos de un folio, listos para facturar (origen check-out).
  async getCargosFacturablesByFolio(fk_folio: number) {
    const { data, error } = await supabase
      .from('cargos_folio')
      .select('*, concepto:conceptos(nombre, fk_iva, iva(valor))')
      .eq('fk_folio', fk_folio)
      .neq('estado', 'INACTIVO');

    if (error) throw error;
    return data ?? [];
  },

  // Emite una factura. Calcula totales con el motor puro, reserva el secuencial
  // de forma atómica (RPC con fallback), inserta cabecera + detalle y, si viene
  // de un folio, lo cierra.
  async crearFactura(input: CrearFacturaInput): Promise<Factura> {
    const defaults = await this.getFacturacionDefaults();
    const totales = calcularTotales(input.lineas);

    const esCredito = input.condicion_venta === CONDICION_VENTA_CREDITO;

    // Credit collects nothing at issue: no cash received, no change.
    const efectivo = esCredito
      ? 0
      : input.esEfectivo
        ? Number(input.efectivo ?? totales.total_general)
        : totales.total_general;
    const vuelto = !esCredito && input.esEfectivo
      ? calcularVuelto(efectivo, totales.total_general)
      : 0;

    const nro_secuencial = await nextNroSecuencial(
      defaults.fk_establecimientos,
      defaults.fk_tipo_factura,
    );

    const { data: factura, error } = await supabase
      .from('facturas')
      .insert({
        fk_cliente: input.fk_cliente,
        fk_folio: input.fk_folio ?? null,
        fk_modo_pago: esCredito ? null : input.fk_modo_pago,
        fk_turno: input.fk_turno,
        fk_establecimientos: defaults.fk_establecimientos,
        fk_monedas: defaults.fk_monedas,
        fk_tipo_factura: defaults.fk_tipo_factura,
        fk_inmueble: defaults.fk_inmueble,
        nro_secuencial,
        condicion_venta: esCredito ? CONDICION_VENTA_CREDITO : CONDICION_VENTA_CONTADO,
        ...(esCredito ? { fecha_vencimiento: input.fecha_vencimiento || null } : {}),
        tipo_emision: TIPO_EMISION_NORMAL,
        estado: 'EMITIDA',
        observacion: input.observacion ?? '',
        // La columna sigue existiendo en el esquema, pero el módulo ya no
        // aplica descuentos: siempre se persiste en 0.
        descuento_global: 0,
        efectivo,
        vuelto,
        total_gravado_10: totales.total_gravado_10,
        total_gravado_5: totales.total_gravado_5,
        total_exenta: totales.total_exenta,
        total_iva: totales.total_iva,
        total_general: totales.total_general,
      })
      .select()
      .single();

    if (error) throw error;

    const detalle = totales.lineas.map((l) => ({
      fk_factura: factura.id_factura,
      fk_concepto: l.fk_concepto,
      fk_cargo_folio: l.fk_cargo_folio ?? null,
      descripcion: l.descripcion,
      cantidad: l.cantidad,
      monto: l.precioUnitario,
      subtotal: l.subtotal,
      iva_aplicado: l.iva_aplicado,
      estado: 'ACTIVO',
    }));

    const { error: detError } = await supabase.from('detalle_factura').insert(detalle);
    if (detError) throw detError;

    // Origen folio: se cierra al emitir para que no se sigan cargando consumos.
    if (input.fk_folio) {
      await folioService.closeFolio(input.fk_folio);
    }

    return factura as Factura;
  },

  // Anula una factura EMITIDA. Valida la transición, marca el estado y el
  // motivo, y si venía de un folio lo reabre para poder re-facturar la estadía.
  async anularFactura(id_factura: number, fk_motivo: number): Promise<Factura> {
    const { data: actual, error: errGet } = await supabase
      .from('facturas')
      .select('estado, fk_folio')
      .eq('id_factura', id_factura)
      .single();

    if (errGet) throw errGet;
    if (!canTransition(actual.estado, 'ANULADA')) {
      throw new Error('La factura no se puede anular en su estado actual.');
    }

    const { data: factura, error } = await supabase
      .from('facturas')
      .update({ estado: 'ANULADA', fk_motivo })
      .eq('id_factura', id_factura)
      .select()
      .single();

    if (error) throw error;

    if (actual.fk_folio) {
      // Los cargos_folio quedan intactos (la factura sólo los referenciaba);
      // reabrir el folio permite volver a facturar la estadía.
      await supabase
        .from('folios')
        .update({ estado: 'abierto' })
        .eq('id_folio', actual.fk_folio);
    }

    return factura as Factura;
  },
};

// Reserva el próximo secuencial vía RPC atómica; si la función no está creada,
// cae a un max()+1 del lado del cliente (misma estrategia que folioService con
// incrementar_total_folio). El fallback tiene una ventana de carrera mínima,
// aceptable para un hotel de una sola caja.
async function nextNroSecuencial(fk_estab: number, fk_tipo: number): Promise<number> {
  const { data, error } = await supabase.rpc('next_nro_secuencial', {
    p_estab: fk_estab,
    p_tipo: fk_tipo,
  });

  if (!error && data != null) return Number(data);

  if (error && !error.message.includes('Could not find the function')) throw error;

  const { data: ultima } = await supabase
    .from('facturas')
    .select('nro_secuencial')
    .eq('fk_establecimientos', fk_estab)
    .eq('fk_tipo_factura', fk_tipo)
    .order('nro_secuencial', { ascending: false })
    .limit(1)
    .maybeSingle();

  return Number(ultima?.nro_secuencial ?? 0) + 1;
}
