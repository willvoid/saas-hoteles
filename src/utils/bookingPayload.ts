// Pure helpers for the public booking submit flow: validation of the client
// form and construction of the payload sent to the landing RPC. No React and
// no services here, so everything is unit-testable.

import type { BookingCliente, BookingDetalle, BookingPayload } from '../types/booking';
import { separarTelefono, validarCodigoPais, validarNumero } from './telefono';
import { RUC_TIPO_DOC_VALUE, validarDocumentoPorTipo, validarEmail } from './diccionarioValidaciones';

/** The select can hold the literal 'RUC' or an empty string, so the shared type is widened. */
export type ClientFormInput = Omit<BookingCliente, 'fk_tipo_documento'> & {
  fk_tipo_documento?: string | number | null;
};

export interface BuildBookingPayloadInput {
  form: ClientFormInput;
  observaciones: string;
  bookingData: Partial<BookingPayload>;
}

export const SUBMIT_REQUIRED_FIELDS_ERROR = 'Por favor completa los campos obligatorios (*).';

/**
 * RUC is not a real fk_tipo_documento in the reference table, so null is sent
 * and the RPC casts the rest to bigint. Any other value goes through Number(),
 * which yields NaN/0 for empty or undefined input (kept as-is on purpose).
 */
export function sanitizeTipoDocumento(value: string | number | null | undefined): number | null {
  return String(value) === RUC_TIPO_DOC_VALUE ? null : Number(value);
}

/** Returns new detalles with every guest's fk_tipo_documento sanitized. Never mutates the input. */
export function sanitizeDetalles(detalles: BookingDetalle[] | undefined): BookingDetalle[] {
  return (detalles || []).map((det) => ({
    ...det,
    huespedes: (det.huespedes || []).map((h) => ({
      ...h,
      // BookingHuesped types fk_tipo_documento as number, but RUC must be sent as null.
      fk_tipo_documento: sanitizeTipoDocumento(h.fk_tipo_documento) as unknown as number,
    })),
  }));
}

/** First validation error in the original order, or null when the form is valid. */
export function validateClientForm(form: ClientFormInput): string | null {
  const tipoDoc = String(form.fk_tipo_documento ?? '');

  // Email is optional; the rest of the basic fields are required.
  if (!form.razon_social || !tipoDoc || !form.documento || !form.telefono) {
    return SUBMIT_REQUIRED_FIELDS_ERROR;
  }

  const documentoError = validarDocumentoPorTipo(form.documento, tipoDoc);
  if (documentoError) return documentoError;

  if (form.email.trim()) {
    const emailError = validarEmail(form.email.trim());
    if (emailError) return emailError;
  }

  const fijo = separarTelefono(form.telefono, 'fijo');
  const telefonoError =
    validarCodigoPais(fijo.codigo, fijo.numero) || validarNumero(fijo.numero, fijo.codigo, 'fijo');
  if (telefonoError) return `Teléfono: ${telefonoError}`;

  const movil = separarTelefono(form.celular, 'celular');
  const celularError =
    validarCodigoPais(movil.codigo, movil.numero) || validarNumero(movil.numero, movil.codigo, 'celular');
  if (celularError) return `Celular: ${celularError}`;

  return null;
}

/** Builds the RPC payload. Assumes the form already passed validateClientForm. */
export function buildBookingPayload({ form, observaciones, bookingData }: BuildBookingPayloadInput): BookingPayload {
  return {
    fecha_entrada: bookingData.fecha_entrada as string,
    fecha_salida: bookingData.fecha_salida as string,
    origen: 'WEB',
    observaciones,
    cliente: {
      ...form,
      // Same type gap as in sanitizeDetalles: null for RUC, number otherwise.
      fk_tipo_documento: sanitizeTipoDocumento(String(form.fk_tipo_documento ?? '')) as unknown as number,
    },
    detalles: sanitizeDetalles(bookingData.detalles),
  };
}
