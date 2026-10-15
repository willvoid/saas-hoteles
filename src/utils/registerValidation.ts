// Pure per-step validators of the public sign-up wizard. They mirror the
// server rules of the register-tenant Edge Function (the server stays
// authoritative). Slug helpers and the RUC document id come from ./hotel.

import { RESERVED_SLUGS, RUC_TIPO_DOC_ID } from './hotel';

export interface RegisterValues {
  email: string;
  password: string;
  nombre: string;
  tipoDoc: string;
  documento: string;
  telefono: string;
  hotelNombre: string;
  slug: string;
  razonSocial: string;
  nombreFantasia: string;
  ruc: string;
  fkContribuyente: string;
  fkRegimen: string;
  direccion: string;
  departamento: string;
  distrito: string;
  ciudad: string;
  fkBarrio: string;
}

export type RegisterField = keyof RegisterValues;
export type StepErrors = Partial<Record<RegisterField, string>>;

export const EMPTY_REGISTER_VALUES: RegisterValues = {
  email: '',
  password: '',
  nombre: '',
  tipoDoc: '',
  documento: '',
  telefono: '',
  hotelNombre: '',
  slug: '',
  razonSocial: '',
  nombreFantasia: '',
  ruc: '',
  fkContribuyente: '',
  fkRegimen: '',
  direccion: '',
  departamento: '',
  distrito: '',
  ciudad: '',
  fkBarrio: '',
};

// Screen order of each step: used to focus the first invalid field.
export const ACCOUNT_FIELDS: readonly RegisterField[] = [
  'email', 'password', 'nombre', 'tipoDoc', 'documento', 'telefono',
];
export const HOTEL_FIELDS: readonly RegisterField[] = ['hotelNombre', 'slug'];
export const COMPANY_FIELDS: readonly RegisterField[] = [
  'razonSocial', 'nombreFantasia', 'ruc', 'fkContribuyente', 'fkRegimen',
  'direccion', 'departamento', 'distrito', 'ciudad', 'fkBarrio',
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;
const RUC_RE = /^[0-9]+-[0-9kK]$/;
const NOMBRE_RE = /^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ ]+$/;
const TELEFONO_RE = /^[0-9+()\s-]+$/;

const PASSWORD_MIN = 8;
// bcrypt ignores bytes past 72.
const PASSWORD_MAX = 72;

const isId = (value: string): boolean => /^\d+$/.test(value.trim());

function passwordError(password: string): string | undefined {
  if (password.length < PASSWORD_MIN) return `La contraseña debe tener al menos ${PASSWORD_MIN} caracteres.`;
  if (password.length > PASSWORD_MAX) return `La contraseña no puede superar los ${PASSWORD_MAX} caracteres.`;
  if (!/\p{L}/u.test(password)) return 'La contraseña debe incluir al menos una letra.';
  if (!/\d/.test(password)) return 'La contraseña debe incluir al menos un número.';
  return undefined;
}

function documentoError(tipoDoc: number, value: string): string | undefined {
  if (tipoDoc === RUC_TIPO_DOC_ID) {
    if (!value.includes('-')) return 'El RUC debe contener un guión (-).';
    if (!/^[0-9-]+$/.test(value)) return 'El RUC solo puede contener números y un guión (-).';
  } else if (!/^\d+$/.test(value)) {
    return 'El documento solo puede contener números (sin espacios ni guiones).';
  }
  if (value.length < 5 || value.length > 15) return 'El documento debe tener entre 5 y 15 caracteres.';
  return undefined;
}

export function validateAccountStep(v: RegisterValues): StepErrors {
  const errors: StepErrors = {};

  const email = v.email.trim();
  if (!email) errors.email = 'Ingresá tu correo electrónico.';
  else if (email.length > 254 || !EMAIL_RE.test(email)) errors.email = 'El correo no es válido.';

  const pass = passwordError(v.password);
  if (pass) errors.password = pass;

  const nombre = v.nombre.trim();
  if (nombre.length < 3) errors.nombre = 'Tu nombre debe tener al menos 3 caracteres.';
  else if (nombre.length > 60) errors.nombre = 'Tu nombre no puede superar los 60 caracteres.';
  else if (!NOMBRE_RE.test(nombre)) errors.nombre = 'Tu nombre solo puede contener letras y espacios.';

  if (!isId(v.tipoDoc)) {
    errors.tipoDoc = 'Seleccioná el tipo de documento.';
  } else {
    const msg = documentoError(Number(v.tipoDoc), v.documento.trim());
    if (msg) errors.documento = msg;
  }

  const telefono = v.telefono.trim();
  if (telefono && (telefono.length > 25 || !TELEFONO_RE.test(telefono))) {
    errors.telefono = 'El teléfono no es válido.';
  }

  return errors;
}

export function validateHotelStep(v: RegisterValues): StepErrors {
  const errors: StepErrors = {};

  const nombre = v.hotelNombre.trim();
  if (nombre.length < 3 || nombre.length > 80) {
    errors.hotelNombre = 'El nombre del hotel debe tener entre 3 y 80 caracteres.';
  }

  const slug = v.slug.trim().toLowerCase();
  if (!SLUG_RE.test(slug)) {
    errors.slug = 'El identificador debe tener de 3 a 40 caracteres entre a-z, 0-9 y guion.';
  } else if (RESERVED_SLUGS.includes(slug)) {
    errors.slug = 'Ese identificador está reservado.';
  }

  return errors;
}

export function validateCompanyStep(v: RegisterValues): StepErrors {
  const errors: StepErrors = {};

  const razon = v.razonSocial.trim();
  if (razon.length < 3 || razon.length > 120) {
    errors.razonSocial = 'La razón social debe tener entre 3 y 120 caracteres.';
  }
  if (v.nombreFantasia.trim().length > 120) {
    errors.nombreFantasia = 'El nombre de fantasía no puede superar los 120 caracteres.';
  }

  const ruc = v.ruc.trim();
  if (ruc.length > 15 || !RUC_RE.test(ruc)) errors.ruc = 'El RUC debe tener el formato 80012345-6.';

  if (!isId(v.fkContribuyente)) errors.fkContribuyente = 'Seleccioná el tipo de contribuyente.';
  if (!isId(v.fkRegimen)) errors.fkRegimen = 'Seleccioná el régimen.';

  const direccion = v.direccion.trim();
  if (direccion.length < 3 || direccion.length > 120) {
    errors.direccion = 'La dirección debe tener entre 3 y 120 caracteres.';
  }
  if (!isId(v.fkBarrio)) errors.fkBarrio = 'Seleccioná el barrio.';

  return errors;
}

export interface PasswordStrength {
  // 0 empty, 1 weak, 2 acceptable, 3 strong.
  level: 0 | 1 | 2 | 3;
  label: string;
}

export function passwordStrength(password: string): PasswordStrength {
  if (!password) return { level: 0, label: '' };
  if (passwordError(password)) return { level: 1, label: 'Débil' };
  const classes = [/\p{Ll}/u, /\p{Lu}/u, /\d/, /[^\p{L}\d]/u].filter((re) => re.test(password)).length;
  if (password.length >= 12 && classes >= 3) return { level: 3, label: 'Fuerte' };
  return { level: 2, label: 'Aceptable' };
}
