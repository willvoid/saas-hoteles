// Pure validation and authorization rules for the admin-create-user Edge
// Function. No imports and no Deno/DOM globals, so it runs under Deno (the
// function runtime) and under vitest (unit tests).
//
// The field rules mirror src/pages/UsuarioForm.tsx; the server must not trust
// that the browser applied them.

// tipo_documento.cod_tipodoc of the RUC. The frontend hardcodes the same id.
export const RUC_TIPO_DOC_ID = 2;

export const ADMIN_CARGOS: readonly string[] = ['admin', 'administrador'];
export const CREATOR_ROLES: readonly string[] = [...ADMIN_CARGOS, 'gerente'];
// Cargos a tenant can hand out. `cargo` is a global catalog, so an unknown
// name is rejected instead of silently creating an account with no role.
export const STAFF_CARGOS: readonly string[] = [
  ...CREATOR_ROLES,
  'recepcionista',
  'limpiador',
  'limpiadora',
];

export interface CreateUserInput {
  correo: string;
  clave: string;
  nombre: string;
  documento: string;
  telefono: string | null;
  usuario: string;
  fk_tipo_doc: number;
  fk_cargo: number;
}

export type ValidationResult =
  | { ok: true; value: CreateUserInput }
  | { ok: false; error: string };

const NOMBRE_RE = /^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ ]+$/;
const CORREO_RE =
  /^[a-zA-Z0-9]([a-zA-Z0-9._+-]*[a-zA-Z0-9])?@[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z]{2,})+$/;
const USUARIO_RE = /^[a-zA-Z0-9_]+$/;
const TELEFONO_RE = /^[0-9+()\s-]+$/;

export function parsePositiveInt(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value > 0 ? value : null;
  }
  if (typeof value === 'string' && /^\d{1,15}$/.test(value.trim())) {
    const n = Number(value.trim());
    return n > 0 ? n : null;
  }
  return null;
}

function isBlank(value: unknown): boolean {
  return value === undefined || value === null || (typeof value === 'string' && value.trim() === '');
}

export function validateCreateUserInput(body: unknown): ValidationResult {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { ok: false, error: 'Cuerpo inválido.' };
  }
  const raw = body as Record<string, unknown>;

  const required = ['correo', 'clave', 'nombre', 'documento', 'usuario', 'fk_tipo_doc', 'fk_cargo'];
  if (required.some((key) => isBlank(raw[key]))) {
    return { ok: false, error: 'Faltan campos obligatorios.' };
  }

  for (const key of ['correo', 'clave', 'nombre', 'documento', 'usuario']) {
    if (typeof raw[key] !== 'string') {
      return { ok: false, error: 'Los datos enviados no son válidos.' };
    }
  }

  const correo = (raw.correo as string).trim().toLowerCase();
  const clave = raw.clave as string;
  const nombre = (raw.nombre as string).trim();
  const documento = (raw.documento as string).trim();
  const usuario = (raw.usuario as string).trim();

  if (nombre.length < 3) return { ok: false, error: 'El nombre debe tener al menos 3 caracteres.' };
  if (nombre.length > 60) return { ok: false, error: 'El nombre no puede superar los 60 caracteres.' };
  if (!NOMBRE_RE.test(nombre)) {
    return { ok: false, error: 'El nombre solo puede contener letras y espacios.' };
  }

  // The regex alone accepts consecutive dots; UsuarioForm rejects them separately.
  if (correo.length > 100 || !CORREO_RE.test(correo) || correo.includes('..')) {
    return { ok: false, error: 'Ingresa un correo electrónico válido (ej. juan@hotel.com).' };
  }

  if (usuario.length < 4) {
    return { ok: false, error: 'El nombre de usuario debe tener al menos 4 caracteres.' };
  }
  if (usuario.length > 20) {
    return { ok: false, error: 'El nombre de usuario no puede superar los 20 caracteres.' };
  }
  if (!USUARIO_RE.test(usuario)) {
    return { ok: false, error: 'El usuario solo puede contener letras, números y guión bajo (_).' };
  }

  const tipoDoc = parsePositiveInt(raw.fk_tipo_doc);
  if (tipoDoc === null) return { ok: false, error: 'El tipo de documento no es válido.' };

  if (tipoDoc === RUC_TIPO_DOC_ID) {
    if (!documento.includes('-')) return { ok: false, error: 'El RUC debe contener un guión (-).' };
    if (!/^[0-9-]+$/.test(documento)) {
      return { ok: false, error: 'El RUC solo puede contener números y un guión (-).' };
    }
  } else if (!/^\d+$/.test(documento)) {
    return {
      ok: false,
      error: 'El documento solo puede contener números (sin espacios ni guiones).',
    };
  }
  if (documento.length < 5 || documento.length > 15) {
    return { ok: false, error: 'El documento debe tener entre 5 y 15 caracteres.' };
  }

  let telefono: string | null = null;
  if (!isBlank(raw.telefono)) {
    if (typeof raw.telefono !== 'string') {
      return { ok: false, error: 'El teléfono no es válido.' };
    }
    telefono = raw.telefono.trim();
    if (telefono.length > 25 || !TELEFONO_RE.test(telefono)) {
      return { ok: false, error: 'El teléfono no es válido.' };
    }
  }

  if (/\s/.test(clave)) return { ok: false, error: 'La contraseña no puede contener espacios.' };
  if (clave.length < 8) {
    return { ok: false, error: 'La contraseña debe tener al menos 8 caracteres.' };
  }
  if (clave.length > 72) {
    return { ok: false, error: 'La contraseña no puede superar los 72 caracteres.' };
  }
  if (!/[a-zA-Z]/.test(clave) || !/\d/.test(clave)) {
    return { ok: false, error: 'La contraseña debe incluir al menos una letra y un número.' };
  }

  const cargo = parsePositiveInt(raw.fk_cargo);
  if (cargo === null) return { ok: false, error: 'El cargo no es válido.' };

  return {
    ok: true,
    value: { correo, clave, nombre, documento, telefono, usuario, fk_tipo_doc: tipoDoc, fk_cargo: cargo },
  };
}

export function normalizeCargo(name: unknown): string {
  return typeof name === 'string' ? name.trim().toLowerCase() : '';
}

export function canCreateUsers(callerRole: unknown): boolean {
  return CREATOR_ROLES.includes(normalizeCargo(callerRole));
}

export function isStaffCargo(cargoName: unknown): boolean {
  return STAFF_CARGOS.includes(normalizeCargo(cargoName));
}

// Only an administrator may grant the administrator cargo. A gerente can create
// every other staff cargo. The guard_cargo_admin trigger (0005) is a second
// line; it does not fire for service_role writes, so this check is required.
export function canAssignCargo(callerRole: unknown, cargoName: unknown): boolean {
  if (!canCreateUsers(callerRole) || !isStaffCargo(cargoName)) return false;
  if (ADMIN_CARGOS.includes(normalizeCargo(cargoName))) {
    return ADMIN_CARGOS.includes(normalizeCargo(callerRole));
  }
  return true;
}

// `%`, `_` and `\` are ilike wildcards/escapes: escape them so an ilike filter
// matches the literal value exactly.
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}

export interface AuthErrorLike {
  code?: string;
  status?: number;
}

export function mapAuthCreateError(error: AuthErrorLike): { status: number; message: string } {
  switch (error.code) {
    case 'email_exists':
    case 'user_already_exists':
      return { status: 409, message: 'Ya existe una cuenta con ese correo.' };
    case 'weak_password':
      return { status: 400, message: 'La contraseña es demasiado débil.' };
    case 'email_address_invalid':
      return { status: 400, message: 'El correo electrónico no es válido.' };
    case 'over_request_rate_limit':
      return { status: 429, message: 'Demasiados intentos. Espera un momento y reintenta.' };
    default:
      return error.status === 429
        ? { status: 429, message: 'Demasiados intentos. Espera un momento y reintenta.' }
        : { status: 500, message: 'No se pudo crear la cuenta.' };
  }
}
