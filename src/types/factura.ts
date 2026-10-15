import type { Database } from './supabase';

// ─── Aliases desde el esquema generado (fuente de verdad) ─────────────────────
// `estado` se agrega a `facturas` vía migración; hasta regenerar supabase.ts se
// declara acá como intersección para no perder el tipado en el módulo.
export type Factura = Database['public']['Tables']['facturas']['Row'] & {
  estado: FacturaEstado;
};
export type FacturaInsert = Database['public']['Tables']['facturas']['Insert'] & {
  estado?: FacturaEstado;
};
export type DetalleFactura = Database['public']['Tables']['detalle_factura']['Row'];
export type DetalleFacturaInsert = Database['public']['Tables']['detalle_factura']['Insert'];
export type Turno = Database['public']['Tables']['apertura_cierre_caja']['Row'];
export type Caja = Database['public']['Tables']['caja']['Row'];

// ─── Máquina de estados de la factura ─────────────────────────────────────────
/** Conjunto canónico de estados de una factura (fuente de verdad). */
export const FACTURA_ESTADOS = ['EMITIDA', 'ANULADA'] as const;
export type FacturaEstado = (typeof FACTURA_ESTADOS)[number];

// ─── View-models de UI (filas con joins embebidos que el tipo generado no cubre) ─
/** Fila del listado de facturas (join con cliente y establecimiento). */
export interface FacturaListItem {
  id_factura: number;
  nro_secuencial: number;
  fecha_emision: string;
  total_general: number;
  estado: string;
  /** 1 = contado, 2 = crédito (see CONDICION_VENTA_*). */
  condicion_venta: number | null;
  fecha_vencimiento: string | null;
  saldo_pendiente: number | null;
  cliente?: { razon_social: string; documento: string } | null;
}

/** Concepto con su tasa de IVA embebida (join conceptos → iva). */
export interface ConceptoConIva {
  id_concepto: number;
  nombre: string;
  arancel: number | null;
  iva?: { valor: number } | null;
}

/** Modo de pago para el selector del formulario. */
export interface ModoPagoItem {
  id_modo_pago: number;
  descripcion: string;
}

/** Motivo de emisión/anulación. */
export interface MotivoItem {
  id_motivos: number;
  descripcion: string;
}

/** Folio cerrado de un cliente puntual, listo para facturar retroactivamente. */
export interface FolioCerradoItem {
  id_folio: number;
  total_acumulado: number;
  reserva?: {
    id_reserva: number;
    fk_cliente: number;
    fecha_entrada: string;
    fecha_salida: string;
  } | null;
}

// ─── Ticket imprimible ─────────────────────────────────────────────────────────
/** Cabecera del ticket: datos del establecimiento y su empresa, sin RUC. */
export interface EstablecimientoTicket {
  denominacion: string;
  direccion: string;
  numero_casa: string;
  complemento_direccion_1: string;
  telefono: string | null;
  email: string | null;
  empresa?: { razon_social: string; nombre_fantasia: string | null } | null;
}

/** Línea del ticket imprimible (sin desglose de IVA). */
export interface LineaTicket {
  id_detalle: number;
  descripcion: string;
  cantidad: number;
  monto: number;
  subtotal: number;
}

/** Datos que consume TicketImprimible. Sin fiscalidad (IVA/timbrado/CDC). */
export interface TicketData {
  establecimiento?: EstablecimientoTicket | null;
  nroSecuencial: number;
  fechaEmision: string;
  clienteNombre: string;
  clienteDocumento?: string | null;
  modoPago?: string | null;
  estado: string;
  lineas: LineaTicket[];
  totalGeneral: number;
  efectivo?: number | null;
  vuelto?: number | null;
}

// ─── Tipo de trabajo del formulario (pre-persistencia) ────────────────────────
/**
 * Línea en construcción dentro del formulario de facturación. Es la entrada del
 * motor de totales; no toca la DB. `fk_cargo_folio` sólo se completa cuando la
 * línea proviene de un cargo de folio (origen check-out).
 */
export interface LineaFactura {
  fk_concepto: number;
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  /** Tasa de IVA de la línea (10 | 5 | 0), tomada de conceptos.fk_iva → iva.valor. */
  ivaRate: number;
  fk_cargo_folio?: number | null;
}

/** `facturas.condicion_venta`: 1 = contado (cash), 2 = credito. */
export const CONDICION_VENTA_CONTADO = 1;
export const CONDICION_VENTA_CREDITO = 2;
