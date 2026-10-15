// Pure rules of the create-hotel Edge Function (no Deno/DOM globals).

import {
  documentoError,
  isBlank,
  isPlainObject,
  nombreError,
  parsePositiveInt,
  telefonoError,
} from '../_shared/rules.ts';

// Mirrors the list in fn_provision_tenant (0008); the DB stays authoritative.
export const RESERVED_SLUGS: readonly string[] = [
  'plantilla-base', 'admin', 'api', 'www', 'app', 'auth', 'soporte',
  'support', 'landing', 'static', 'assets', 'login', 'registro',
];

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;
const RUC_RE = /^[0-9]+-[0-9kK]$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const ADMIN_CARGOS: readonly string[] = ['admin', 'administrador'];

export interface CreateHotelInput {
  hotel: { nombre: string; slug: string };
  admin: { nombre: string; documento: string; fk_tipo_doc: number; telefono: string | null };
  empresa: {
    ruc: string;
    razon_social: string;
    nombre_fantasia: string | null;
    fk_contribuyente: number;
    fk_regimen: number;
  };
  establecimiento: {
    direccion: string;
    fk_barrio: number;
    denominacion: string | null;
    numero_casa: string | null;
    complemento_direccion_1: string | null;
    complemento_direccion_2: string | null;
    telefono: string | null;
    email: string | null;
  };
}

export type CreateHotelValidation =
  | { ok: true; value: CreateHotelInput }
  | { ok: false; error: string };

const bad = (error: string): CreateHotelValidation => ({ ok: false, error });

type Section = Record<string, unknown>;

// Required text field: trimmed, within [min, max].
function text(section: Section, key: string, min: number, max: number): string | null {
  const value = section[key];
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length >= min && trimmed.length <= max ? trimmed : null;
}

// Optional text field: blank -> null; undefined result means invalid.
function optionalText(section: Section, key: string, max: number): string | null | undefined {
  const value = section[key];
  if (isBlank(value)) return null;
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length <= max ? trimmed : undefined;
}

export function validateCreateHotelInput(body: unknown): CreateHotelValidation {
  if (!isPlainObject(body)) return bad('Cuerpo inválido.');
  const { hotel, admin, empresa, establecimiento } = body;
  if (![hotel, admin, empresa, establecimiento].every(isPlainObject)) {
    return bad('Faltan campos obligatorios.');
  }
  const h = hotel as Section;
  const a = admin as Section;
  const e = empresa as Section;
  const s = establecimiento as Section;

  const hotelNombre = text(h, 'nombre', 3, 80);
  if (!hotelNombre) return bad('El nombre del hotel debe tener entre 3 y 80 caracteres.');

  const slug = typeof h.slug === 'string' ? h.slug.trim().toLowerCase() : '';
  if (!SLUG_RE.test(slug)) {
    return bad('El identificador debe tener de 3 a 40 caracteres entre a-z, 0-9 y guion.');
  }
  if (RESERVED_SLUGS.includes(slug)) return bad('Ese identificador está reservado.');

  const adminNombre = typeof a.nombre === 'string' ? a.nombre.trim() : '';
  const adminNombreError = nombreError(adminNombre);
  if (adminNombreError) return bad(adminNombreError);

  const tipoDoc = parsePositiveInt(a.fk_tipo_doc);
  if (tipoDoc === null) return bad('El tipo de documento no es válido.');
  const documento = typeof a.documento === 'string' ? a.documento.trim() : '';
  const documentoMsg = documentoError(tipoDoc, documento);
  if (documentoMsg) return bad(documentoMsg);

  const adminTelefono = optionalText(a, 'telefono', 25);
  if (adminTelefono === undefined || (adminTelefono && telefonoError(adminTelefono))) {
    return bad('El teléfono no es válido.');
  }

  const ruc = typeof e.ruc === 'string' ? e.ruc.trim() : '';
  if (ruc.length > 15 || !RUC_RE.test(ruc)) {
    return bad('El RUC debe tener el formato 80012345-6.');
  }
  const razon = text(e, 'razon_social', 3, 120);
  if (!razon) return bad('La razón social debe tener entre 3 y 120 caracteres.');
  const fantasia = optionalText(e, 'nombre_fantasia', 120);
  if (fantasia === undefined) return bad('El nombre de fantasía no es válido.');
  const contribuyente = parsePositiveInt(e.fk_contribuyente);
  const regimen = parsePositiveInt(e.fk_regimen);
  if (contribuyente === null) return bad('El tipo de contribuyente no es válido.');
  if (regimen === null) return bad('El régimen no es válido.');

  const direccion = text(s, 'direccion', 3, 120);
  if (!direccion) return bad('La dirección debe tener entre 3 y 120 caracteres.');
  const barrio = parsePositiveInt(s.fk_barrio);
  if (barrio === null) return bad('El barrio no es válido.');

  const denominacion = optionalText(s, 'denominacion', 80);
  const numeroCasa = optionalText(s, 'numero_casa', 10);
  const comp1 = optionalText(s, 'complemento_direccion_1', 60);
  const comp2 = optionalText(s, 'complemento_direccion_2', 60);
  const estTelefono = optionalText(s, 'telefono', 25);
  const email = optionalText(s, 'email', 100);
  if ([denominacion, numeroCasa, comp1, comp2].includes(undefined)) {
    return bad('Alguno de los datos del establecimiento no es válido.');
  }
  if (estTelefono === undefined || (estTelefono && telefonoError(estTelefono))) {
    return bad('El teléfono del establecimiento no es válido.');
  }
  if (email === undefined || (email && !EMAIL_RE.test(email))) {
    return bad('El correo del establecimiento no es válido.');
  }

  return {
    ok: true,
    value: {
      hotel: { nombre: hotelNombre, slug },
      admin: { nombre: adminNombre, documento, fk_tipo_doc: tipoDoc, telefono: adminTelefono },
      empresa: {
        ruc,
        razon_social: razon,
        nombre_fantasia: fantasia,
        fk_contribuyente: contribuyente,
        fk_regimen: regimen,
      },
      establecimiento: {
        direccion,
        fk_barrio: barrio,
        denominacion: denominacion as string | null,
        numero_casa: numeroCasa as string | null,
        complemento_direccion_1: comp1 as string | null,
        complemento_direccion_2: comp2 as string | null,
        telefono: estTelefono,
        email,
      },
    },
  };
}

// Payload of fn_provision_tenant (0008 header). The admin account is always
// the caller: auth_id never comes from the request body.
export function buildProvisionPayload(input: CreateHotelInput, authId: string) {
  return {
    tenant: { nombre: input.hotel.nombre, slug: input.hotel.slug },
    admin: { auth_id: authId, ...input.admin },
    empresa: input.empresa,
    establecimiento: input.establecimiento,
  };
}

export type Eligibility = { ok: true } | { ok: false; status: number; error: string };

// One entry per active profile of the caller. Only admins of every hotel they
// belong to can open another one, so a staff account created by a hotel's admin
// cannot spawn trial hotels. An account with no hotel can open its first one.
//
// `maxHoteles` comes from fn_max_hoteles_cuenta() (migration 0014): the highest
// hotel limit among the plans of the hotels the account administers. null means
// unlimited. The trigger-level checks in the DB stay authoritative.
export function checkHotelEligibility(
  cargos: readonly string[],
  maxHoteles: number | null,
): Eligibility {
  const normalized = cargos.map((c) => c.trim().toLowerCase());
  if (normalized.some((c) => !ADMIN_CARGOS.includes(c))) {
    return { ok: false, status: 403, error: 'Solo un administrador puede crear hoteles.' };
  }
  if (maxHoteles !== null && normalized.length >= maxHoteles) {
    return {
      ok: false,
      status: 403,
      error: `Tu plan permite un máximo de ${maxHoteles} ${maxHoteles === 1 ? 'hotel' : 'hoteles'} por cuenta. Mejorá tu plan para crear más.`,
    };
  }
  return { ok: true };
}

export interface ProvisionErrorLike {
  code?: string;
  message?: string;
}

// fn_provision_tenant raises Spanish messages with SQLSTATE 23505/23514; map
// them and hide anything else behind a generic message.
export function mapProvisionError(error: ProvisionErrorLike): { status: number; message: string } {
  const message = (error.message ?? '').toLowerCase();
  if (error.code === '23505') {
    if (message.includes('datos_empresa_ruc_key')) {
      return { status: 409, message: 'Ya existe un hotel registrado con ese RUC.' };
    }
    return { status: 409, message: 'Ese identificador ya está en uso o está reservado.' };
  }
  if (error.code === '23514') {
    return {
      status: 400,
      message: 'El identificador debe tener de 3 a 40 caracteres entre a-z, 0-9 y guion.',
    };
  }
  if (error.code === '23503') {
    return { status: 400, message: 'Alguno de los datos seleccionados no existe.' };
  }
  return { status: 500, message: 'No se pudo crear el hotel.' };
}
