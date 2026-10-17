// Platform finance actions for the superadmin edge function. Handlers receive
// the already-authorized context (index.ts checks the JWT and
// fn_es_platform_admin first) and a shared audit writer.

import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { fail, json } from '../_shared/http.ts';
import {
  validateCategoriaInput,
  validateDateRange,
  validateId,
  validateListFilters,
  validateMovimientoInput,
  validateMovimientoPatch,
} from './validation.ts';

export type FinCtx = { admin: SupabaseClient; userId: string; body: Record<string, unknown> };
export type AuditFn = (
  ctx: FinCtx,
  action: string,
  tenantId: number | null,
  payload: Record<string, unknown>,
) => Promise<Response | null>;
type Handler = (ctx: FinCtx) => Promise<Response>;

const MOV_SELECT =
  'id, tipo, categoria_id, monto, fecha, descripcion, referencia, created_by, created_at, updated_at, anulado, categoria:categoria_id(nombre)';

const asuncionDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Asuncion',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

type Joined = { nombre?: string } | { nombre?: string }[] | null | undefined;
const joinedName = (j: Joined): string | null => (Array.isArray(j) ? j[0]?.nombre : j?.nombre) ?? null;

async function categoriaTipo(admin: SupabaseClient, id: string): Promise<string | null | 'error'> {
  const { data, error } = await admin.from('platform_categorias').select('tipo').eq('id', id).maybeSingle();
  if (error) {
    console.error('superadmin: categoria lookup failed', error.code);
    return 'error';
  }
  return data?.tipo ?? null;
}

export function makeFinanzasActions(audit: AuditFn): Record<string, Handler> {
  const finanzasResumen: Handler = async ({ admin, body }) => {
    const range = validateDateRange(body);
    if (!range.ok) return fail(400, range.error);
    const { data, error } = await admin.rpc('fn_admin_finanzas_resumen', {
      p_desde: range.value.desde,
      p_hasta: range.value.hasta,
    });
    if (error) {
      if (error.code === '22023') return fail(400, 'Rango de fechas inválido.');
      console.error('superadmin: finanzas_resumen failed', error.code);
      return fail(500, 'No se pudo obtener el resumen.');
    }
    return json({ data });
  };

  const listMovimientos: Handler = async ({ admin, body }) => {
    const f = validateListFilters(body);
    if (!f.ok) return fail(400, f.error);
    const { desde, hasta, tipo, categoria_id } = f.value;

    let manual = admin.from('platform_movimientos').select(MOV_SELECT).gte('fecha', desde).lte('fecha', hasta);
    if (tipo) manual = manual.eq('tipo', tipo);
    if (categoria_id) manual = manual.eq('categoria_id', categoria_id);

    // Subscription payments are income without a category: skip them when the
    // filter asks for expenses or a specific category.
    const withPagos = tipo !== 'egreso' && !categoria_id;
    // created_at is a timestamptz; fetch a day of margin on each side and keep
    // the rows whose America/Asuncion date falls in range (same basis as
    // fn_admin_finanzas_resumen).
    const pagosQuery = withPagos
      ? admin
          .from('pagos_suscripcion')
          .select('id, tenant_id, plan, ciclo, monto, referencia, created_at, tenant:tenant_id(nombre)')
          .gte('created_at', `${addDays(desde, -1)}T00:00:00Z`)
          .lt('created_at', `${addDays(hasta, 2)}T00:00:00Z`)
      : null;

    const [mov, pagos] = await Promise.all([manual, pagosQuery ?? Promise.resolve({ data: [], error: null })]);
    if (mov.error || pagos.error) {
      console.error('superadmin: list_movimientos failed', mov.error?.code, pagos.error?.code);
      return fail(500, 'No se pudieron obtener los movimientos.');
    }

    const manualRows = (mov.data ?? []).map((m) => {
      const { categoria, ...rest } = m as Record<string, unknown> & { categoria?: Joined };
      return { ...rest, origen: 'manual', categoria_nombre: joinedName(categoria) };
    });
    const pagoRows = (pagos.data ?? [])
      .map((p) => ({
        origen: 'suscripcion',
        tipo: 'ingreso',
        fecha: asuncionDate.format(new Date(p.created_at as string)),
        monto: Number(p.monto),
        tenant_id: p.tenant_id,
        tenant_nombre: joinedName((p as { tenant?: Joined }).tenant),
        plan: p.plan,
        ciclo: p.ciclo,
        referencia: p.referencia ?? null,
        created_at: p.created_at,
        anulado: false,
      }))
      .filter((r) => r.fecha >= desde && r.fecha <= hasta);

    const rows = [...manualRows, ...pagoRows].sort((a, b) => {
      const fa = String(a.fecha);
      const fb = String(b.fecha);
      if (fa !== fb) return fa < fb ? 1 : -1;
      return String(b.created_at).localeCompare(String(a.created_at));
    });
    return json({ data: rows });
  };

  const createMovimiento: Handler = async (ctx) => {
    const { admin, userId, body } = ctx;
    const parsed = validateMovimientoInput(body);
    if (!parsed.ok) return fail(400, parsed.error);
    const input = parsed.value;

    const catTipo = await categoriaTipo(admin, input.categoria_id);
    if (catTipo === 'error') return fail(500, 'No se pudo verificar la categoría.');
    if (!catTipo) return fail(404, 'No existe la categoría.');
    if (catTipo !== input.tipo) return fail(400, 'El tipo del movimiento no coincide con la categoría.');

    const { data, error } = await admin
      .from('platform_movimientos')
      .insert({ ...input, created_by: userId })
      .select('id')
      .single();
    if (error || !data) {
      console.error('superadmin: create_movimiento failed', error?.code);
      return fail(500, 'No se pudo crear el movimiento.');
    }
    const auditFail = await audit(ctx, 'finanzas_create_movimiento', null, {
      id: data.id,
      tipo: input.tipo,
      categoria_id: input.categoria_id,
      monto: input.monto,
      fecha: input.fecha,
    });
    if (auditFail) return auditFail;
    return json({ data: { id: data.id } }, 201);
  };

  const updateMovimiento: Handler = async (ctx) => {
    const { admin, body } = ctx;
    const parsed = validateMovimientoPatch(body);
    if (!parsed.ok) return fail(400, parsed.error);
    const { id, changes } = parsed.value;

    const { data: current, error: lookupError } = await admin
      .from('platform_movimientos')
      .select('id, tipo, categoria_id, anulado')
      .eq('id', id)
      .maybeSingle();
    if (lookupError) {
      console.error('superadmin: update_movimiento lookup failed', lookupError.code);
      return fail(500, 'No se pudo verificar el movimiento.');
    }
    if (!current) return fail(404, 'No existe el movimiento.');
    if (current.anulado) return fail(409, 'El movimiento está anulado y no se puede editar.');

    const tipo = changes.tipo ?? current.tipo;
    const categoriaId = changes.categoria_id ?? current.categoria_id;
    if (changes.tipo !== undefined || changes.categoria_id !== undefined) {
      const catTipo = await categoriaTipo(admin, categoriaId);
      if (catTipo === 'error') return fail(500, 'No se pudo verificar la categoría.');
      if (!catTipo) return fail(404, 'No existe la categoría.');
      if (catTipo !== tipo) return fail(400, 'El tipo del movimiento no coincide con la categoría.');
    }

    // anulado=false in the filter closes the race with a concurrent void.
    const { data: updated, error } = await admin
      .from('platform_movimientos')
      .update({ ...changes, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('anulado', false)
      .select('id');
    if (error) {
      console.error('superadmin: update_movimiento failed', error.code);
      return fail(500, 'No se pudo actualizar el movimiento.');
    }
    if (!updated || updated.length === 0) return fail(409, 'El movimiento está anulado y no se puede editar.');

    const auditFail = await audit(ctx, 'finanzas_update_movimiento', null, { id, changes });
    if (auditFail) return auditFail;
    return json({ data: { id } });
  };

  const anularMovimiento: Handler = async (ctx) => {
    const { admin, body } = ctx;
    if (!validateId(body.id)) return fail(400, 'Movimiento inválido.');
    const id = body.id;

    const { data: voided, error } = await admin
      .from('platform_movimientos')
      .update({ anulado: true, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('anulado', false)
      .select('id');
    if (error) {
      console.error('superadmin: anular_movimiento failed', error.code);
      return fail(500, 'No se pudo anular el movimiento.');
    }
    if (!voided || voided.length === 0) {
      const { data: exists } = await admin.from('platform_movimientos').select('id').eq('id', id).maybeSingle();
      return exists ? fail(409, 'El movimiento ya está anulado.') : fail(404, 'No existe el movimiento.');
    }

    const auditFail = await audit(ctx, 'finanzas_anular_movimiento', null, { id });
    if (auditFail) return auditFail;
    return json({ data: { id } });
  };

  const listCategorias: Handler = async ({ admin }) => {
    const { data, error } = await admin
      .from('platform_categorias')
      .select('id, nombre, tipo, activo, created_at')
      .order('tipo')
      .order('nombre');
    if (error) {
      console.error('superadmin: list_categorias failed', error.code);
      return fail(500, 'No se pudieron obtener las categorías.');
    }
    return json({ data });
  };

  const upsertCategoria: Handler = async (ctx) => {
    const { admin, body } = ctx;
    const parsed = validateCategoriaInput(body);
    if (!parsed.ok) return fail(400, parsed.error);
    const { id, nombre, tipo } = parsed.value;

    if (id) {
      const { data: current, error: lookupError } = await admin
        .from('platform_categorias')
        .select('tipo')
        .eq('id', id)
        .maybeSingle();
      if (lookupError) {
        console.error('superadmin: upsert_categoria lookup failed', lookupError.code);
        return fail(500, 'No se pudo verificar la categoría.');
      }
      if (!current) return fail(404, 'No existe la categoría.');
      if (current.tipo !== tipo) {
        // Changing tipo would orphan movements whose tipo must match.
        const { count, error: countError } = await admin
          .from('platform_movimientos')
          .select('id', { count: 'exact', head: true })
          .eq('categoria_id', id);
        if (countError) {
          console.error('superadmin: upsert_categoria usage check failed', countError.code);
          return fail(500, 'No se pudo verificar la categoría.');
        }
        if ((count ?? 0) > 0) return fail(409, 'No se puede cambiar el tipo de una categoría con movimientos.');
      }
    }

    const { data, error } = id
      ? await admin.from('platform_categorias').update({ nombre, tipo }).eq('id', id).select('id').single()
      : await admin.from('platform_categorias').insert({ nombre, tipo }).select('id').single();
    if (error || !data) {
      if (error?.code === '23505') return fail(409, 'Ya existe una categoría con ese nombre.');
      console.error('superadmin: upsert_categoria failed', error?.code);
      return fail(500, 'No se pudo guardar la categoría.');
    }
    const auditFail = await audit(ctx, 'finanzas_upsert_categoria', null, { id: data.id, nombre, tipo });
    if (auditFail) return auditFail;
    return json({ data: { id: data.id } }, id ? 200 : 201);
  };

  const setCategoriaActiva: Handler = async (ctx) => {
    const { admin, body } = ctx;
    if (!validateId(body.id)) return fail(400, 'Categoría inválida.');
    if (typeof body.activo !== 'boolean') return fail(400, 'El valor "activo" debe ser booleano.');
    const { data, error } = await admin
      .from('platform_categorias')
      .update({ activo: body.activo })
      .eq('id', body.id)
      .select('id');
    if (error) {
      console.error('superadmin: set_categoria_activa failed', error.code);
      return fail(500, 'No se pudo actualizar la categoría.');
    }
    if (!data || data.length === 0) return fail(404, 'No existe la categoría.');
    const auditFail = await audit(ctx, 'finanzas_set_categoria_activa', null, { id: body.id, activo: body.activo });
    if (auditFail) return auditFail;
    return json({ data: { id: body.id, activo: body.activo } });
  };

  return {
    finanzas_resumen: finanzasResumen,
    list_movimientos: listMovimientos,
    create_movimiento: createMovimiento,
    update_movimiento: updateMovimiento,
    anular_movimiento: anularMovimiento,
    list_categorias: listCategorias,
    upsert_categoria: upsertCategoria,
    set_categoria_activa: setCategoriaActiva,
  };
}
