// Pure rules shared by the multi-hotel Edge Functions. No imports and no
// Deno/DOM globals, so it runs under Deno and under vitest.
//
// Field rules mirror src/pages/UsuarioForm.tsx and EmpresaForm.tsx; the server
// must not trust that the browser applied them.

// tipo_documento.cod_tipodoc of the RUC. The frontend hardcodes the same id.
export const RUC_TIPO_DOC_ID = 2;

const NOMBRE_RE = /^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ ]+$/;
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

export function isBlank(value: unknown): boolean {
  return value === undefined || value === null || (typeof value === 'string' && value.trim() === '');
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Each validator returns an error message in Spanish, or null when valid.
export function nombreError(value: string): string | null {
  if (value.length < 3) return 'El nombre debe tener al menos 3 caracteres.';
  if (value.length > 60) return 'El nombre no puede superar los 60 caracteres.';
  if (!NOMBRE_RE.test(value)) return 'El nombre solo puede contener letras y espacios.';
  return null;
}

export function documentoError(tipoDoc: number, value: string): string | null {
  if (tipoDoc === RUC_TIPO_DOC_ID) {
    if (!value.includes('-')) return 'El RUC debe contener un guión (-).';
    if (!/^[0-9-]+$/.test(value)) return 'El RUC solo puede contener números y un guión (-).';
  } else if (!/^\d+$/.test(value)) {
    return 'El documento solo puede contener números (sin espacios ni guiones).';
  }
  if (value.length < 5 || value.length > 15) return 'El documento debe tener entre 5 y 15 caracteres.';
  return null;
}

export function telefonoError(value: string): string | null {
  return value.length > 25 || !TELEFONO_RE.test(value) ? 'El teléfono no es válido.' : null;
}
