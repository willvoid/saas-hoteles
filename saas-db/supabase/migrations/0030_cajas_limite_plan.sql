-- ═══════════════════════════════════════════════════════════════════════════
-- 0030 · Cajas por hotel con tope por plan
-- ═══════════════════════════════════════════════════════════════════════════
-- Admin y gerente administran las cajas de su hotel (alta, edicion y baja
-- logica); la cantidad de cajas depende del plan.
--
--   * planes.max_cajas: cajas por hotel, de cualquier estado. null = ilimitado.
--     Basico 1, Pro 3, Trial 3 (evalua Pro), Business ilimitado.
--   * caja.estado ('Activo' / 'Inactivo'): baja logica. Nunca se borra una
--     caja porque turnos, facturas y fondos la referencian.
--   * fn_limite() reconoce 'cajas' y un trigger BEFORE INSERT aplica el tope,
--     con el mismo patron que habitaciones (0014): serializa con el hotel y
--     cuenta activas e inactivas, asi que desactivar y recrear no lo esquiva.
--   * No se puede desactivar una caja con un turno abierto.
--   * Escribir en `caja` pasa de `operativo` a admin/gerente (0006). La
--     recepcion sigue leyendo cajas y abriendo turnos. Las policies
--     restrictivas de vigencia (0014) no se tocan.
--   * fn_planes_publicos() expone max_cajas (base: 0026).
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Columnas ────────────────────────────────────────────────────────────────
alter table public.planes
  add column max_cajas integer check (max_cajas > 0);

comment on column public.planes.max_cajas is 'Cajas por hotel, de cualquier estado. null = ilimitado.';

update public.planes set max_cajas = 1 where codigo = 'basico';
update public.planes set max_cajas = 3 where codigo in ('pro', 'trial');
update public.planes set max_cajas = null where codigo = 'business';

alter table public.caja
  add column estado text not null default 'Activo' check (estado in ('Activo', 'Inactivo'));

-- ─── fn_limite: clave 'cajas' ────────────────────────────────────────────────
-- Tope del plan del hotel para una clave ('habitaciones', 'usuarios',
-- 'hoteles', 'cajas'). null = ilimitado. Una clave desconocida falla en vez de
-- devolver null, que se leeria como "sin tope".
create or replace function public.fn_limite(p_tenant bigint, p_clave text)
returns integer
language plpgsql
stable
set search_path = public
as $$
declare
  v_limite integer;
begin
  if p_clave is null or p_clave not in ('habitaciones', 'usuarios', 'hoteles', 'cajas') then
    raise exception 'Limite desconocido: %.', p_clave using errcode = '22023';
  end if;

  select case p_clave
           when 'habitaciones' then p.max_habitaciones
           when 'usuarios'     then p.max_usuarios
           when 'cajas'        then p.max_cajas
           else p.max_hoteles
         end
  into v_limite
  from public.tenants t
  join public.planes p on p.codigo = t.plan
  where t.id = p_tenant;

  return v_limite;
end;
$$;

-- ─── Tope de cajas ───────────────────────────────────────────────────────────
-- Mismo mecanismo que tg_fn_limite_habitaciones (0014): bloquea la fila del
-- hotel (FOR NO KEY UPDATE) para serializar el conteo y cuenta TODAS las
-- cajas, activas o no. Definer: el conteo no depende de RLS.
create or replace function public.tg_fn_limite_cajas()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan   text;
  v_limite integer;
  v_total  bigint;
begin
  select t.plan into v_plan
  from public.tenants t
  where t.id = new.tenant_id
  for no key update;

  v_limite := public.fn_limite(new.tenant_id, 'cajas');
  if v_limite is null then
    return new;
  end if;

  select count(*) into v_total from public.caja c where c.tenant_id = new.tenant_id;
  if v_total >= v_limite then
    raise exception 'El plan % permite hasta % cajas por hotel y ya hay %. Cambia de plan para agregar mas.',
      v_plan, v_limite, v_total
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger caja_limite_plan
  before insert on public.caja
  for each row execute function public.tg_fn_limite_cajas();

-- ─── No desactivar una caja con turno abierto ────────────────────────────────
create or replace function public.tg_fn_caja_baja_sin_turno_abierto()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.estado = 'Inactivo' and old.estado is distinct from 'Inactivo'
     and exists (
       select 1
       from public.apertura_cierre_caja a
       where a.tenant_id = new.tenant_id
         and a.fk_caja = new.id_caja
         and a.cierre is null
     ) then
    raise exception 'No se puede desactivar la caja % porque tiene un turno abierto. Cierra el turno primero.',
      new.nro_caja
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger caja_baja_sin_turno_abierto
  before update of estado on public.caja
  for each row execute function public.tg_fn_caja_baja_sin_turno_abierto();

-- ─── Privilegios ─────────────────────────────────────────────────────────────
-- La guarda de 0012 ya revoca EXECUTE de lo que se crea arriba; se repite para
-- que no dependa del event trigger. fn_limite se recrea con los mismos grants.
-- Las funciones de trigger no requieren EXECUTE para dispararse.
revoke execute on function public.fn_limite(bigint, text)             from public, anon, authenticated;
revoke execute on function public.tg_fn_limite_cajas()                from public, anon, authenticated;
revoke execute on function public.tg_fn_caja_baja_sin_turno_abierto() from public, anon, authenticated;

grant execute on function public.fn_limite(bigint, text) to authenticated;

-- ─── RLS: escribir cajas es de admin/gerente ─────────────────────────────────
-- 0006 las genero con la regla `operativo`; ahora `admin_gerente`. El SELECT
-- (tenant + usuario activo) no cambia.
drop policy caja_insert on public.caja;
drop policy caja_update on public.caja;
drop policy caja_delete on public.caja;

create policy caja_insert on public.caja
  for insert to authenticated
  with check (
    tenant_id = (select public.current_tenant_id())
    and (select public.current_usuario_activo())
    and (select public.current_es_admin_o_gerente())
  );

create policy caja_update on public.caja
  for update to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and (select public.current_usuario_activo())
    and (select public.current_es_admin_o_gerente())
  )
  with check (
    tenant_id = (select public.current_tenant_id())
    and (select public.current_usuario_activo())
    and (select public.current_es_admin_o_gerente())
  );

create policy caja_delete on public.caja
  for delete to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and (select public.current_usuario_activo())
    and (select public.current_es_admin_o_gerente())
  );

-- ─── Planes publicos ─────────────────────────────────────────────────────────
-- Agrega max_cajas: cambia el tipo de retorno, hay que recrearla (base: 0026).
drop function public.fn_planes_publicos();

create function public.fn_planes_publicos()
returns table (
  codigo                       text,
  nombre                       text,
  precio_mensual               numeric,
  precio_anual                 numeric,
  moneda                       text,
  max_habitaciones             integer,
  max_usuarios                 integer,
  max_hoteles                  integer,
  max_cajas                    integer,
  mod_contabilidad             boolean,
  precio_hotel_adicional       numeric,
  precio_hotel_adicional_anual numeric,
  contacto_ventas              boolean,
  modulos                      jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select p.codigo, p.nombre, p.precio_mensual, p.precio_anual, p.moneda,
         p.max_habitaciones, p.max_usuarios, p.max_hoteles, p.max_cajas,
         p.mod_contabilidad,
         p.precio_hotel_adicional, p.precio_hotel_adicional_anual,
         p.contacto_ventas, p.modulos
  from public.planes p
  where p.visible
  order by p.precio_mensual asc, p.orden asc, p.codigo asc;
$$;

comment on function public.fn_planes_publicos() is
  'Planes ofrecidos (visible = true) con precios, topes y modulos; null = ilimitado. Publica: no expone planes ocultos.';

revoke execute on function public.fn_planes_publicos() from public;
grant  execute on function public.fn_planes_publicos() to anon, authenticated;
