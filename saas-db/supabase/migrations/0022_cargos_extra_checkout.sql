-- ═══════════════════════════════════════════════════════════════════════════
-- 0022 · Late check-out / early check-in surcharges
-- ═══════════════════════════════════════════════════════════════════════════
-- What this adds:
--
--   * config_horarios_establecimiento  per-establishment check-in/out hours,
--                                      tolerance and surcharge method.
--   * reservas.checkin_real_at / checkout_real_at  real timestamps, stamped by
--                                      a trigger when the estado changes.
--   * Concepts 'Late check-out' and 'Early check-in' (IVA 10%, arancel 0),
--                                      seeded per tenant (existing and new).
--   * calcular_recargo_horario(...)    suggested surcharge for a reservation.
--   * checkout_con_recargo(...) / checkin_con_recargo(...)
--                                      atomic RPCs: charge + historial +
--                                      estado change in ONE transaction.
--
-- Business clock: the hour of day is always read as
-- `p_momento AT TIME ZONE 'America/Asuncion'`. current_date / hoy_py() are
-- NOT used here: they only give a date, and the hour matters.
--
-- Where the establishment of a reservation comes from: `reservas` has no
-- establishment column. It is resolved through its active rooms:
-- detalle_reservas -> habitaciones -> pisos -> edificios.fk_sucursal. A
-- reservation spanning several establishments (not expected) takes the lowest
-- id; one without active rooms uses the default settings.
--
-- Nightly rate used for the PORCENTAJE method: the MAX(precio_unitario) of the
-- ACTIVE rows of detalle_reservas of the reservation (precio_unitario is the
-- per-night price of one room). With several rooms the most expensive night is
-- the base: one surcharge per stay, not one per room.
--
-- Hours counted for FIJO_HORA: measured from the SCHEDULED hour (not from the
-- end of the tolerance) and rounded UP to whole hours: ceil(minutes / 60).
-- Tolerance only decides whether any surcharge applies at all.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Per-establishment hours and surcharge configuration ─────────────────────
create table public.config_horarios_establecimiento (
  id_config          bigint generated always as identity primary key,
  tenant_id          bigint not null default public.current_tenant_id() references public.tenants (id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  fk_establecimiento bigint not null,
  hora_checkin       time not null default time '14:00',
  hora_checkout      time not null default time '11:00',
  -- Minutes past the scheduled hour that are tolerated before any surcharge.
  tolerancia_min     integer not null default 30 check (tolerancia_min >= 0),
  metodo_recargo     text not null default 'PORCENTAJE'
                     check (metodo_recargo in ('PORCENTAJE', 'FIJO_HORA')),
  -- PORCENTAJE: % of the nightly rate (0-100). FIJO_HORA: Gs per hour.
  valor_recargo      numeric not null default 25 check (valor_recargo >= 0),
  constraint config_horarios_porcentaje_max
    check (metodo_recargo <> 'PORCENTAJE' or valor_recargo <= 100),
  constraint config_horarios_establecimiento_tenant_id_key unique (tenant_id, id_config),
  -- One row per establishment. Scoped by tenant so a unique violation can never
  -- reveal that another tenant's establishment already has a configuration.
  constraint config_horarios_establecimiento_estab_key unique (tenant_id, fk_establecimiento),
  constraint config_horarios_establecimiento_fk_estab_fkey
    foreign key (tenant_id, fk_establecimiento)
    references public.establecimientos (tenant_id, id_establecimiento)
);

comment on table public.config_horarios_establecimiento is
  'Check-in/out hours, tolerance and surcharge method of an establishment. No row = defaults (14:00, 11:00, 30 min, 25 % of the nightly rate).';
comment on column public.config_horarios_establecimiento.valor_recargo is
  'PORCENTAJE: percentage (0-100) of the nightly rate. FIJO_HORA: Gs per hour.';

create or replace function public.tg_fn_config_horarios_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger tg_config_horarios_updated_at
  before update on public.config_horarios_establecimiento
  for each row execute function public.tg_fn_config_horarios_updated_at();

-- RLS: any active member of the tenant reads; only admin/gerente write (same
-- rule as `establecimientos`, the table this one extends).
alter table public.config_horarios_establecimiento enable row level security;

create policy config_horarios_establecimiento_select
  on public.config_horarios_establecimiento
  for select to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and (select public.current_usuario_activo())
  );

create policy config_horarios_establecimiento_insert
  on public.config_horarios_establecimiento
  for insert to authenticated
  with check (
    tenant_id = (select public.current_tenant_id())
    and (select public.current_usuario_activo())
    and (select public.current_es_admin_o_gerente())
  );

create policy config_horarios_establecimiento_update
  on public.config_horarios_establecimiento
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

create policy config_horarios_establecimiento_delete
  on public.config_horarios_establecimiento
  for delete to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and (select public.current_usuario_activo())
    and (select public.current_es_admin_o_gerente())
  );

-- Expired subscription = read only (same RESTRICTIVE policies as 0014).
create policy config_horarios_establecimiento_vigente_insert
  on public.config_horarios_establecimiento
  as restrictive for insert to authenticated
  with check ((select public.fn_suscripcion_vigente((select public.current_tenant_id()))));

create policy config_horarios_establecimiento_vigente_update
  on public.config_horarios_establecimiento
  as restrictive for update to authenticated
  using ((select public.fn_suscripcion_vigente((select public.current_tenant_id()))))
  with check ((select public.fn_suscripcion_vigente((select public.current_tenant_id()))));

create policy config_horarios_establecimiento_vigente_delete
  on public.config_horarios_establecimiento
  as restrictive for delete to authenticated
  using ((select public.fn_suscripcion_vigente((select public.current_tenant_id()))));

-- ─── Real check-in / check-out timestamps ────────────────────────────────────
-- Nullable: reservations that were already in Check-in/Check-out before this
-- migration keep them null (the real instant is unknown).
alter table public.reservas
  add column checkin_real_at  timestamptz,
  add column checkout_real_at timestamptz;

comment on column public.reservas.checkin_real_at is
  'Instant the estado became Check-in. Stamped by tg_reservas_horas_reales.';
comment on column public.reservas.checkout_real_at is
  'Instant the estado became Check-out. Stamped by tg_reservas_horas_reales.';

-- Separate BEFORE trigger: the AFTER triggers of 0005 (history, folio closing)
-- stay untouched. An already-set value is never overwritten.
create or replace function public.tg_fn_reserva_horas_reales()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.estado is not distinct from old.estado then
    return new;
  end if;

  if lower(trim(new.estado)) = 'check-in' then
    new.checkin_real_at := coalesce(new.checkin_real_at, now());
  elsif lower(trim(new.estado)) = 'check-out' then
    new.checkout_real_at := coalesce(new.checkout_real_at, now());
  end if;

  return new;
end;
$$;

create trigger tg_reservas_horas_reales
  before insert or update of estado on public.reservas
  for each row execute function public.tg_fn_reserva_horas_reales();

-- ─── Surcharge concepts, seeded per tenant ───────────────────────────────────
-- Same shape as the 'Alojamiento' concept of fn_provision_tenant (0008/0014/
-- 0015): IVA 10 %, arancel 0 (the real amount is chosen at charge time), first
-- unit of measure. Idempotent by name. Skipped (with a notice) when the IVA /
-- unit catalogs are not loaded yet.
--
-- New tenants: instead of copying fn_provision_tenant a fourth time, an AFTER
-- INSERT trigger on `tenants` calls the seed, so every way of creating a
-- tenant (provisioning, multi-hotel, manual) gets the concepts.
create or replace function public.fn_seed_conceptos_horarios(p_tenant bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_iva    bigint;
  v_unidad bigint;
  v_def    record;
begin
  select i.id_iva into v_iva from public.iva i where i.valor = 10 order by i.id_iva limit 1;
  select m.id_unidades into v_unidad from public.unidades_medida m order by m.id_unidades limit 1;

  if v_iva is null or v_unidad is null then
    raise notice 'Catalogos iva/unidades_medida sin sembrar: se omiten los conceptos Late check-out / Early check-in.';
    return;
  end if;

  for v_def in
    select * from (values
      ('Late check-out', 'Recargo por salida tardía (late check-out)'),
      ('Early check-in', 'Recargo por ingreso anticipado (early check-in)')
    ) as d(nombre, descripcion)
  loop
    insert into public.conceptos
      (tenant_id, nombre, arancel, descripcion, fk_iva, fk_unidad_medida, estado)
    select p_tenant, v_def.nombre, 0, v_def.descripcion, v_iva, v_unidad, 'ACTIVO'
    where not exists (
      select 1 from public.conceptos c
      where c.tenant_id = p_tenant
        and lower(trim(c.nombre)) = lower(v_def.nombre)
    );
  end loop;
end;
$$;

create or replace function public.tg_fn_tenant_seed_conceptos_horarios()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.fn_seed_conceptos_horarios(new.id);
  return new;
end;
$$;

create trigger tg_tenants_seed_conceptos_horarios
  after insert on public.tenants
  for each row execute function public.tg_fn_tenant_seed_conceptos_horarios();

-- Existing tenants (including the template tenant, which new hotels copy from).
select public.fn_seed_conceptos_horarios(t.id) from public.tenants t;

-- ─── Establishment of a reservation (internal) ───────────────────────────────
-- SECURITY DEFINER because `edificios` is readable only by admin/gerente (0006,
-- 'admin_gerente_total'): with RLS a receptionist could not follow the
-- room -> floor -> building chain and would silently get the default settings.
-- It checks by itself that the caller is an active member of p_tenant, so it
-- reveals nothing across tenants (and only an establishment id).
create or replace function public.fn_establecimiento_de_reserva(p_tenant bigint, p_reserva bigint)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select min(e.fk_sucursal)
  from public.detalle_reservas d
  join public.habitaciones h on h.tenant_id = d.tenant_id and h.id = d.fk_habitacion
  join public.pisos p        on p.tenant_id = h.tenant_id and p.id = h.fk_piso
  join public.edificios e    on e.tenant_id = p.tenant_id and e.id = p.fk_edificio
  where d.tenant_id = p_tenant
    and d.fk_reserva = p_reserva
    and lower(trim(d.estado)) = 'activo'
    and p_tenant = public.current_tenant_id()
    and public.current_usuario_activo();
$$;

-- ─── Suggested surcharge ─────────────────────────────────────────────────────
-- SECURITY INVOKER: every table it reads is under RLS, so a reservation of
-- another tenant (or one read by an inactive user) is simply "not found".
--
-- Result columns:
--   minutos_exceso  whole minutes past the scheduled hour (late check-out) or
--                   before it (early check-in), clamped at 0. Informational:
--                   it can be > 0 and still within tolerance (monto = 0).
--   monto_sugerido  whole Gs. 0 when minutos_exceso <= tolerancia_min.
--   concepto_id     the seeded concept for the type (null if it was deleted).
--   metodo          PORCENTAJE | FIJO_HORA (the effective one).
--   tolerancia_min  the effective tolerance.
--   valor_recargo   effective percentage / Gs per hour.
--   tarifa_noche    nightly rate used by PORCENTAJE (0 without active rooms).
create or replace function public.calcular_recargo_horario(
  p_reserva bigint,
  p_tipo    text,
  p_momento timestamptz default now()
)
returns table (
  minutos_exceso integer,
  monto_sugerido numeric,
  concepto_id    bigint,
  metodo         text,
  tolerancia_min integer,
  valor_recargo  numeric,
  tarifa_noche   numeric
)
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_tipo       text := upper(trim(p_tipo));
  v_res        record;
  v_estab      bigint;
  -- Defaults when the establishment has no configuration row.
  v_hora_in    time    := time '14:00';
  v_hora_out   time    := time '11:00';
  v_tol        integer := 30;
  v_metodo     text    := 'PORCENTAJE';
  v_valor      numeric := 25;
  v_local      timestamp;
  v_prog       timestamp;
  v_exceso     integer;
  v_tarifa     numeric;
  v_monto      numeric := 0;
  v_concepto   bigint;
begin
  if v_tipo is null or v_tipo not in ('LATE_CHECKOUT', 'EARLY_CHECKIN') then
    raise exception 'Tipo de recargo invalido: % (usar LATE_CHECKOUT o EARLY_CHECKIN).', p_tipo
      using errcode = '22023';
  end if;

  select r.tenant_id, r.fecha_entrada, r.fecha_salida
  into v_res
  from public.reservas r
  where r.id_reserva = p_reserva;

  if not found then
    raise exception 'Reserva no encontrada.' using errcode = 'P0002';
  end if;

  v_estab := public.fn_establecimiento_de_reserva(v_res.tenant_id, p_reserva);

  if v_estab is not null then
    select c.hora_checkin, c.hora_checkout, c.tolerancia_min, c.metodo_recargo, c.valor_recargo
    into v_hora_in, v_hora_out, v_tol, v_metodo, v_valor
    from public.config_horarios_establecimiento c
    where c.tenant_id = v_res.tenant_id
      and c.fk_establecimiento = v_estab;
    -- `select into` leaves the targets NULL (not at their defaults) when no
    -- row matches, so restore the defaults explicitly.
    if not found then
      v_hora_in := time '14:00'; v_hora_out := time '11:00';
      v_tol := 30; v_metodo := 'PORCENTAJE'; v_valor := 25;
    end if;
  end if;

  select coalesce(max(d.precio_unitario), 0)
  into v_tarifa
  from public.detalle_reservas d
  where d.tenant_id = v_res.tenant_id
    and d.fk_reserva = p_reserva
    and lower(trim(d.estado)) = 'activo';

  -- Local wall-clock time in Paraguay (timestamp without time zone).
  v_local := p_momento at time zone 'America/Asuncion';

  if v_tipo = 'LATE_CHECKOUT' then
    v_prog   := v_res.fecha_salida + v_hora_out;
    v_exceso := floor(extract(epoch from (v_local - v_prog)) / 60)::integer;
  else
    v_prog   := v_res.fecha_entrada + v_hora_in;
    v_exceso := floor(extract(epoch from (v_prog - v_local)) / 60)::integer;
  end if;
  v_exceso := greatest(v_exceso, 0);

  if v_exceso > v_tol then
    if v_metodo = 'PORCENTAJE' then
      v_monto := round(v_tarifa * v_valor / 100);
    else
      v_monto := round(ceil(v_exceso / 60.0) * v_valor);
    end if;
  end if;

  select c.id_concepto
  into v_concepto
  from public.conceptos c
  where c.tenant_id = v_res.tenant_id
    and lower(trim(c.nombre)) = case v_tipo when 'LATE_CHECKOUT' then 'late check-out' else 'early check-in' end
  order by (lower(trim(c.estado)) = 'activo') desc, c.id_concepto
  limit 1;

  return query select v_exceso, v_monto, v_concepto, v_metodo, v_tol, v_valor, v_tarifa;
end;
$$;

comment on function public.calcular_recargo_horario(bigint, text, timestamptz) is
  'Suggested late check-out / early check-in surcharge. Hour of day read in America/Asuncion. Tolerance, method and value come from config_horarios_establecimiento (defaults when absent). SECURITY INVOKER (RLS applies).';

-- ─── Concept lookup / creation (internal) ────────────────────────────────────
-- Same idea as folioService.getOrCrearConceptoAlojamiento: find by name inside
-- the tenant, create it if a tenant lost it. SECURITY INVOKER (RLS applies).
create or replace function public.fn_concepto_por_nombre(
  p_tenant      bigint,
  p_nombre      text,
  p_descripcion text
)
returns bigint
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id     bigint;
  v_iva    bigint;
  v_unidad bigint;
begin
  select c.id_concepto into v_id
  from public.conceptos c
  where c.tenant_id = p_tenant
    and lower(trim(c.nombre)) = lower(trim(p_nombre))
  order by (lower(trim(c.estado)) = 'activo') desc, c.id_concepto
  limit 1;

  if v_id is not null then
    return v_id;
  end if;

  select i.id_iva into v_iva from public.iva i where i.valor = 10 order by i.id_iva limit 1;
  select m.id_unidades into v_unidad from public.unidades_medida m order by m.id_unidades limit 1;

  if v_iva is null or v_unidad is null then
    raise exception 'No se puede crear el concepto "%": faltan los catalogos iva/unidades_medida.', p_nombre
      using errcode = '55000';
  end if;

  insert into public.conceptos
    (tenant_id, nombre, arancel, descripcion, fk_iva, fk_unidad_medida, estado)
  values
    (p_tenant, p_nombre, 0, p_descripcion, v_iva, v_unidad, 'ACTIVO')
  returning id_concepto into v_id;

  return v_id;
end;
$$;

-- ─── Check-out / check-in with surcharge: shared implementation ──────────────
-- Public entry points are checkout_con_recargo / checkin_con_recargo below;
-- this function holds the whole transaction. It validates everything itself
-- (authorization, estado, reason), so calling it directly is no looser than
-- calling the wrappers. SECURITY INVOKER: RLS enforces the tenant boundary.
--
-- Order matters: the surcharge row is inserted BEFORE the estado update,
-- because trg_cerrar_folios_checkout (0005) closes the open folio the moment
-- the estado becomes Check-out.
--
-- Check-in and the folio: the frontend used to create the folio and the
-- automatic 'Alojamiento' charge AFTER the estado change, in separate calls.
-- To attach an early check-in surcharge atomically a folio must exist, so when
-- the reservation has NO folio yet this function creates it (estado 'abierto')
-- and posts the 'Alojamiento' charge exactly like ReservationDetail did
-- (quantity = nights x active rooms, amount = sum of the room subtotals). The
-- caller must therefore NOT create the folio / Alojamiento itself after
-- calling checkin_con_recargo; `folio_creado` in the result says whether it
-- happened.
--
-- p_monto: the final amount chosen by reception; NULL = accept the suggestion.
-- p_motivo is mandatory when the surcharge is exonerated or the amount differs
-- from the suggestion. Decimals are rounded to whole Gs.
--
-- Result (jsonb): id_reserva, estado, tipo, accion, minutos_exceso,
-- monto_sugerido, monto_final, id_folio, id_cargo, folio_creado.
-- `accion`: NINGUNO (nothing charged, nothing suggested) | APLICADO |
-- MODIFICADO | EXONERADO. Each non-NINGUNO action writes a historial_estancia
-- row of tipo_movimiento RECARGO_<accion> (actor, suggested, final, reason).
create or replace function public.fn_estancia_con_recargo(
  p_reserva  bigint,
  p_tipo     text,
  p_monto    numeric default null,
  p_motivo   text    default null,
  p_exonerar boolean default false
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_tipo         text := upper(trim(p_tipo));
  v_usuario      bigint;
  v_res          public.reservas%rowtype;
  v_calc         record;
  v_sug          numeric;
  v_final        numeric;
  v_motivo       text := nullif(trim(p_motivo), '');
  v_accion       text;
  v_etiqueta     text;
  v_nuevo_estado text;
  v_folio        bigint;
  v_folio_estado text;
  v_folio_nuevo  boolean := false;
  v_concepto     bigint;
  v_cargo        bigint;
  v_aloj_monto   numeric;
  v_aloj_hab     integer;
  v_aloj_cant    integer;
  v_c_aloj       bigint;
  v_actualizadas integer;
begin
  if v_tipo is null or v_tipo not in ('LATE_CHECKOUT', 'EARLY_CHECKIN') then
    raise exception 'Tipo de recargo invalido: % (usar LATE_CHECKOUT o EARLY_CHECKIN).', p_tipo
      using errcode = '22023';
  end if;

  if not public.current_usuario_activo() or not public.current_puede_operar() then
    raise exception 'No autorizado para operar check-in / check-out.' using errcode = '42501';
  end if;

  v_usuario := public.current_usuario_id();
  if v_usuario is null then
    raise exception 'No se pudo resolver el usuario actual.' using errcode = '42501';
  end if;

  if p_monto is not null and p_monto < 0 then
    raise exception 'El monto del recargo no puede ser negativo.' using errcode = '22023';
  end if;

  -- Row lock: two receptionists cannot check the same reservation out twice.
  select * into v_res
  from public.reservas r
  where r.id_reserva = p_reserva
  for update;

  if not found then
    raise exception 'Reserva no encontrada.' using errcode = 'P0002';
  end if;

  if v_tipo = 'LATE_CHECKOUT' then
    if lower(trim(v_res.estado)) <> 'check-in' then
      raise exception 'Solo se puede hacer check-out de una reserva en Check-in (estado actual: %).', v_res.estado
        using errcode = '55000';
    end if;
    v_etiqueta := 'Late check-out';
    v_nuevo_estado := 'Check-out';
  else
    if lower(trim(v_res.estado)) not in ('pendiente', 'confirmada') then
      raise exception 'Solo se puede hacer check-in de una reserva Pendiente o Confirmada (estado actual: %).', v_res.estado
        using errcode = '55000';
    end if;
    if not exists (
      select 1 from public.detalle_reservas d
      where d.tenant_id = v_res.tenant_id
        and d.fk_reserva = p_reserva
        and lower(trim(d.estado)) = 'activo'
    ) then
      raise exception 'No se puede hacer check-in sin habitaciones cargadas.' using errcode = '55000';
    end if;
    v_etiqueta := 'Early check-in';
    v_nuevo_estado := 'Check-in';
  end if;

  select * into v_calc from public.calcular_recargo_horario(p_reserva, v_tipo, now());
  v_sug := v_calc.monto_sugerido;

  if p_exonerar then
    v_final := 0;
  else
    v_final := round(coalesce(p_monto, v_sug));
  end if;

  v_accion := case
    when p_exonerar or (v_final = 0 and v_sug > 0) then 'EXONERADO'
    when v_final <> v_sug                           then 'MODIFICADO'
    when v_final > 0                                then 'APLICADO'
    else 'NINGUNO'
  end;

  if (p_exonerar or v_final <> v_sug) and v_motivo is null then
    raise exception 'Se requiere un motivo para % el recargo de % (sugerido: % Gs).',
      case when p_exonerar then 'exonerar' else 'modificar' end, v_etiqueta, v_sug::bigint
      using errcode = '22023';
  end if;

  -- Folio: the open one of the reservation. Check-in always ensures one exists;
  -- check-out only needs it when there is something to charge.
  select f.id_folio, lower(trim(f.estado))
  into v_folio, v_folio_estado
  from public.folios f
  where f.tenant_id = v_res.tenant_id
    and f.fk_reserva = p_reserva
  order by (lower(trim(f.estado)) = 'abierto') desc, f.id_folio desc
  limit 1
  for update;

  if v_folio is null and (v_tipo = 'EARLY_CHECKIN' or v_final > 0) then
    insert into public.folios (tenant_id, fk_reserva, estado, total_acumulado)
    values (v_res.tenant_id, p_reserva, 'abierto', 0)
    returning id_folio into v_folio;
    v_folio_estado := 'abierto';
    v_folio_nuevo := true;
  elsif v_folio is not null and v_final > 0 and v_folio_estado <> 'abierto' then
    raise exception 'El folio de la reserva esta cerrado: no se puede cargar el recargo.'
      using errcode = '55000';
  end if;

  -- First check-in: post the automatic accommodation charge, as the frontend did.
  if v_folio_nuevo and v_tipo = 'EARLY_CHECKIN' then
    select coalesce(sum(d.subtotal), 0), count(*)
    into v_aloj_monto, v_aloj_hab
    from public.detalle_reservas d
    where d.tenant_id = v_res.tenant_id
      and d.fk_reserva = p_reserva
      and lower(trim(d.estado)) = 'activo';

    if v_aloj_monto > 0 then
      v_aloj_cant := greatest(1, greatest(v_res.fecha_salida - v_res.fecha_entrada, 0) * v_aloj_hab);
      v_c_aloj := public.fn_concepto_por_nombre(
        v_res.tenant_id, 'Alojamiento', 'Cargo automático por noches de estadía');

      insert into public.cargos_folio
        (tenant_id, fk_folio, fk_concepto, cantidad, monto_unitario, monto_total, fk_usuario, estado)
      values
        (v_res.tenant_id, v_folio, v_c_aloj, v_aloj_cant, v_aloj_monto / v_aloj_cant, v_aloj_monto,
         v_usuario, 'ACTIVO');

      update public.folios
      set total_acumulado = total_acumulado + v_aloj_monto
      where id_folio = v_folio and tenant_id = v_res.tenant_id;
    end if;
  end if;

  -- The surcharge itself.
  if v_final > 0 then
    v_concepto := coalesce(
      v_calc.concepto_id,
      public.fn_concepto_por_nombre(
        v_res.tenant_id, v_etiqueta,
        case v_tipo when 'LATE_CHECKOUT' then 'Recargo por salida tardía (late check-out)'
                    else 'Recargo por ingreso anticipado (early check-in)' end));

    insert into public.cargos_folio
      (tenant_id, fk_folio, fk_concepto, cantidad, monto_unitario, monto_total, fk_usuario, estado)
    values
      (v_res.tenant_id, v_folio, v_concepto, 1, v_final, v_final, v_usuario, 'ACTIVO')
    returning id_cargo into v_cargo;

    update public.folios
    set total_acumulado = total_acumulado + v_final
    where id_folio = v_folio and tenant_id = v_res.tenant_id;
  end if;

  if v_accion <> 'NINGUNO' then
    insert into public.historial_estancia
      (tenant_id, fk_reserva, tipo_movimiento, descripcion, fk_usuario)
    values
      (v_res.tenant_id, p_reserva, 'RECARGO_' || v_accion,
       format('%s: sugerido %s Gs, final %s Gs (%s min de exceso, metodo %s). Motivo: %s',
              v_etiqueta, v_sug::bigint, v_final::bigint, v_calc.minutos_exceso, v_calc.metodo,
              coalesce(v_motivo, '-')),
       v_usuario);
  end if;

  -- Last: the estado change fires the 0005 triggers (history, folio closing)
  -- and the real-timestamp trigger of this migration.
  update public.reservas
  set estado = v_nuevo_estado
  where id_reserva = p_reserva
    and tenant_id = v_res.tenant_id;
  get diagnostics v_actualizadas = row_count;

  if v_actualizadas <> 1 then
    raise exception 'No se pudo actualizar el estado de la reserva.' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'id_reserva',     p_reserva,
    'estado',         v_nuevo_estado,
    'tipo',           v_tipo,
    'accion',         v_accion,
    'minutos_exceso', v_calc.minutos_exceso,
    'monto_sugerido', v_sug,
    'monto_final',    v_final,
    'id_folio',       v_folio,
    'id_cargo',       v_cargo,
    'folio_creado',   v_folio_nuevo
  );
end;
$$;

create or replace function public.checkout_con_recargo(
  p_reserva  bigint,
  p_monto    numeric default null,
  p_motivo   text    default null,
  p_exonerar boolean default false
)
returns jsonb
language sql
security invoker
set search_path = public
as $$
  select public.fn_estancia_con_recargo(p_reserva, 'LATE_CHECKOUT', p_monto, p_motivo, p_exonerar);
$$;

create or replace function public.checkin_con_recargo(
  p_reserva  bigint,
  p_monto    numeric default null,
  p_motivo   text    default null,
  p_exonerar boolean default false
)
returns jsonb
language sql
security invoker
set search_path = public
as $$
  select public.fn_estancia_con_recargo(p_reserva, 'EARLY_CHECKIN', p_monto, p_motivo, p_exonerar);
$$;

comment on function public.checkout_con_recargo(bigint, numeric, text, boolean) is
  'Atomic check-out: late check-out surcharge (suggested, edited or exonerated; reason mandatory unless accepted as suggested) + historial + estado Check-out. p_monto NULL = accept the suggestion.';
comment on function public.checkin_con_recargo(bigint, numeric, text, boolean) is
  'Atomic check-in: early check-in surcharge + historial + estado Check-in. Creates the folio and its Alojamiento charge when the reservation has none yet.';

-- ─── Privileges ──────────────────────────────────────────────────────────────
-- Convention of 0011/0012: revoke the implicit grants, then grant explicitly.
revoke execute on function public.fn_seed_conceptos_horarios(bigint)           from public, anon, authenticated;
revoke execute on function public.tg_fn_tenant_seed_conceptos_horarios()       from public, anon, authenticated;
revoke execute on function public.tg_fn_config_horarios_updated_at()           from public, anon, authenticated;
revoke execute on function public.tg_fn_reserva_horas_reales()                 from public, anon, authenticated;

revoke execute on function public.calcular_recargo_horario(bigint, text, timestamptz)                  from public, anon, authenticated;
revoke execute on function public.fn_establecimiento_de_reserva(bigint, bigint)                        from public, anon, authenticated;
revoke execute on function public.fn_concepto_por_nombre(bigint, text, text)                           from public, anon, authenticated;
revoke execute on function public.fn_estancia_con_recargo(bigint, text, numeric, text, boolean)        from public, anon, authenticated;
revoke execute on function public.checkout_con_recargo(bigint, numeric, text, boolean)                 from public, anon, authenticated;
revoke execute on function public.checkin_con_recargo(bigint, numeric, text, boolean)                  from public, anon, authenticated;

grant execute on function public.calcular_recargo_horario(bigint, text, timestamptz)                   to authenticated;
-- Internal helpers of the RPCs: they run as the caller (SECURITY INVOKER), so
-- EXECUTE is required for the wrappers to call them; RLS still bounds them.
grant execute on function public.fn_establecimiento_de_reserva(bigint, bigint)                         to authenticated;
grant execute on function public.fn_concepto_por_nombre(bigint, text, text)                            to authenticated;
grant execute on function public.fn_estancia_con_recargo(bigint, text, numeric, text, boolean)         to authenticated;
grant execute on function public.checkout_con_recargo(bigint, numeric, text, boolean)                  to authenticated;
grant execute on function public.checkin_con_recargo(bigint, numeric, text, boolean)                   to authenticated;
