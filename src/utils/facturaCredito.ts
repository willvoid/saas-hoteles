import { CONDICION_VENTA_CREDITO } from '../types/factura';

// Pure rules for credit sales (invoices on account). The database enforces the
// real constraints; these helpers only drive the UI.

/**
 * Credit needs the `contabilidad` module and an identified client. The invoice
 * form always asks for a client picked from the list (there is no anonymous
 * default), so "identified" means a real client id was chosen.
 */
export function puedeFacturarACredito(params: {
  modulos: { contabilidad: boolean };
  cliente: number | '' | null | undefined;
}): boolean {
  return params.modulos.contabilidad && typeof params.cliente === 'number' && params.cliente > 0;
}

const FECHA_ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Validates the optional due date. Returns an error message, or null when the
 * date is empty (optional) or not before the emission day. `emision` may be a
 * plain date or a timestamp: only its date part is compared.
 */
export function validarVencimiento(emision: string, vencimiento: string): string | null {
  if (!vencimiento) return null;
  if (!FECHA_ISO.test(vencimiento)) return 'La fecha de vencimiento no es válida.';
  if (vencimiento < emision.slice(0, 10)) {
    return 'El vencimiento no puede ser anterior a la fecha de emisión.';
  }
  return null;
}

/** Credit invoice, still emitted and with money owed. */
export function esPendiente(factura: {
  condicion_venta?: number | null;
  estado: string;
  saldo_pendiente?: number | null;
}): boolean {
  return (
    factura.condicion_venta === CONDICION_VENTA_CREDITO &&
    factura.estado === 'EMITIDA' &&
    Number(factura.saldo_pendiente ?? 0) > 0
  );
}

/**
 * Message of a thrown value. Supabase errors are not always `Error` instances,
 * so any object with a string `message` counts; the database text (e.g. the
 * Spanish "Anule primero los cobros") is shown as is.
 */
export function mensajeDeError(err: unknown, fallback: string): string {
  if (typeof err === 'object' && err !== null && 'message' in err) {
    const { message } = err as { message: unknown };
    if (typeof message === 'string' && message) return message;
  }
  return fallback;
}

/** Label of `facturas.condicion_venta`; legacy or unknown values read as contado. */
export function etiquetaCondicion(condicion: number | null | undefined): string {
  return condicion === CONDICION_VENTA_CREDITO ? 'Crédito' : 'Contado';
}
