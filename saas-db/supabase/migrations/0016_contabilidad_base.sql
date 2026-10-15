-- ═══════════════════════════════════════════════════════════════════════════
-- 0016 · Accounting base (double entry)
-- ═══════════════════════════════════════════════════════════════════════════
-- Foundation of the journal that migrations 0017+ post into (chart of
-- accounts, funds, credit invoices, expenses, collections, payments, reports):
--
--   * cuentas_contables: `fk_tipo_cuenta` becomes bigint (matches the
--     catalog), and gains `clave` (system key such as CXC_CLIENTES, unique per
--     hotel when present) and `activo`. `codigo` becomes unique per hotel.
--   * asientos: `nro_asiento` is sequential per hotel (asiento_secuencia, the
--     same pattern as factura_secuencia in 0005), `estado` and `origen_tipo`
--     are checked, and there is an index by origin.
--   * detalle_asientos: amount check (debe XOR haber, greater than 0) and a
--     DEFERRED constraint trigger that requires sum(debe) = sum(haber) per
--     asiento.
--   * fn_contabilizar / fn_contabilizar_reverso: the only functions that
--     write asientos on behalf of the business triggers. SECURITY DEFINER, no
--     EXECUTE for authenticated or anon (other definer functions of 0018+ use
--     them).
--   * RLS: accounting moves from rule `admin_gerente` to `admin_gerente_total`
--     (0006): only admin and gerente can READ it too. The RESTRICTIVE write
--     policies of 0014 (valid subscription and `contabilidad` module) are not
--     touched.
--
-- New functions are born without EXECUTE (0012); nothing is granted on purpose.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── cuentas_contables ───────────────────────────────────────────────────────
-- The FK to tipo_cuenta_contable (bigint) was already valid with an integer
-- column; changing the type only aligns it with the catalog.
alter table public.cuentas_contables
  alter column fk_tipo_cuenta type bigint;

alter table public.cuentas_contables
  add column if not exists clave  text,
  add column if not exists activo boolean not null default true;

-- A repeated codigo inside a hotel (possible: there was no constraint) gets the
-- row id appended so the constraint can be created without losing accounts.
update public.cuentas_contables c
set codigo = c.codigo || '-' || c.id
from (
  select id, row_number() over (partition by tenant_id, codigo order by id) as rn
  from public.cuentas_contables
  where codigo is not null
) d
where d.id = c.id and d.rn > 1;

alter table public.cuentas_contables
  drop constraint if exists cuentas_contables_tenant_codigo_key;
alter table public.cuentas_contables
  add constraint cuentas_contables_tenant_codigo_key unique (tenant_id, codigo);

-- Partial index: several accounts without a key coexist, keys never repeat.
create unique index if not exists cuentas_contables_tenant_clave_key
  on public.cuentas_contables (tenant_id, clave)
  where clave is not null;

comment on column public.cuentas_contables.clave is
  'System key (e.g. CAJA, CXC_CLIENTES, IVA_DEBITO) used by the posting functions to find the account. Unique per hotel when not null.';
comment on column public.cuentas_contables.activo is
  'An inactive account does not receive new entries.';

-- ─── Entry numbering ─────────────────────────────────────────────────────────
-- One counter per hotel. Read-only for the client (rule `solo_lectura` of
-- 0006): the only write path is fn_siguiente_nro_asiento, which runs as definer.
create table if not exists public.asiento_secuencia (
  tenant_id bigint primary key default public.current_tenant_id() references public.tenants (id),
  ultimo    bigint not null default 0
);

alter table public.asiento_secuencia enable row level security;

revoke insert, update, delete on public.asiento_secuencia from authenticated;

-- Duplicate numbers inside a hotel (there was no constraint) are renumbered
-- keeping their relative order; the counter then starts at the maximum.
do $$
begin
  if exists (
    select 1 from public.asientos
    group by tenant_id, nro_asiento
    having count(*) > 1
  ) then
    update public.asientos a
    set nro_asiento = n.rn
    from (
      select id, row_number() over (partition by tenant_id order by nro_asiento, id) as rn
      from public.asientos
    ) n
    where a.id = n.id;
  end if;
end;
$$;

insert into public.asiento_secuencia (tenant_id, ultimo)
select tenant_id, max(nro_asiento)
from public.asientos
group by tenant_id
on conflict (tenant_id) do update
  set ultimo = greatest(public.asiento_secuencia.ultimo, excluded.ultimo);

create or replace function public.fn_siguiente_nro_asiento(p_tenant bigint)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next bigint;
begin
  insert into public.asiento_secuencia (tenant_id, ultimo)
  values (p_tenant, 1)
  on conflict (tenant_id)
    do update set ultimo = public.asiento_secuencia.ultimo + 1
  returning ultimo into v_next;

  return v_next;
end;
$$;

comment on function public.fn_siguiente_nro_asiento(bigint) is
  'Next nro_asiento of the hotel. Internal (no EXECUTE for the client): called by fn_contabilizar.';

-- ─── asientos ────────────────────────────────────────────────────────────────
alter table public.asientos
  drop constraint if exists asientos_tenant_nro_asiento_key;
alter table public.asientos
  add constraint asientos_tenant_nro_asiento_key unique (tenant_id, nro_asiento);

-- The checks are created NOT VALID and validated afterwards: an old
-- out-of-range row does not abort the migration (a WARNING is raised), yet
-- every new row is checked from now on.
alter table public.asientos
  drop constraint if exists asientos_estado_check,
  drop constraint if exists asientos_origen_tipo_check;
alter table public.asientos
  add constraint asientos_estado_check
    check (estado in ('CONTABILIZADO', 'ANULADO')) not valid,
  add constraint asientos_origen_tipo_check
    check (origen_tipo is null or origen_tipo in (
      'factura', 'factura_anulacion', 'cobro', 'cobro_anulacion',
      'gasto', 'gasto_anulacion', 'pago', 'pago_anulacion',
      'transferencia', 'transferencia_anulacion', 'saldo_inicial', 'manual'
    )) not valid;

create index if not exists asientos_origen_idx
  on public.asientos (tenant_id, origen_tipo, fk_origen);

comment on column public.asientos.estado is
  'CONTABILIZADO or ANULADO. An annulled entry and its reversal (<tipo>_anulacion) are both left ANULADO: they net to zero whether a report includes or excludes them.';

-- ─── detalle_asientos ────────────────────────────────────────────────────────
alter table public.detalle_asientos
  drop constraint if exists detalle_asientos_tenant_id_key,
  drop constraint if exists detalle_asientos_debe_haber_check;
alter table public.detalle_asientos
  add constraint detalle_asientos_tenant_id_key unique (tenant_id, id),
  add constraint detalle_asientos_debe_haber_check
    check ((debe > 0 and haber = 0) or (debe = 0 and haber > 0)) not valid;

do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('asientos',          'asientos_estado_check'),
      ('asientos',          'asientos_origen_tipo_check'),
      ('detalle_asientos',  'detalle_asientos_debe_haber_check')
    ) as v(tabla, restriccion)
  loop
    begin
      execute format('alter table public.%I validate constraint %I', r.tabla, r.restriccion);
    exception
      when check_violation then
        raise warning 'Constraint % has older rows that violate it; it only applies to new rows. Fix them and run VALIDATE CONSTRAINT.', r.restriccion;
    end;
  end loop;
end;
$$;

-- Balance: sum(debe) = sum(haber) per asiento, checked when the transaction
-- commits (DEFERRABLE INITIALLY DEFERRED) so lines can be inserted one by one.
-- SECURITY DEFINER: the sum must see every line of the asiento even if the role
-- that commits sees fewer rows through RLS.
create or replace function public.tg_fn_asiento_balanceado()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenants  bigint[] := '{}';
  v_asientos bigint[] := '{}';
  v_debe     numeric;
  v_haber    numeric;
  i          integer;
begin
  if tg_op in ('INSERT', 'UPDATE') then
    v_tenants  := v_tenants  || new.tenant_id;
    v_asientos := v_asientos || new.fk_asientos;
  end if;
  if tg_op = 'DELETE'
     or (tg_op = 'UPDATE'
         and (old.tenant_id, old.fk_asientos) is distinct from (new.tenant_id, new.fk_asientos)) then
    v_tenants  := v_tenants  || old.tenant_id;
    v_asientos := v_asientos || old.fk_asientos;
  end if;

  for i in 1 .. coalesce(array_length(v_asientos, 1), 0) loop
    select coalesce(sum(d.debe), 0), coalesce(sum(d.haber), 0)
    into v_debe, v_haber
    from public.detalle_asientos d
    where d.tenant_id = v_tenants[i]
      and d.fk_asientos = v_asientos[i];

    if v_debe <> v_haber then
      raise exception 'El asiento % no balancea: debe % y haber %.', v_asientos[i], v_debe, v_haber
        using errcode = '23514';
    end if;
  end loop;

  return null;
end;
$$;

drop trigger if exists detalle_asientos_balanceado on public.detalle_asientos;
create constraint trigger detalle_asientos_balanceado
  after insert or update or delete on public.detalle_asientos
  deferrable initially deferred
  for each row execute function public.tg_fn_asiento_balanceado();

-- ─── Account lookup by key ───────────────────────────────────────────────────
create or replace function public.fn_cuenta_por_clave(p_tenant bigint, p_clave text)
returns bigint
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_id     bigint;
  v_activo boolean;
begin
  select c.id, c.activo into v_id, v_activo
  from public.cuentas_contables c
  where c.tenant_id = p_tenant
    and c.clave = p_clave;

  if v_id is null then
    raise exception 'Falta la cuenta contable con clave "%" en el plan de cuentas de este hotel.', p_clave
      using errcode = 'P0002';
  end if;
  if not v_activo then
    raise exception 'La cuenta contable con clave "%" esta inactiva y no puede recibir asientos.', p_clave
      using errcode = 'P0002';
  end if;

  return v_id;
end;
$$;

comment on function public.fn_cuenta_por_clave(bigint, text) is
  'Id of the hotel''s active account with that system key; raises a clear error when missing. Internal (no EXECUTE for the client).';

-- ─── Posting ─────────────────────────────────────────────────────────────────
-- p_lineas: jsonb array of {clave | fk_cuenta, debe, haber}. Everything is
-- validated before writing, so an invalid input does not consume an entry
-- number. The accounting date is the hotel's local day (America/Asuncion),
-- stored as local noon so the round trip back to a date is stable.
create or replace function public.fn_contabilizar(
  p_tenant      bigint,
  p_fecha       date,
  p_sucursal    bigint,
  p_desc        text,
  p_origen_tipo text,
  p_origen      bigint,
  p_lineas      jsonb
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  c_origenes constant text[] := array[
    'factura', 'factura_anulacion', 'cobro', 'cobro_anulacion',
    'gasto', 'gasto_anulacion', 'pago', 'pago_anulacion',
    'transferencia', 'transferencia_anulacion', 'saldo_inicial', 'manual'];
  v_linea     jsonb;
  v_clave     text;
  v_fk        bigint;
  v_cuenta    bigint;
  v_imputable boolean;
  v_activo    boolean;
  v_debe      numeric;
  v_haber     numeric;
  v_tot_debe  numeric := 0;
  v_tot_haber numeric := 0;
  v_cuentas   bigint[] := '{}';
  v_debes     numeric[] := '{}';
  v_haberes   numeric[] := '{}';
  v_asiento   bigint;
  v_nro       bigint;
  i           integer;
begin
  if p_tenant is null or p_fecha is null or p_sucursal is null then
    raise exception 'Faltan el hotel, la fecha o el establecimiento del asiento.' using errcode = '23514';
  end if;
  if p_desc is null or length(trim(p_desc)) = 0 then
    raise exception 'El asiento necesita una descripcion.' using errcode = '23514';
  end if;
  if p_origen_tipo is not null and not (p_origen_tipo = any (c_origenes)) then
    raise exception 'El origen "%" no es un tipo de asiento valido.', p_origen_tipo using errcode = '23514';
  end if;
  if p_lineas is null or jsonb_typeof(p_lineas) <> 'array' or jsonb_array_length(p_lineas) < 2 then
    raise exception 'El asiento necesita al menos dos lineas.' using errcode = '23514';
  end if;

  if not exists (
    select 1 from public.establecimientos e
    where e.tenant_id = p_tenant and e.id_establecimiento = p_sucursal
  ) then
    raise exception 'El establecimiento % no pertenece a este hotel.', p_sucursal using errcode = '23503';
  end if;

  for v_linea in select value from jsonb_array_elements(p_lineas) loop
    if jsonb_typeof(v_linea) <> 'object' then
      raise exception 'Cada linea del asiento debe ser un objeto.' using errcode = '23514';
    end if;

    v_clave := nullif(trim(v_linea ->> 'clave'), '');
    v_fk    := nullif(v_linea ->> 'fk_cuenta', '')::bigint;
    if (v_clave is null) = (v_fk is null) then
      raise exception 'Cada linea debe indicar la cuenta con clave o fk_cuenta (solo una).' using errcode = '23514';
    end if;

    v_debe  := coalesce(nullif(v_linea ->> 'debe', '')::numeric, 0);
    v_haber := coalesce(nullif(v_linea ->> 'haber', '')::numeric, 0);
    if v_debe < 0 or v_haber < 0 or (v_debe > 0) = (v_haber > 0) then
      raise exception 'Cada linea debe tener un importe positivo en el debe o en el haber (no ambos ni ninguno).'
        using errcode = '23514';
    end if;

    if v_clave is not null then
      v_cuenta := public.fn_cuenta_por_clave(p_tenant, v_clave);
    else
      v_cuenta := v_fk;
    end if;

    select c.imputable, c.activo into v_imputable, v_activo
    from public.cuentas_contables c
    where c.tenant_id = p_tenant and c.id = v_cuenta;

    if not found then
      raise exception 'La cuenta contable % no pertenece a este hotel.', v_cuenta using errcode = '23503';
    end if;
    if not v_activo then
      raise exception 'La cuenta contable % esta inactiva y no puede recibir asientos.', v_cuenta
        using errcode = 'P0002';
    end if;
    if not v_imputable then
      raise exception 'La cuenta contable % no es imputable: solo las cuentas de detalle reciben asientos.', v_cuenta
        using errcode = '23514';
    end if;

    v_cuentas := v_cuentas || v_cuenta;
    v_debes   := v_debes   || v_debe;
    v_haberes := v_haberes || v_haber;
    v_tot_debe  := v_tot_debe  + v_debe;
    v_tot_haber := v_tot_haber + v_haber;
  end loop;

  if v_tot_debe <> v_tot_haber then
    raise exception 'El asiento no balancea: debe % y haber %.', v_tot_debe, v_tot_haber
      using errcode = '23514';
  end if;

  v_nro := public.fn_siguiente_nro_asiento(p_tenant);

  insert into public.asientos
    (tenant_id, fecha, descripcion, nro_asiento, fk_sucursal, estado, origen_tipo, fk_origen)
  values
    (p_tenant, (p_fecha + time '12:00') at time zone 'America/Asuncion', p_desc, v_nro,
     p_sucursal, 'CONTABILIZADO', p_origen_tipo, p_origen)
  returning id into v_asiento;

  for i in 1 .. array_length(v_cuentas, 1) loop
    insert into public.detalle_asientos (tenant_id, fk_cuenta_contables, fk_asientos, debe, haber)
    values (p_tenant, v_cuentas[i], v_asiento, v_debes[i], v_haberes[i]);
  end loop;

  return v_asiento;
end;
$$;

comment on function public.fn_contabilizar(bigint, date, bigint, text, text, bigint, jsonb) is
  'Posts a balanced CONTABILIZADO asiento and its lines in one call. Internal (no EXECUTE for the client).';

-- Reversal: a new <tipo>_anulacion asiento with the same fk_origen and debe/haber
-- swapped. The original and its reversal are both left ANULADO (linked pair).
create or replace function public.fn_contabilizar_reverso(
  p_tenant      bigint,
  p_origen_tipo text,
  p_origen      bigint,
  p_fecha       date
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_orig  public.asientos%rowtype;
  v_rev   bigint;
  v_nro   bigint;
  v_fecha date := coalesce(p_fecha, (now() at time zone 'America/Asuncion')::date);
begin
  if p_origen_tipo is null
     or p_origen_tipo not in ('factura', 'cobro', 'gasto', 'pago', 'transferencia') then
    raise exception 'El origen "%" no admite reverso.', coalesce(p_origen_tipo, 'null') using errcode = '23514';
  end if;

  -- Lock the original: two simultaneous annulments cannot duplicate the reversal.
  select a.* into v_orig
  from public.asientos a
  where a.tenant_id = p_tenant
    and a.origen_tipo = p_origen_tipo
    and a.fk_origen = p_origen
  order by a.id desc
  limit 1
  for update;

  if not found then
    raise exception 'No hay un asiento contabilizado para % %.', p_origen_tipo, p_origen
      using errcode = 'P0002';
  end if;
  if v_orig.estado = 'ANULADO' then
    raise exception 'El asiento de % % ya fue anulado.', p_origen_tipo, p_origen
      using errcode = '55000';
  end if;

  v_nro := public.fn_siguiente_nro_asiento(p_tenant);

  insert into public.asientos
    (tenant_id, fecha, descripcion, nro_asiento, fk_sucursal, estado, origen_tipo, fk_origen)
  values
    (p_tenant, (v_fecha + time '12:00') at time zone 'America/Asuncion',
     'Anulacion: ' || v_orig.descripcion, v_nro, v_orig.fk_sucursal,
     'CONTABILIZADO', p_origen_tipo || '_anulacion', p_origen)
  returning id into v_rev;

  insert into public.detalle_asientos (tenant_id, fk_cuenta_contables, fk_asientos, debe, haber)
  select d.tenant_id, d.fk_cuenta_contables, v_rev, d.haber, d.debe
  from public.detalle_asientos d
  where d.tenant_id = p_tenant and d.fk_asientos = v_orig.id;

  update public.asientos
  set estado = 'ANULADO'
  where tenant_id = p_tenant and id in (v_orig.id, v_rev);

  return v_rev;
end;
$$;

comment on function public.fn_contabilizar_reverso(bigint, text, bigint, date) is
  'Annuls the asiento of an origin by posting its inverse (<tipo>_anulacion). Leaves both ANULADO. Internal (no EXECUTE for the client).';

-- The 0012 guard already removes EXECUTE from new functions; repeated here so the
-- migration is correct even if that event trigger could not be created.
revoke execute on function public.fn_siguiente_nro_asiento(bigint) from public, anon, authenticated;
revoke execute on function public.fn_cuenta_por_clave(bigint, text) from public, anon, authenticated;
revoke execute on function public.fn_contabilizar(bigint, date, bigint, text, text, bigint, jsonb) from public, anon, authenticated;
revoke execute on function public.fn_contabilizar_reverso(bigint, text, bigint, date) from public, anon, authenticated;
revoke execute on function public.tg_fn_asiento_balanceado() from public, anon, authenticated;

-- ─── RLS ─────────────────────────────────────────────────────────────────────
-- 0006 generated `<table>_select|insert|update|delete`. For rules `admin_gerente`
-- and `admin_gerente_total` the write policies are identical: only the read one
-- differs, which now also requires admin or gerente. That one policy is replaced;
-- the others (including the RESTRICTIVE ones of 0014) stay as they were.
do $$
declare
  t text;
begin
  foreach t in array array['cuentas_contables', 'asientos', 'detalle_asientos', 'saldos_mensuales'] loop
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (
         tenant_id = (select public.current_tenant_id())
         and (select public.current_usuario_activo())
         and (select public.current_es_admin_o_gerente()))',
      t || '_select', t);
  end loop;
end;
$$;

-- asiento_secuencia: rule `solo_lectura` (no write policies).
drop policy if exists asiento_secuencia_select on public.asiento_secuencia;
create policy asiento_secuencia_select on public.asiento_secuencia
  for select to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and (select public.current_usuario_activo())
  );

-- ─── saldos_mensuales ────────────────────────────────────────────────────────
comment on table public.saldos_mensuales is
  'Intentionally unused. Balances are always computed from detalle_asientos (the reports of 0021 aggregate the journal), so no table keeps monthly running totals that could drift from it. Kept only to avoid dropping a table; do not write to it.';
