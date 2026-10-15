-- ═══════════════════════════════════════════════════════════════════════════
-- 0018 · Funds, credit invoices and automatic posting of invoices
-- ═══════════════════════════════════════════════════════════════════════════
-- Adds the pieces that connect invoicing with the double-entry ledger of 0016:
--
--   * cuentas_fondos: the places money lives (shift cash, petty cash, banks).
--     Each fund owns one ledger account, created automatically as a child of
--     DISPONIBILIDADES (1.1.01.NN) when the fund is inserted without one.
--   * medios_pago_fondo: which fund receives each payment method (modo_pago).
--     Anything unmapped (Efectivo included) lands in the fund of the shift's
--     caja, so invoicing never blocks for lack of configuration.
--   * Every caja gets a `caja_turno` fund (trigger on caja, backfill for the
--     existing ones). Provisioning creates the caja BEFORE copying the chart, so
--     fn_copiar_plan_cuentas_plantilla (0017) now also seeds the funds.
--   * facturas: fecha_vencimiento, saldo_pendiente, condicion_venta limited to
--     1 (contado) / 2 (credito), fk_modo_pago optional for credit sales. A credit
--     invoice needs the plan module `contabilidad`.
--   * Triggers on facturas post the journal entry in the same transaction:
--       contado  -> debit the resolved fund, credit sales by VAT rate and VAT
--       credito  -> debit CXC_CLIENTES, same credits, saldo_pendiente = total
--       ANULADA  -> reversal entry; saldo_pendiente = 0
--     They run for every plan (basico included). Historical invoices are not
--     posted: the ledger starts when this migration runs.
--
-- Idempotent: running the file again changes nothing.
-- New functions are born without EXECUTE (0012); nothing is granted on purpose.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── cuentas_fondos ──────────────────────────────────────────────────────────
-- fk_cuenta_contable is NOT NULL, but the BEFORE INSERT trigger below fills it
-- in before the constraint is checked, so callers normally omit it.
create table if not exists public.cuentas_fondos (
  id                  bigint generated always as identity primary key,
  tenant_id           bigint not null default public.current_tenant_id() references public.tenants (id),
  created_at          timestamptz not null default now(),
  nombre              text not null check (length(trim(nombre)) > 0),
  tipo                text not null check (tipo in ('caja_turno', 'caja_chica', 'banco')),
  fk_cuenta_contable  bigint not null,
  fk_caja             bigint,
  activo              boolean not null default true,
  constraint cuentas_fondos_tenant_id_key unique (tenant_id, id),
  constraint cuentas_fondos_tenant_nombre_key unique (tenant_id, nombre),
  constraint cuentas_fondos_tenant_cuenta_key unique (tenant_id, fk_cuenta_contable),
  -- Only shift funds point at a caja, and every shift fund does.
  constraint cuentas_fondos_tipo_caja_check check ((tipo = 'caja_turno') = (fk_caja is not null)),
  constraint cuentas_fondos_cuenta_fkey
    foreign key (tenant_id, fk_cuenta_contable) references public.cuentas_contables (tenant_id, id),
  constraint cuentas_fondos_caja_fkey
    foreign key (tenant_id, fk_caja) references public.caja (tenant_id, id_caja)
);

-- At most one fund per caja inside a hotel.
create unique index if not exists cuentas_fondos_caja_key
  on public.cuentas_fondos (tenant_id, fk_caja)
  where fk_caja is not null;

comment on table public.cuentas_fondos is
  'Places where the hotel keeps money (shift cash, petty cash, banks). Each one owns a ledger account under DISPONIBILIDADES.';
comment on column public.cuentas_fondos.fk_caja is
  'Only for tipo caja_turno: the caja whose shifts collect into this fund.';

-- ─── medios_pago_fondo ───────────────────────────────────────────────────────
create table if not exists public.medios_pago_fondo (
  id            bigint generated always as identity primary key,
  tenant_id     bigint not null default public.current_tenant_id() references public.tenants (id),
  created_at    timestamptz not null default now(),
  fk_modo_pago  bigint not null references public.modo_pago (id_modo_pago),
  fk_fondo      bigint not null,
  constraint medios_pago_fondo_tenant_id_key unique (tenant_id, id),
  constraint medios_pago_fondo_tenant_modo_key unique (tenant_id, fk_modo_pago),
  constraint medios_pago_fondo_fondo_fkey
    foreign key (tenant_id, fk_fondo) references public.cuentas_fondos (tenant_id, id)
);

create index if not exists medios_pago_fondo_fondo_idx
  on public.medios_pago_fondo (tenant_id, fk_fondo);

comment on table public.medios_pago_fondo is
  'Fund that receives each payment method. A method without a row falls back to the fund of the shift''s caja.';

-- ─── RLS (rule `admin_gerente_total` of 0006) ────────────────────────────────
-- Same policies as categorias_finanzas (0017): admin and gerente read and write,
-- plus the RESTRICTIVE ones of 0014 (valid subscription, module `contabilidad`).
-- Drop-then-create keeps the block re-runnable.
alter table public.cuentas_fondos enable row level security;
alter table public.medios_pago_fondo enable row level security;

do $$
declare
  t         text;
  v_tenant  constant text := 'tenant_id = (select public.current_tenant_id())';
  v_activo  constant text := '(select public.current_usuario_activo())';
  v_admgrt  constant text := '(select public.current_es_admin_o_gerente())';
  v_vigente constant text := '(select public.fn_suscripcion_vigente((select public.current_tenant_id())))';
  v_modulo  constant text := '(select public.fn_modulo_habilitado((select public.current_tenant_id()), ''contabilidad''))';
  v_acceso  constant text := v_tenant || ' and ' || v_activo || ' and ' || v_admgrt;
  v_op      text;
begin
  foreach t in array array['cuentas_fondos', 'medios_pago_fondo'] loop
    foreach v_op in array array['select', 'insert', 'update', 'delete'] loop
      execute format('drop policy if exists %I on public.%I', t || '_' || v_op, t);
    end loop;
    foreach v_op in array array['insert', 'update', 'delete'] loop
      execute format('drop policy if exists %I on public.%I', t || '_vigente_' || v_op, t);
      execute format('drop policy if exists %I on public.%I', t || '_modulo_' || v_op, t);
    end loop;

    execute format('create policy %I on public.%I for select to authenticated using (%s)',
                   t || '_select', t, v_acceso);
    execute format('create policy %I on public.%I for insert to authenticated with check (%s)',
                   t || '_insert', t, v_acceso);
    execute format('create policy %I on public.%I for update to authenticated using (%s) with check (%s)',
                   t || '_update', t, v_acceso, v_acceso);
    execute format('create policy %I on public.%I for delete to authenticated using (%s)',
                   t || '_delete', t, v_acceso);

    execute format('create policy %I on public.%I as restrictive for insert to authenticated with check (%s)',
                   t || '_vigente_insert', t, v_vigente);
    execute format('create policy %I on public.%I as restrictive for update to authenticated using (%s) with check (%s)',
                   t || '_vigente_update', t, v_vigente, v_vigente);
    execute format('create policy %I on public.%I as restrictive for delete to authenticated using (%s)',
                   t || '_vigente_delete', t, v_vigente);

    execute format('create policy %I on public.%I as restrictive for insert to authenticated with check (%s)',
                   t || '_modulo_insert', t, v_modulo);
    execute format('create policy %I on public.%I as restrictive for update to authenticated using (%s) with check (%s)',
                   t || '_modulo_update', t, v_modulo, v_modulo);
    execute format('create policy %I on public.%I as restrictive for delete to authenticated using (%s)',
                   t || '_modulo_delete', t, v_modulo);
  end loop;
end;
$$;

-- ─── Ledger account of a fund ────────────────────────────────────────────────
-- Creates the next free child of DISPONIBILIDADES (<parent code>.NN, NN from 01)
-- named like the fund. The parent row is locked FOR UPDATE, so two concurrent
-- fund creations of one hotel get different codes (and the unique
-- (tenant_id, codigo) of 0016 is the last line of defence). Definer: the caller
-- may be a receptionist's caja insert, which has no access to the chart.
create or replace function public.fn_crear_cuenta_fondo(p_tenant bigint, p_nombre text)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_padre    bigint;
  v_cod      text;
  v_tipo     bigint;
  v_prefijo  text;
  v_n        integer;
  v_id       bigint;
begin
  select c.id, c.codigo, c.fk_tipo_cuenta into v_padre, v_cod, v_tipo
  from public.cuentas_contables c
  where c.tenant_id = p_tenant and c.clave = 'DISPONIBILIDADES'
  for update;

  if v_padre is null then
    raise exception 'El plan de cuentas del hotel no tiene la cuenta DISPONIBILIDADES: no se puede crear la cuenta del fondo.'
      using errcode = 'P0002';
  end if;

  v_prefijo := coalesce(v_cod, '1.1.01') || '.';

  select coalesce(max(substr(c.codigo, length(v_prefijo) + 1)::integer), 0) + 1 into v_n
  from public.cuentas_contables c
  where c.tenant_id = p_tenant
    and starts_with(c.codigo, v_prefijo)
    and substr(c.codigo, length(v_prefijo) + 1) ~ '^[0-9]{1,9}$';

  insert into public.cuentas_contables
    (tenant_id, nombre, codigo, fk_tipo_cuenta, imputable, fk_cuenta_padre, activo)
  values
    (p_tenant, p_nombre, v_prefijo || lpad(v_n::text, 2, '0'), v_tipo, true, v_padre, true)
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.fn_crear_cuenta_fondo(bigint, text) is
  'Creates the imputable ledger account of a fund under DISPONIBILIDADES (next free 1.1.01.NN). Internal (no EXECUTE for the client).';

create or replace function public.tg_fn_fondo_cuenta()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.fk_cuenta_contable is null then
    new.fk_cuenta_contable := public.fn_crear_cuenta_fondo(new.tenant_id, new.nombre);
  end if;
  return new;
end;
$$;

drop trigger if exists cuentas_fondos_cuenta on public.cuentas_fondos;
create trigger cuentas_fondos_cuenta
  before insert on public.cuentas_fondos
  for each row execute function public.tg_fn_fondo_cuenta();

-- ─── A fund for every caja ───────────────────────────────────────────────────
-- Gives each caja of a hotel that has none a `caja_turno` fund named like the
-- caja (suffix " #<id>" when the name is taken). Does nothing for the template
-- tenant, for a hotel without a chart or without DISPONIBILIDADES: such a hotel
-- simply has no ledger yet. Serialised per hotel with an advisory lock.
create or replace function public.fn_asegurar_fondos_cajas(p_tenant bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r        record;
  v_nombre text;
begin
  if not exists (
    select 1 from public.tenants t
    where t.id = p_tenant
      and not (t.slug = 'plantilla-base' and t.estado = 'suspendido' and t.plan = 'plantilla')
  ) then
    return;
  end if;

  if not exists (
    select 1 from public.cuentas_contables c
    where c.tenant_id = p_tenant and c.clave = 'DISPONIBILIDADES'
  ) then
    return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('fondos_cajas:' || p_tenant::text, 0));

  for r in
    select c.id_caja, c.nro_caja, c.descripcion_caja
    from public.caja c
    where c.tenant_id = p_tenant
      and not exists (
        select 1 from public.cuentas_fondos f
        where f.tenant_id = c.tenant_id and f.fk_caja = c.id_caja
      )
    order by c.id_caja
  loop
    v_nombre := coalesce(nullif(trim(r.descripcion_caja), ''), 'Caja ' || r.nro_caja);
    if exists (select 1 from public.cuentas_fondos f where f.tenant_id = p_tenant and f.nombre = v_nombre) then
      v_nombre := v_nombre || ' #' || r.id_caja;
    end if;

    insert into public.cuentas_fondos (tenant_id, nombre, tipo, fk_caja)
    values (p_tenant, v_nombre, 'caja_turno', r.id_caja);
  end loop;
end;
$$;

comment on function public.fn_asegurar_fondos_cajas(bigint) is
  'Creates the missing caja_turno fund of every caja of a hotel that already has a chart. Idempotent. Internal (no EXECUTE for the client).';

create or replace function public.tg_fn_caja_fondo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.fn_asegurar_fondos_cajas(new.tenant_id);
  return null;
end;
$$;

drop trigger if exists caja_fondo on public.caja;
create trigger caja_fondo
  after insert on public.caja
  for each row execute function public.tg_fn_caja_fondo();

-- ─── Provisioning: the chart arrives after the caja ──────────────────────────
-- Same function as 0017 plus the last step: once the chart is copied, the
-- hotel's cajas get their funds (they were created before the chart existed, so
-- the caja trigger found nothing to hang them on).
create or replace function public.fn_copiar_plan_cuentas_plantilla(p_tenant bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plantilla bigint;
  v_mapa      jsonb := '{}'::jsonb;
  v_nuevo     bigint;
  r           record;
begin
  select t.id into v_plantilla
  from public.tenants t
  where t.slug = 'plantilla-base'
    and t.estado = 'suspendido'
    and t.plan = 'plantilla';

  if v_plantilla is null or v_plantilla = p_tenant then
    return;
  end if;

  if exists (select 1 from public.cuentas_contables c where c.tenant_id = p_tenant) then
    return;
  end if;

  for r in
    with recursive arbol as (
      select c.*, 0 as nivel
      from public.cuentas_contables c
      where c.tenant_id = v_plantilla and c.fk_cuenta_padre is null
      union all
      select c.*, a.nivel + 1
      from public.cuentas_contables c
      join arbol a on c.fk_cuenta_padre = a.id
      where c.tenant_id = v_plantilla
    )
    select * from arbol order by nivel, id
  loop
    insert into public.cuentas_contables
      (tenant_id, nombre, codigo, fk_tipo_cuenta, imputable, fk_cuenta_padre, clave, activo)
    values
      (p_tenant, r.nombre, r.codigo, r.fk_tipo_cuenta, r.imputable,
       (v_mapa ->> r.fk_cuenta_padre::text)::bigint, r.clave, r.activo)
    returning id into v_nuevo;

    v_mapa := v_mapa || jsonb_build_object(r.id::text, v_nuevo);
  end loop;

  insert into public.categorias_finanzas
    (tenant_id, nombre, tipo, fk_cuenta_contable, es_sistema, activo)
  select p_tenant, k.nombre, k.tipo,
         (v_mapa ->> k.fk_cuenta_contable::text)::bigint, k.es_sistema, k.activo
  from public.categorias_finanzas k
  where k.tenant_id = v_plantilla
    and v_mapa ? k.fk_cuenta_contable::text;

  perform public.fn_asegurar_fondos_cajas(p_tenant);
end;
$$;

comment on function public.fn_copiar_plan_cuentas_plantilla(bigint) is
  'Copies chart of accounts and finance categories from plantilla-base to a hotel that has no accounts yet, then gives its cajas their funds. Internal (no EXECUTE for the client).';

-- ─── facturas: credit columns ────────────────────────────────────────────────
alter table public.facturas
  add column if not exists fecha_vencimiento date,
  add column if not exists saldo_pendiente   numeric not null default 0,
  alter column fk_modo_pago drop not null;

comment on column public.facturas.fecha_vencimiento is
  'Due date of a credit invoice (condicion_venta = 2). Optional.';
comment on column public.facturas.saldo_pendiente is
  'Unpaid balance of a credit invoice. Set by trigger: total_general at issue, 0 when annulled; later reduced by cobros. Always 0 for cash invoices.';

-- condicion_venta: 1 = contado, 2 = credito (src/services/facturaService.ts only
-- writes 1 today). Created NOT VALID and validated afterwards, as in 0016: an
-- old out-of-range row raises a WARNING instead of aborting the migration, and
-- every new row is checked from now on.
alter table public.facturas
  drop constraint if exists facturas_condicion_venta_check,
  drop constraint if exists facturas_saldo_pendiente_check,
  drop constraint if exists facturas_modo_pago_contado_check;
alter table public.facturas
  add constraint facturas_condicion_venta_check
    check (condicion_venta in (1, 2)) not valid,
  add constraint facturas_saldo_pendiente_check
    check (saldo_pendiente >= 0) not valid,
  add constraint facturas_modo_pago_contado_check
    check (condicion_venta = 2 or fk_modo_pago is not null) not valid;

do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('facturas_condicion_venta_check'),
      ('facturas_saldo_pendiente_check'),
      ('facturas_modo_pago_contado_check')
    ) as v(restriccion)
  loop
    begin
      execute format('alter table public.facturas validate constraint %I', r.restriccion);
    exception
      when check_violation then
        raise warning 'Constraint % has older rows that violate it; it only applies to new rows. Fix them and run VALIDATE CONSTRAINT.', r.restriccion;
    end;
  end loop;
end;
$$;

-- Receivables list (T4/T6): only credit invoices with something left to collect.
create index if not exists facturas_credito_pendiente_idx
  on public.facturas (tenant_id, fk_cliente)
  where condicion_venta = 2 and saldo_pendiente > 0;

-- ─── Fund that receives an invoice ───────────────────────────────────────────
-- 1. the fund mapped to the payment method, when active;
-- 2. otherwise the fund of the caja of the invoice's shift (this covers Efectivo
--    and every unmapped method, so invoicing never blocks for lack of setup).
-- If even the shift's caja has no fund the invoice cannot be posted: clear error.
create or replace function public.fn_cuenta_fondo_factura(p_tenant bigint, p_turno bigint, p_modo bigint)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cuenta bigint;
begin
  if p_modo is not null then
    select f.fk_cuenta_contable into v_cuenta
    from public.medios_pago_fondo m
    join public.cuentas_fondos f on f.tenant_id = m.tenant_id and f.id = m.fk_fondo
    where m.tenant_id = p_tenant and m.fk_modo_pago = p_modo and f.activo;
    if v_cuenta is not null then
      return v_cuenta;
    end if;
  end if;

  select f.fk_cuenta_contable into v_cuenta
  from public.apertura_cierre_caja a
  join public.cuentas_fondos f on f.tenant_id = a.tenant_id and f.fk_caja = a.fk_caja
  where a.tenant_id = p_tenant and a.id_turno = p_turno;

  if v_cuenta is null then
    raise exception 'No hay un fondo para la caja del turno %: cree el fondo de esa caja en Finanzas antes de facturar.', p_turno
      using errcode = 'P0002';
  end if;

  return v_cuenta;
end;
$$;

comment on function public.fn_cuenta_fondo_factura(bigint, bigint, bigint) is
  'Ledger account of the fund that receives an invoice: mapped payment method, else the fund of the shift''s caja. Internal (no EXECUTE for the client).';

-- ─── facturas: rules before the write ────────────────────────────────────────
-- INSERT: a credit invoice needs the accounting module of the plan; saldo_pendiente
-- is set here whatever the client sent. UPDATE OF estado: annulling zeroes the
-- balance. Definer: the plan lookup is not executable by the client.
create or replace function public.tg_fn_factura_antes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.condicion_venta = 2 then
      if not public.fn_modulo_habilitado(new.tenant_id, 'contabilidad') then
        raise exception 'La venta a crédito requiere el módulo de contabilidad, que no está incluido en el plan de este hotel.'
          using errcode = '42501';
      end if;
      new.saldo_pendiente := case when new.estado = 'EMITIDA' then new.total_general else 0 end;
    else
      new.saldo_pendiente := 0;
    end if;
  elsif new.estado = 'ANULADA' and old.estado is distinct from 'ANULADA' then
    -- T4 (0019) adds here: refuse the annulment while the invoice has active cobros.
    new.saldo_pendiente := 0;
  end if;

  return new;
end;
$$;

drop trigger if exists facturas_antes on public.facturas;
create trigger facturas_antes
  before insert or update of estado on public.facturas
  for each row execute function public.tg_fn_factura_antes();

-- ─── facturas: posting ───────────────────────────────────────────────────────
-- Same transaction as the invoice: if the entry cannot be posted, the invoice is
-- not saved. Runs for every plan.
--
-- Amounts. The header has no VAT split by rate, but prices include VAT and the
-- app computes (src/utils/facturaTotals.ts): total_general = gravado_10 +
-- gravado_5 + exenta, total_iva = sum of per-line rounded VAT. So the split is
-- derived: iva5 = round(gravado_5 / 21) (never above total_iva) and
-- iva10 = total_iva - iva5. Credits: VENTAS_10 = gravado_10 - iva10,
-- VENTAS_5 = gravado_5 - iva5, VENTAS_EXENTAS = exenta, IVA_DEBITO = total_iva;
-- zero lines are skipped. PYG has no decimals, so the sums are exact.
--
-- Discount. The app always stores descuento_global = 0 and total_general has no
-- discount in it. If a row ever carries a discount (or any other gap), the debit
-- stays total_general (what was actually charged) and the difference is routed
-- to the largest sales line, as a lower sale: no account outside the chart is
-- invented. A line that would turn negative means inconsistent totals and
-- raises a clear error.
--
-- A hotel without any account has no ledger yet: nothing is posted and the
-- invoice is saved normally. An invoice with no entry (historical, or born
-- ANULADA) is annulled without a reversal.
create or replace function public.tg_fn_factura_contabilizar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_iva5    numeric;
  v_iva10   numeric;
  v_v10     numeric;
  v_v5      numeric;
  v_ve      numeric;
  v_diff    numeric;
  v_lineas  jsonb := '[]'::jsonb;
  v_debito  jsonb;
  v_hoy     date := (now() at time zone 'America/Asuncion')::date;
begin
  if tg_op = 'UPDATE' then
    if new.estado = 'ANULADA' and old.estado is distinct from 'ANULADA'
       and exists (
         select 1 from public.asientos a
         where a.tenant_id = new.tenant_id and a.origen_tipo = 'factura'
           and a.fk_origen = new.id_factura and a.estado = 'CONTABILIZADO'
       ) then
      perform public.fn_contabilizar_reverso(new.tenant_id, 'factura', new.id_factura, v_hoy);
    end if;
    return null;
  end if;

  if new.estado <> 'EMITIDA' or new.total_general <= 0 then
    return null;
  end if;
  if not exists (select 1 from public.cuentas_contables c where c.tenant_id = new.tenant_id) then
    return null;
  end if;

  v_iva5  := least(round(new.total_gravado_5 / 21), new.total_iva);
  v_iva10 := new.total_iva - v_iva5;
  v_v10   := new.total_gravado_10 - v_iva10;
  v_v5    := new.total_gravado_5 - v_iva5;
  v_ve    := new.total_exenta;

  v_diff := new.total_general - (v_v10 + v_v5 + v_ve + new.total_iva);
  if v_diff <> 0 then
    if v_v10 >= v_v5 and v_v10 >= v_ve then
      v_v10 := v_v10 + v_diff;
    elsif v_v5 >= v_ve then
      v_v5 := v_v5 + v_diff;
    else
      v_ve := v_ve + v_diff;
    end if;
  end if;

  if v_v10 < 0 or v_v5 < 0 or v_ve < 0 then
    raise exception 'Los totales de la factura no son consistentes: el IVA o el descuento superan el monto de las ventas.'
      using errcode = '23514';
  end if;

  if new.condicion_venta = 2 then
    v_debito := jsonb_build_object('clave', 'CXC_CLIENTES', 'debe', new.total_general);
  else
    v_debito := jsonb_build_object(
      'fk_cuenta', public.fn_cuenta_fondo_factura(new.tenant_id, new.fk_turno, new.fk_modo_pago),
      'debe', new.total_general);
  end if;

  v_lineas := jsonb_build_array(v_debito);
  if v_v10 > 0 then
    v_lineas := v_lineas || jsonb_build_array(jsonb_build_object('clave', 'VENTAS_10', 'haber', v_v10));
  end if;
  if v_v5 > 0 then
    v_lineas := v_lineas || jsonb_build_array(jsonb_build_object('clave', 'VENTAS_5', 'haber', v_v5));
  end if;
  if v_ve > 0 then
    v_lineas := v_lineas || jsonb_build_array(jsonb_build_object('clave', 'VENTAS_EXENTAS', 'haber', v_ve));
  end if;
  if new.total_iva > 0 then
    v_lineas := v_lineas || jsonb_build_array(jsonb_build_object('clave', 'IVA_DEBITO', 'haber', new.total_iva));
  end if;

  perform public.fn_contabilizar(
    new.tenant_id,
    (new.fecha_emision at time zone 'America/Asuncion')::date,
    new.fk_establecimientos,
    'Factura ' || new.nro_secuencial || case when new.condicion_venta = 2 then ' (crédito)' else ' (contado)' end,
    'factura',
    new.id_factura,
    v_lineas);

  return null;
end;
$$;

drop trigger if exists facturas_contabilizar on public.facturas;
create trigger facturas_contabilizar
  after insert or update of estado on public.facturas
  for each row execute function public.tg_fn_factura_contabilizar();

comment on function public.tg_fn_factura_contabilizar() is
  'Posts the journal entry of an invoice (and its reversal when annulled) in the same transaction. Internal (no EXECUTE for the client).';

-- ─── Privileges ──────────────────────────────────────────────────────────────
-- 0012 already revokes EXECUTE from what is created above; repeated so it does
-- not depend on that event trigger. Nothing here is callable by the client:
-- triggers and the internal helpers run as the table owner.
revoke execute on function public.fn_crear_cuenta_fondo(bigint, text)                   from public, anon, authenticated;
revoke execute on function public.tg_fn_fondo_cuenta()                                  from public, anon, authenticated;
revoke execute on function public.fn_asegurar_fondos_cajas(bigint)                      from public, anon, authenticated;
revoke execute on function public.tg_fn_caja_fondo()                                    from public, anon, authenticated;
revoke execute on function public.fn_copiar_plan_cuentas_plantilla(bigint)              from public, anon, authenticated;
revoke execute on function public.fn_cuenta_fondo_factura(bigint, bigint, bigint)       from public, anon, authenticated;
revoke execute on function public.tg_fn_factura_antes()                                 from public, anon, authenticated;
revoke execute on function public.tg_fn_factura_contabilizar()                          from public, anon, authenticated;

-- ─── Backfill ────────────────────────────────────────────────────────────────
-- Every existing hotel with a chart gets a fund for each caja that has none.
-- Hotels without a chart (or the template) are skipped by the helper; a second
-- run creates nothing.
do $$
declare
  r record;
begin
  for r in select t.id from public.tenants t order by t.id loop
    perform public.fn_asegurar_fondos_cajas(r.id);
  end loop;
end;
$$;
