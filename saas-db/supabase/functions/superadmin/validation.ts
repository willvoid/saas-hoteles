// Pure input rules for the superadmin finance actions. No imports from Deno or
// the DOM, so it runs under Deno and under vitest.

import { isPlainObject } from '../_shared/rules.ts';

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

export const TIPOS = ['ingreso', 'egreso'] as const;
export type Tipo = (typeof TIPOS)[number];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const NOMBRE_MAX = 60;
const DESCRIPCION_MAX = 500;
const REFERENCIA_MAX = 200;
const MONTO_MAX = 99_999_999_999_999; // numeric(14,0)

const bad = (error: string): { ok: false; error: string } => ({ ok: false, error });

export function validateId(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

function isRealDate(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

function isTipo(value: unknown): value is Tipo {
  return typeof value === 'string' && (TIPOS as readonly string[]).includes(value);
}

function isMonto(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && value <= MONTO_MAX;
}

export function validateDateRange(body: unknown): Result<{ desde: string; hasta: string }> {
  if (!isPlainObject(body)) return bad('Cuerpo inválido.');
  const { desde, hasta } = body;
  if (!isRealDate(desde) || !isRealDate(hasta)) return bad('Fechas inválidas: usar AAAA-MM-DD.');
  if (desde > hasta) return bad('"desde" no puede ser posterior a "hasta".');
  return { ok: true, value: { desde, hasta } };
}

export function validateListFilters(
  body: unknown,
): Result<{ desde: string; hasta: string; tipo: Tipo | null; categoria_id: string | null }> {
  const range = validateDateRange(body);
  if (!range.ok) return range;
  const b = body as Record<string, unknown>;
  let tipo: Tipo | null = null;
  if (b.tipo !== undefined && b.tipo !== null) {
    if (!isTipo(b.tipo)) return bad('Tipo inválido.');
    tipo = b.tipo;
  }
  let categoria_id: string | null = null;
  if (b.categoria_id !== undefined && b.categoria_id !== null) {
    if (!validateId(b.categoria_id)) return bad('Categoría inválida.');
    categoria_id = b.categoria_id;
  }
  return { ok: true, value: { ...range.value, tipo, categoria_id } };
}

function optionalText(value: unknown, max: number, label: string): Result<string | null> {
  if (value === undefined || value === null) return { ok: true, value: null };
  if (typeof value !== 'string') return bad(`${label} inválida.`);
  const trimmed = value.trim();
  if (trimmed.length > max) return bad(`${label} no puede superar los ${max} caracteres.`);
  return { ok: true, value: trimmed || null };
}

export interface MovimientoInput {
  tipo: Tipo;
  categoria_id: string;
  monto: number;
  fecha: string;
  descripcion: string | null;
  referencia: string | null;
}

export function validateMovimientoInput(body: unknown): Result<MovimientoInput> {
  if (!isPlainObject(body)) return bad('Cuerpo inválido.');
  if (!isTipo(body.tipo)) return bad('Tipo inválido: usar ingreso o egreso.');
  if (!validateId(body.categoria_id)) return bad('Categoría inválida.');
  if (!isMonto(body.monto)) return bad('El monto debe ser un entero positivo.');
  if (!isRealDate(body.fecha)) return bad('Fecha inválida: usar AAAA-MM-DD.');
  const descripcion = optionalText(body.descripcion, DESCRIPCION_MAX, 'Descripción');
  if (!descripcion.ok) return descripcion;
  const referencia = optionalText(body.referencia, REFERENCIA_MAX, 'Referencia');
  if (!referencia.ok) return referencia;
  return {
    ok: true,
    value: {
      tipo: body.tipo,
      categoria_id: body.categoria_id,
      monto: body.monto,
      fecha: body.fecha,
      descripcion: descripcion.value,
      referencia: referencia.value,
    },
  };
}

export type MovimientoChanges = Partial<MovimientoInput>;

export function validateMovimientoPatch(body: unknown): Result<{ id: string; changes: MovimientoChanges }> {
  if (!isPlainObject(body)) return bad('Cuerpo inválido.');
  if (!validateId(body.id)) return bad('Movimiento inválido.');
  const changes: MovimientoChanges = {};
  if (body.tipo !== undefined) {
    if (!isTipo(body.tipo)) return bad('Tipo inválido: usar ingreso o egreso.');
    changes.tipo = body.tipo;
  }
  if (body.categoria_id !== undefined) {
    if (!validateId(body.categoria_id)) return bad('Categoría inválida.');
    changes.categoria_id = body.categoria_id;
  }
  if (body.monto !== undefined) {
    if (!isMonto(body.monto)) return bad('El monto debe ser un entero positivo.');
    changes.monto = body.monto;
  }
  if (body.fecha !== undefined) {
    if (!isRealDate(body.fecha)) return bad('Fecha inválida: usar AAAA-MM-DD.');
    changes.fecha = body.fecha;
  }
  if (body.descripcion !== undefined) {
    const r = optionalText(body.descripcion, DESCRIPCION_MAX, 'Descripción');
    if (!r.ok) return r;
    changes.descripcion = r.value;
  }
  if (body.referencia !== undefined) {
    const r = optionalText(body.referencia, REFERENCIA_MAX, 'Referencia');
    if (!r.ok) return r;
    changes.referencia = r.value;
  }
  if (Object.keys(changes).length === 0) return bad('No hay cambios para aplicar.');
  return { ok: true, value: { id: body.id, changes } };
}

export function validateCategoriaInput(
  body: unknown,
): Result<{ id: string | null; nombre: string; tipo: Tipo }> {
  if (!isPlainObject(body)) return bad('Cuerpo inválido.');
  let id: string | null = null;
  if (body.id !== undefined && body.id !== null) {
    if (!validateId(body.id)) return bad('Categoría inválida.');
    id = body.id;
  }
  const nombre = typeof body.nombre === 'string' ? body.nombre.trim() : '';
  if (nombre.length < 1 || nombre.length > NOMBRE_MAX) {
    return bad(`El nombre debe tener entre 1 y ${NOMBRE_MAX} caracteres.`);
  }
  if (!isTipo(body.tipo)) return bad('Tipo inválido: usar ingreso o egreso.');
  return { ok: true, value: { id, nombre, tipo: body.tipo } };
}
