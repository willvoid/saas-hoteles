// Pure rules of the hotel selector and the create-hotel form. The create-hotel
// Edge Function applies the same rules again server-side
// (saas-db/supabase/functions/create-hotel/validation.ts): they are duplicated
// on purpose because the two runtimes cannot share a module.

import type { HotelResumen } from '../types/hotel';

// tipo_documento.cod_tipodoc of the RUC (same id UsuarioForm hardcodes).
export const RUC_TIPO_DOC_ID = 2;

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;
const RUC_RE = /^[0-9]+-[0-9kK]$/;
const NOMBRE_RE = /^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ ]+$/;
const TELEFONO_RE = /^[0-9+()\s-]+$/;

export const RESERVED_SLUGS: readonly string[] = [
  'plantilla-base', 'admin', 'api', 'www', 'app', 'auth', 'soporte',
  'support', 'landing', 'static', 'assets', 'login', 'registro',
];

// "Hotel Sol y Luna" -> "hotel-sol-y-luna". Strips accents, keeps a-z and 0-9,
// and caps the length at the 40 characters the tenants.slug check allows.
export function slugify(nombre: string): string {
  return nombre
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+/, '')
    .slice(0, 40)
    .replace(/-+$/, '');
}

export interface HotelForm {
  nombre: string;
  slug: string;
  razonSocial: string;
  nombreFantasia: string;
  ruc: string;
  fkContribuyente: string;
  fkRegimen: string;
  direccion: string;
  fkBarrio: string;
  adminNombre: string;
  adminTipoDoc: string;
  adminDocumento: string;
  adminTelefono: string;
}

export const EMPTY_HOTEL_FORM: HotelForm = {
  nombre: '',
  slug: '',
  razonSocial: '',
  nombreFantasia: '',
  ruc: '',
  fkContribuyente: '',
  fkRegimen: '',
  direccion: '',
  fkBarrio: '',
  adminNombre: '',
  adminTipoDoc: '',
  adminDocumento: '',
  adminTelefono: '',
};

// Same order the fields appear on screen: the first error wins.
export const HOTEL_FORM_ORDER: readonly (keyof HotelForm)[] = [
  'nombre', 'slug', 'razonSocial', 'nombreFantasia', 'ruc', 'fkContribuyente',
  'fkRegimen', 'direccion', 'fkBarrio', 'adminNombre', 'adminTipoDoc',
  'adminDocumento', 'adminTelefono',
];

export interface FormError {
  campo: keyof HotelForm;
  mensaje: string;
}

const toId = (value: string): number | null => (/^\d+$/.test(value.trim()) ? Number(value) : null);

export function validateHotelForm(form: HotelForm): FormError | null {
  const err = (campo: keyof HotelForm, mensaje: string): FormError => ({ campo, mensaje });

  const nombre = form.nombre.trim();
  if (nombre.length < 3 || nombre.length > 80) {
    return err('nombre', 'El nombre del hotel debe tener entre 3 y 80 caracteres.');
  }

  const slug = form.slug.trim().toLowerCase();
  if (!SLUG_RE.test(slug)) {
    return err('slug', 'El identificador debe tener de 3 a 40 caracteres entre a-z, 0-9 y guion.');
  }
  if (RESERVED_SLUGS.includes(slug)) return err('slug', 'Ese identificador está reservado.');

  const razon = form.razonSocial.trim();
  if (razon.length < 3 || razon.length > 120) {
    return err('razonSocial', 'La razón social debe tener entre 3 y 120 caracteres.');
  }
  if (form.nombreFantasia.trim().length > 120) {
    return err('nombreFantasia', 'El nombre de fantasía no puede superar los 120 caracteres.');
  }

  const ruc = form.ruc.trim();
  if (ruc.length > 12 || !RUC_RE.test(ruc)) {
    return err('ruc', 'El RUC debe tener el formato 80012345-6.');
  }
  if (toId(form.fkContribuyente) === null) {
    return err('fkContribuyente', 'Seleccioná el tipo de contribuyente.');
  }
  if (toId(form.fkRegimen) === null) return err('fkRegimen', 'Seleccioná el régimen.');

  const direccion = form.direccion.trim();
  if (direccion.length < 3 || direccion.length > 120) {
    return err('direccion', 'La dirección debe tener entre 3 y 120 caracteres.');
  }
  if (toId(form.fkBarrio) === null) return err('fkBarrio', 'Seleccioná el barrio.');

  const adminNombre = form.adminNombre.trim();
  if (adminNombre.length < 3) return err('adminNombre', 'Tu nombre debe tener al menos 3 caracteres.');
  if (adminNombre.length > 60) return err('adminNombre', 'Tu nombre no puede superar los 60 caracteres.');
  if (!NOMBRE_RE.test(adminNombre)) {
    return err('adminNombre', 'Tu nombre solo puede contener letras y espacios.');
  }

  const tipoDoc = toId(form.adminTipoDoc);
  if (tipoDoc === null) return err('adminTipoDoc', 'Seleccioná el tipo de documento.');

  const documento = form.adminDocumento.trim();
  if (tipoDoc === RUC_TIPO_DOC_ID) {
    if (!documento.includes('-')) return err('adminDocumento', 'El RUC debe contener un guión (-).');
    if (!/^[0-9-]+$/.test(documento)) {
      return err('adminDocumento', 'El RUC solo puede contener números y un guión (-).');
    }
  } else if (!/^\d+$/.test(documento)) {
    return err('adminDocumento', 'El documento solo puede contener números (sin espacios ni guiones).');
  }
  if (documento.length < 5 || documento.length > 15) {
    return err('adminDocumento', 'El documento debe tener entre 5 y 15 caracteres.');
  }

  const telefono = form.adminTelefono.trim();
  if (telefono && (telefono.length > 25 || !TELEFONO_RE.test(telefono))) {
    return err('adminTelefono', 'El teléfono no es válido.');
  }

  return null;
}

// Body of the create-hotel Edge Function. Call only after validateHotelForm
// returned null.
export function buildCreateHotelPayload(form: HotelForm) {
  const trimmed = (value: string) => value.trim();
  const optional = (value: string) => trimmed(value) || null;

  return {
    hotel: { nombre: trimmed(form.nombre), slug: trimmed(form.slug).toLowerCase() },
    admin: {
      nombre: trimmed(form.adminNombre),
      documento: trimmed(form.adminDocumento),
      fk_tipo_doc: Number(form.adminTipoDoc),
      telefono: optional(form.adminTelefono),
    },
    empresa: {
      ruc: trimmed(form.ruc),
      razon_social: trimmed(form.razonSocial),
      nombre_fantasia: optional(form.nombreFantasia),
      fk_contribuyente: Number(form.fkContribuyente),
      fk_regimen: Number(form.fkRegimen),
    },
    establecimiento: {
      direccion: trimmed(form.direccion),
      fk_barrio: Number(form.fkBarrio),
    },
  };
}

export type CreateHotelPayload = ReturnType<typeof buildCreateHotelPayload>;

export type EstadoTono = 'ok' | 'warn' | 'bad';

// Only trial and active hotels can be entered (same rule as switch-hotel).
export function puedeEntrarAlHotel(hotel: Pick<HotelResumen, 'estado'>): boolean {
  return ['trial', 'activo'].includes(hotel.estado.trim().toLowerCase());
}

export function describirEstadoHotel(
  hotel: Pick<HotelResumen, 'estado' | 'trial_fin'>,
): { texto: string; tono: EstadoTono } {
  const estado = hotel.estado.trim().toLowerCase();
  if (estado === 'suspendido') return { texto: 'Suspendido', tono: 'bad' };
  if (estado === 'trial') {
    const [anio, mes, dia] = (hotel.trial_fin ?? '').split('-');
    return anio && mes && dia
      ? { texto: `Prueba hasta ${dia}/${mes}/${anio}`, tono: 'warn' }
      : { texto: 'Prueba', tono: 'warn' };
  }
  return { texto: 'Activo', tono: 'ok' };
}
