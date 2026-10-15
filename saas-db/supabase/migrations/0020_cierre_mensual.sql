-- ═══════════════════════════════════════════════════════════════════════════
-- 0020 · Monthly lock (cierre mensual)
-- ═══════════════════════════════════════════════════════════════════════════
-- An admin closes a month; from then on nothing dated in that month can be
-- created, edited, annulled or deleted in the finance documents or in the
-- ledger. The admin can reopen it. There is no fiscal-year close.
--
--   periodos_cerrados   one row per closed (hotel, year, month). The client can
--                       only READ it (rule `admin_gerente_total`); the only
--                       write path is fn_cerrar_mes / fn_reabrir_mes, like
--                       asiento_secuencia in 0016. The RESTRICTIVE
--                       valid-subscription / module policies of 0014 are not
--                       added: reading the closed months stays possible after a
--                       downgrade, and every write is refused by the RPCs.
--   fn_fecha_negocio    timestamptz -> business day (America/Asuncion).
--   fn_periodo_cerrado  is (hotel, date) in a closed month? Internal.
--   fn_cerrar_mes / fn_reabrir_mes
--                       RPCs for the admin of a hotel with the `contabilidad`
--                       module. Closing an already closed month is an ERROR (not
--                       a silent no-op) and so is reopening an open one; the
--                       current month can be closed, a future month cannot.
--
-- What is guarded (trigger `a00_periodo_cerrado`, BEFORE INSERT OR UPDATE OR
-- DELETE, FOR EACH ROW, error 55000 "El periodo YYYY-MM esta cerrado."):
--
--   facturas (fecha_emision), gastos / cobros / pagos / transferencias_fondos /
--   saldos_iniciales_fondos (fecha), asientos (fecha) and detalle_asientos
--   (through the date of their asiento).
--
-- An INSERT is refused when the NEW date is in a closed month; an UPDATE or
-- DELETE when the OLD or the NEW date is. The business day is America/Asuncion,
-- never UTC. The trigger name starts with `a00_` so it sorts before the
-- 0018/0019 BEFORE triggers (they fire alphabetically) and the user sees the
-- closed-month message first; its DELETE guard also comes before the "no se
-- puede eliminar" refusal of 0019.
--
-- Annulment. A document is annulled by an UPDATE of `estado`, so a document
-- whose own date is in a closed month cannot be annulled (nor edited). The
-- reversal entry (<tipo>_anulacion) is dated the annulment day (0016/0019), and
-- it is a plain INSERT into asientos: if the annulment day itself is in a closed
-- month the INSERT fails and the whole annulment (document UPDATE included) is
-- rolled back. So annulling an April document today works only while today's
-- month is open.
--
-- asientos / detalle_asientos have NO exception for the `estado -> ANULADO`
-- change that fn_contabilizar_reverso makes on the original entry, and none is
-- needed: an entry carries the date of its document (the document guard already
-- refused the annulment when that date is closed), and the reversal and its
-- lines are dated today (checked when they are inserted, then flagged ANULADO in
-- the same open month). Hence no entry of a closed month can ever change, which
-- makes the rule independent of pg_trigger_depth() or any other session state.
--
-- One deliberate hole: `saldo_pendiente` of a document that stays in a closed
-- month still moves when a cobro / pago dated in an OPEN month is registered or
-- annulled against it (0019 does it from nested triggers). An UPDATE that
-- changes nothing but `saldo_pendiente` at nested trigger level is therefore
-- let through. A direct client UPDATE of the balance is not nested, so it is
-- guarded here like any other edit (and refused by 0019 anyway).
--
-- Concurrency: a close commits like any other row; a write that started before
-- the close and commits after it is not stopped (no table lock is taken). The
-- guards are SECURITY DEFINER and read periodos_cerrados as VOLATILE, so a close
-- and a guarded write in the same transaction see each other.
--
-- Idempotent: running the file again changes nothing.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── periodos_cerrados ───────────────────────────────────────────────────────
create table if not exists public.periodos_cerrados (
  id           bigint generated always as identity primary key,
  tenant_id    bigint not null default public.current_tenant_id() references public.tenants (id),
  anio         integer not null check (anio between 2000 and 2100),
  mes          integer not null check (mes between 1 and 12),
  cerrado_por  bigint not null,
  cerrado_en   timestamptz not null default now(),
  constraint periodos_cerrados_tenant_id_key unique (tenant_id, id),
  constraint periodos_cerrados_tenant_periodo_key unique (tenant_id, anio, mes),
  constraint periodos_cerrados_usuario_fkey
    foreign key (tenant_id, cerrado_por) references public.usuario (tenant_id, id_usuario)
);

comment on table public.periodos_cerrados is
  'Closed months of a hotel. Written only by fn_cerrar_mes / fn_reabrir_mes; the client can only read it (admin and gerente).';

-- ─── RLS: read-only for the client ───────────────────────────────────────────
alter table public.periodos_cerrados enable row level security;

drop policy if exists periodos_cerrados_select on public.periodos_cerrados;
create policy periodos_cerrados_select on public.periodos_cerrados
  for select to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and (select public.current_usuario_activo())
    and (select public.current_es_admin_o_gerente())
  );

-- Same pattern as asiento_secuencia (0016): no write policy exists, and the
-- privileges are also gone, so a direct write fails with permission denied.
grant select on public.periodos_cerrados to authenticated;
revoke insert, update, delete on public.periodos_cerrados from authenticated;

-- ─── Helpers ─────────────────────────────────────────────────────────────────
-- Business day of a timestamp (America/Asuncion).
create or replace function public.fn_fecha_negocio(p_ts timestamptz)
returns date
language sql
stable
set search_path = public
as $$
  select (p_ts at time zone 'America/Asuncion')::date;
$$;

comment on function public.fn_fecha_negocio(timestamptz) is
  'Business day (America/Asuncion) of a timestamp. Internal (no EXECUTE for the client).';

-- Is the date inside a month the hotel has closed? VOLATILE on purpose: it must
-- see a close made earlier in the same transaction. A null hotel or date is
-- never closed.
create or replace function public.fn_periodo_cerrado(p_tenant bigint, p_fecha date)
returns boolean
language sql
volatile
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.periodos_cerrados p
    where p.tenant_id = p_tenant
      and p.anio = extract(year from p_fecha)::int
      and p.mes = extract(month from p_fecha)::int
  );
$$;

comment on function public.fn_periodo_cerrado(bigint, date) is
  'True when the date falls in a closed month of the hotel. Internal (no EXECUTE for the client): used by the lock triggers.';

-- Raises the user-facing error when the date is in a closed month.
create or replace function public.fn_exigir_periodo_abierto(p_tenant bigint, p_fecha date)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if p_fecha is not null and public.fn_periodo_cerrado(p_tenant, p_fecha) then
    raise exception 'El periodo % esta cerrado.', to_char(p_fecha, 'YYYY-MM')
      using errcode = '55000',
            hint = 'Pida a un administrador que reabra el mes para modificar este registro.';
  end if;
end;
$$;

comment on function public.fn_exigir_periodo_abierto(bigint, date) is
  'Raises "El periodo YYYY-MM esta cerrado." (55000) when the date is in a closed month. Internal (no EXECUTE for the client).';

-- Same, for a line of the ledger: the date is the one of its asiento. An asiento
-- that is not found is left to the composite FK.
create or replace function public.fn_exigir_asiento_abierto(p_tenant bigint, p_asiento bigint)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_fecha timestamptz;
begin
  select a.fecha into v_fecha
  from public.asientos a
  where a.tenant_id = p_tenant and a.id = p_asiento;

  if found then
    perform public.fn_exigir_periodo_abierto(p_tenant, public.fn_fecha_negocio(v_fecha));
  end if;
end;
$$;

comment on function public.fn_exigir_asiento_abierto(bigint, bigint) is
  'Same as fn_exigir_periodo_abierto for the date of an asiento. Internal (no EXECUTE for the client).';

-- ─── RPCs: close and reopen a month ──────────────────────────────────────────
-- Common checks, in the order the user should hear about them: the caller must
-- be an active admin, the plan must include the module and the subscription must
-- be valid; then the month must exist. Returns the hotel.
create or replace function public.fn_cierre_mensual_validar(p_anio integer, p_mes integer)
returns bigint
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_tenant bigint := public.current_tenant_id();
begin
  if v_tenant is null or not public.current_usuario_activo() then
    raise exception 'Usuario sin acceso a ningun hotel.' using errcode = '42501';
  end if;
  if not public.current_es_admin() then
    raise exception 'Solo un administrador puede cerrar o reabrir meses.' using errcode = '42501';
  end if;
  if not public.fn_modulo_habilitado(v_tenant, 'contabilidad') then
    raise exception 'El cierre mensual requiere el modulo de contabilidad, que no esta incluido en el plan de este hotel.'
      using errcode = '42501';
  end if;
  if not public.fn_suscripcion_vigente(v_tenant) then
    raise exception 'La suscripcion del hotel no esta vigente.' using errcode = '42501';
  end if;
  if p_anio is null or p_mes is null or p_anio not between 2000 and 2100 or p_mes not between 1 and 12 then
    raise exception 'El anio o el mes no son validos.' using errcode = '22023';
  end if;
  return v_tenant;
end;
$$;

comment on function public.fn_cierre_mensual_validar(integer, integer) is
  'Shared checks of fn_cerrar_mes / fn_reabrir_mes: active admin, module contabilidad, valid subscription, valid month. Internal (no EXECUTE for the client).';

create or replace function public.fn_cerrar_mes(p_anio integer, p_mes integer)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_tenant bigint := public.fn_cierre_mensual_validar(p_anio, p_mes);
  v_hoy    date   := public.fn_fecha_negocio(now());
  v_id     bigint;
begin
  -- The current month can be closed; a month that has not started cannot.
  if make_date(p_anio, p_mes, 1) > v_hoy then
    raise exception 'No se puede cerrar un mes futuro (%).', to_char(make_date(p_anio, p_mes, 1), 'YYYY-MM')
      using errcode = '22023';
  end if;

  insert into public.periodos_cerrados (tenant_id, anio, mes, cerrado_por)
  values (v_tenant, p_anio, p_mes, public.current_usuario_id())
  on conflict (tenant_id, anio, mes) do nothing
  returning id into v_id;

  if v_id is null then
    raise exception 'El periodo % ya esta cerrado.', to_char(make_date(p_anio, p_mes, 1), 'YYYY-MM')
      using errcode = '55000';
  end if;
end;
$$;

comment on function public.fn_cerrar_mes(integer, integer) is
  'Closes a month of the caller''s hotel (admin only, module contabilidad). Closing a closed month or a future month is an error.';

create or replace function public.fn_reabrir_mes(p_anio integer, p_mes integer)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_tenant bigint := public.fn_cierre_mensual_validar(p_anio, p_mes);
  v_id     bigint;
begin
  delete from public.periodos_cerrados
  where tenant_id = v_tenant and anio = p_anio and mes = p_mes
  returning id into v_id;

  if v_id is null then
    raise exception 'El periodo % no esta cerrado.', to_char(make_date(p_anio, p_mes, 1), 'YYYY-MM')
      using errcode = '55000';
  end if;
end;
$$;

comment on function public.fn_reabrir_mes(integer, integer) is
  'Reopens a closed month of the caller''s hotel (admin only, module contabilidad). Reopening an open month is an error.';

-- ─── Guard trigger functions ─────────────────────────────────────────────────
-- Tables with a `date` column; TG_ARGV[0] names it (facturas and asientos hold
-- a timestamptz and have their own functions below).
create or replace function public.tg_fn_periodo_guarda_fecha()
returns trigger
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_col text := tg_argv[0];
begin
  if tg_op = 'DELETE' then
    perform public.fn_exigir_periodo_abierto(old.tenant_id, (to_jsonb(old) ->> v_col)::date);
    return old;
  end if;

  if tg_op = 'UPDATE' then
    -- A balance move made by a cobro / pago trigger (nested level) is not an
    -- edit of the document: see the header.
    if pg_trigger_depth() > 1
       and (to_jsonb(old) - 'saldo_pendiente') = (to_jsonb(new) - 'saldo_pendiente') then
      return new;
    end if;
    perform public.fn_exigir_periodo_abierto(old.tenant_id, (to_jsonb(old) ->> v_col)::date);
  end if;

  perform public.fn_exigir_periodo_abierto(new.tenant_id, (to_jsonb(new) ->> v_col)::date);
  return new;
end;
$$;

create or replace function public.tg_fn_periodo_guarda_factura()
returns trigger
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.fn_exigir_periodo_abierto(old.tenant_id, public.fn_fecha_negocio(old.fecha_emision));
    return old;
  end if;

  if tg_op = 'UPDATE' then
    if pg_trigger_depth() > 1
       and (to_jsonb(old) - 'saldo_pendiente') = (to_jsonb(new) - 'saldo_pendiente') then
      return new;
    end if;
    perform public.fn_exigir_periodo_abierto(old.tenant_id, public.fn_fecha_negocio(old.fecha_emision));
  end if;

  perform public.fn_exigir_periodo_abierto(new.tenant_id, public.fn_fecha_negocio(new.fecha_emision));
  return new;
end;
$$;

create or replace function public.tg_fn_periodo_guarda_asiento()
returns trigger
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.fn_exigir_periodo_abierto(old.tenant_id, public.fn_fecha_negocio(old.fecha));
    return old;
  end if;

  if tg_op = 'UPDATE' then
    perform public.fn_exigir_periodo_abierto(old.tenant_id, public.fn_fecha_negocio(old.fecha));
  end if;

  perform public.fn_exigir_periodo_abierto(new.tenant_id, public.fn_fecha_negocio(new.fecha));
  return new;
end;
$$;

-- Lines follow their asiento: the date checked is the one of the entry they
-- belong to (both entries when a line is moved).
create or replace function public.tg_fn_periodo_guarda_detalle()
returns trigger
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.fn_exigir_asiento_abierto(old.tenant_id, old.fk_asientos);
    return old;
  end if;

  if tg_op = 'UPDATE' then
    perform public.fn_exigir_asiento_abierto(old.tenant_id, old.fk_asientos);
  end if;

  perform public.fn_exigir_asiento_abierto(new.tenant_id, new.fk_asientos);
  return new;
end;
$$;

-- ─── Triggers ────────────────────────────────────────────────────────────────
drop trigger if exists a00_periodo_cerrado on public.facturas;
create trigger a00_periodo_cerrado
  before insert or update or delete on public.facturas
  for each row execute function public.tg_fn_periodo_guarda_factura();

drop trigger if exists a00_periodo_cerrado on public.gastos;
create trigger a00_periodo_cerrado
  before insert or update or delete on public.gastos
  for each row execute function public.tg_fn_periodo_guarda_fecha('fecha');

drop trigger if exists a00_periodo_cerrado on public.cobros;
create trigger a00_periodo_cerrado
  before insert or update or delete on public.cobros
  for each row execute function public.tg_fn_periodo_guarda_fecha('fecha');

drop trigger if exists a00_periodo_cerrado on public.pagos;
create trigger a00_periodo_cerrado
  before insert or update or delete on public.pagos
  for each row execute function public.tg_fn_periodo_guarda_fecha('fecha');

drop trigger if exists a00_periodo_cerrado on public.transferencias_fondos;
create trigger a00_periodo_cerrado
  before insert or update or delete on public.transferencias_fondos
  for each row execute function public.tg_fn_periodo_guarda_fecha('fecha');

drop trigger if exists a00_periodo_cerrado on public.saldos_iniciales_fondos;
create trigger a00_periodo_cerrado
  before insert or update or delete on public.saldos_iniciales_fondos
  for each row execute function public.tg_fn_periodo_guarda_fecha('fecha');

drop trigger if exists a00_periodo_cerrado on public.asientos;
create trigger a00_periodo_cerrado
  before insert or update or delete on public.asientos
  for each row execute function public.tg_fn_periodo_guarda_asiento();

drop trigger if exists a00_periodo_cerrado on public.detalle_asientos;
create trigger a00_periodo_cerrado
  before insert or update or delete on public.detalle_asientos
  for each row execute function public.tg_fn_periodo_guarda_detalle();

-- ─── Privileges ──────────────────────────────────────────────────────────────
-- 0012 already revokes EXECUTE from what is created above; repeated so it does
-- not depend on that event trigger. Only the two RPCs are granted.
revoke execute on function public.fn_fecha_negocio(timestamptz)                   from public, anon, authenticated;
revoke execute on function public.fn_periodo_cerrado(bigint, date)                from public, anon, authenticated;
revoke execute on function public.fn_exigir_periodo_abierto(bigint, date)         from public, anon, authenticated;
revoke execute on function public.fn_exigir_asiento_abierto(bigint, bigint)       from public, anon, authenticated;
revoke execute on function public.fn_cierre_mensual_validar(integer, integer)     from public, anon, authenticated;
revoke execute on function public.tg_fn_periodo_guarda_fecha()                    from public, anon, authenticated;
revoke execute on function public.tg_fn_periodo_guarda_factura()                  from public, anon, authenticated;
revoke execute on function public.tg_fn_periodo_guarda_asiento()                  from public, anon, authenticated;
revoke execute on function public.tg_fn_periodo_guarda_detalle()                  from public, anon, authenticated;

revoke execute on function public.fn_cerrar_mes(integer, integer)                from public, anon;
revoke execute on function public.fn_reabrir_mes(integer, integer)                from public, anon;
grant  execute on function public.fn_cerrar_mes(integer, integer)                 to authenticated;
grant  execute on function public.fn_reabrir_mes(integer, integer)                to authenticated;
