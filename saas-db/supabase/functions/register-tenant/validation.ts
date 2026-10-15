// Pure rules of the register-tenant Edge Function (no Deno/DOM globals).

import { EMAIL_RE, validateCreateHotelInput } from '../_shared/hotelInput.ts';
import type { CreateHotelInput } from '../_shared/hotelInput.ts';
import { isPlainObject } from '../_shared/rules.ts';

export interface RegisterInput {
  email: string;
  password: string;
  turnstileToken: string;
  hotel: CreateHotelInput;
}

export type RegisterValidation =
  | { ok: true; value: RegisterInput }
  | { ok: false; error: string };

const bad = (error: string): RegisterValidation => ({ ok: false, error });

const EMAIL_MAX = 254;
const PASSWORD_MIN = 8;
// bcrypt (used by Supabase Auth) ignores bytes past 72.
const PASSWORD_MAX = 72;
const TOKEN_MAX = 2048;

function passwordError(password: unknown): string | null {
  if (typeof password !== 'string') return 'La contraseña no es válida.';
  if (password.length < PASSWORD_MIN) return `La contraseña debe tener al menos ${PASSWORD_MIN} caracteres.`;
  if (password.length > PASSWORD_MAX) return `La contraseña no puede superar los ${PASSWORD_MAX} caracteres.`;
  if (!/\p{L}/u.test(password)) return 'La contraseña debe incluir al menos una letra.';
  if (!/\d/.test(password)) return 'La contraseña debe incluir al menos un número.';
  return null;
}

// The signup email is also the admin account's email, so the body carries no
// separate admin email. The body's `admin` section is validated by the shared
// hotel rules.
export function validateRegisterInput(body: unknown): RegisterValidation {
  if (!isPlainObject(body)) return bad('Cuerpo inválido.');

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (email.length > EMAIL_MAX || !EMAIL_RE.test(email)) {
    return bad('El correo no es válido.');
  }

  const passwordMsg = passwordError(body.password);
  if (passwordMsg) return bad(passwordMsg);

  const token = typeof body.turnstileToken === 'string' ? body.turnstileToken.trim() : '';
  if (token.length === 0 || token.length > TOKEN_MAX) {
    return bad('No se pudo completar la verificación de seguridad.');
  }

  const hotel = validateCreateHotelInput(body);
  if (!hotel.ok) return hotel;

  return {
    ok: true,
    value: { email, password: body.password as string, turnstileToken: token, hotel: hotel.value },
  };
}
