import type { Database } from './supabase';

type Tablas = Database['public']['Tables'];
type Funciones = Database['public']['Functions'];

/** Row type with some string columns narrowed to their literal unions. */
type Estrechar<R, O> = Omit<R, keyof O> & O;

// ─── Unions that the database enforces with CHECK constraints ────────────────
/** `estado` of gastos, cobros, pagos, transferencias and saldos iniciales. */
export type EstadoDocumento = 'REGISTRADO' | 'ANULADO';
export type CondicionGasto = 'contado' | 'credito';
export type TipoCategoria = 'ingreso' | 'egreso';
export type TipoFondo = 'caja_turno' | 'caja_chica' | 'banco';
export type BucketVencimiento = 'vigente' | '1-30' | '31-60' | '61-90' | '+90';

// ─── Table rows ──────────────────────────────────────────────────────────────
export type Proveedor = Tablas['proveedores']['Row'];
export type CategoriaFinanzas = Estrechar<Tablas['categorias_finanzas']['Row'], { tipo: TipoCategoria }>;
export type CuentaFondo = Estrechar<Tablas['cuentas_fondos']['Row'], { tipo: TipoFondo }>;
export type MedioPagoFondo = Tablas['medios_pago_fondo']['Row'];
export type Gasto = Estrechar<
  Tablas['gastos']['Row'],
  { estado: EstadoDocumento; condicion: CondicionGasto }
>;
export type Cobro = Estrechar<Tablas['cobros']['Row'], { estado: EstadoDocumento }>;
export type Pago = Estrechar<Tablas['pagos']['Row'], { estado: EstadoDocumento }>;
export type TransferenciaFondos = Estrechar<
  Tablas['transferencias_fondos']['Row'],
  { estado: EstadoDocumento }
>;
export type SaldoInicialFondo = Estrechar<
  Tablas['saldos_iniciales_fondos']['Row'],
  { estado: EstadoDocumento }
>;
export type PeriodoCerrado = Tablas['periodos_cerrados']['Row'];

/** Year/month pair identifying an accounting period. */
export interface Periodo {
  anio: number;
  mes: number;
}

// ─── Client-settable columns (the database computes the rest) ────────────────
export interface ProveedorInput {
  nombre: string;
  ruc?: string | null;
  telefono?: string | null;
  email?: string | null;
}

export interface CategoriaInput {
  nombre: string;
  tipo: TipoCategoria;
  fk_cuenta_contable: number;
}

export interface FondoInput {
  nombre: string;
  tipo: TipoFondo;
  fk_caja?: number | null;
  /** Filled by a trigger when omitted. */
  fk_cuenta_contable?: number;
}

export interface MedioPagoFondoInput {
  fk_modo_pago: number;
  fk_fondo: number;
}

/** iva_10, iva_5, total, saldo_pendiente and estado are computed by trigger. */
export interface GastoNuevo {
  fecha?: string;
  /** First establishment of the hotel when omitted. */
  fk_establecimientos?: number;
  fk_proveedor?: number | null;
  fk_categoria: number;
  nro_comprobante?: string | null;
  gravado_10?: number;
  gravado_5?: number;
  exenta?: number;
  condicion: CondicionGasto;
  fecha_vencimiento?: string | null;
  /** Required for cash expenses, forbidden for credit ones. */
  fk_cuenta_fondo?: number | null;
  observacion?: string | null;
}

export interface CobroNuevo {
  fk_factura: number;
  fk_cuenta_fondo: number;
  monto: number;
  fecha?: string;
  observacion?: string | null;
}

export interface PagoNuevo {
  fk_gasto: number;
  fk_cuenta_fondo: number;
  monto: number;
  fecha?: string;
  observacion?: string | null;
}

export interface TransferenciaNueva {
  fk_fondo_origen: number;
  fk_fondo_destino: number;
  monto: number;
  fecha?: string;
  fk_establecimientos?: number;
  observacion?: string | null;
}

export interface SaldoInicialNuevo {
  fk_cuenta_fondo: number;
  monto: number;
  fecha?: string;
  fk_establecimientos?: number;
  observacion?: string | null;
}

// ─── Joined rows used by the lists ───────────────────────────────────────────
export interface GastoListado extends Gasto {
  proveedor: { id: number; nombre: string; ruc: string | null } | null;
  categoria: { id: number; nombre: string } | null;
  fondo: { id: number; nombre: string } | null;
}

export interface CobroListado extends Cobro {
  fondo: { nombre: string } | null;
  factura: {
    nro_secuencial: number;
    cliente: { razon_social: string } | null;
  } | null;
}

export interface PagoListado extends Pago {
  fondo: { nombre: string } | null;
  gasto: {
    nro_comprobante: string | null;
    proveedor: { nombre: string } | null;
  } | null;
}

/** Credit invoice still owing money, for the collection form. */
export interface FacturaPendiente {
  id_factura: number;
  nro_secuencial: number;
  fecha_emision: string;
  fecha_vencimiento: string | null;
  total_general: number;
  saldo_pendiente: number;
  cliente: { razon_social: string; documento: string } | null;
}

// ─── Report RPC rows, exactly as returned ────────────────────────────────────
export type FilaResultado = Estrechar<
  Funciones['fn_rep_resultado']['Returns'][number],
  { tipo: TipoCategoria }
>;
export type FilaCxc = Estrechar<
  Funciones['fn_rep_cxc']['Returns'][number],
  { bucket: BucketVencimiento }
>;
export type FilaCxp = Estrechar<
  Funciones['fn_rep_cxp']['Returns'][number],
  { bucket: BucketVencimiento }
>;
export type FilaFlujoFondos = Estrechar<
  Funciones['fn_rep_flujo_fondos']['Returns'][number],
  { tipo: TipoFondo }
>;
export type FilaMovimientoFondo = Funciones['fn_rep_movimientos_fondo']['Returns'][number];
export type FilaLibroIva = Funciones['fn_rep_libro_iva']['Returns'][number];
