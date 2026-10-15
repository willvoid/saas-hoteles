-- ═══════════════════════════════════════════════════════════════════════════
-- 0019 · Expenses, collections, payments, transfers and opening balances
-- ═══════════════════════════════════════════════════════════════════════════
-- Money movements of the finance module. Every table posts its own journal
-- entry (0016 fn_contabilizar) in the same transaction; the UI never sees
-- debit/credit. Tables (all tenant tables, rule `admin_gerente_total` plus the
-- RESTRICTIVE valid-subscription / `contabilidad` module policies of 0014):
--
--   proveedores              supplier catalog (RUC unique per hotel)
--   gastos                   expenses, cash (contado) or credit (credito)
--   cobros                   collections against credit invoices (facturas)
--   pagos                    payments against credit expenses
--   transferencias_fondos    moves between two funds
--   saldos_iniciales_fondos  opening balance of a fund (one active per fund)
--
-- Posting rules (D = debit, C = credit; entry date = document `fecha`, the
-- reversal of an annulment is dated the annulment day, both America/Asuncion):
--
--   gasto contado   D category account (total - IVA), D IVA_CREDITO (IVA),
--                   C account of the paying fund                (origen 'gasto')
--   gasto credito   same debits, C CXP_PROVEEDORES              (origen 'gasto')
--   pago            D CXP_PROVEEDORES, C account of the fund    (origen 'pago')
--   cobro           D account of the fund, C CXC_CLIENTES       (origen 'cobro')
--   transferencia   D destination fund account, C origin fund account
--                                                         (origen 'transferencia')
--   saldo inicial   D fund account, C SALDOS_INICIALES    (origen 'saldo_inicial')
--   annulment       reversal entry <origen>_anulacion; original and reversal
--                   both end ANULADO (0016); saldo_pendiente is restored (cobro,
--                   pago) or zeroed (gasto)
--
-- Amounts INCLUDE VAT (Paraguay convention). A gasto has gravado_10 / gravado_5 /
-- exenta; BEFORE INSERT computes iva_10 = round(gravado_10 / 11), iva_5 =
-- round(gravado_5 / 21), total and saldo_pendiente, so the client cannot spoof
-- them. Amounts, condition, category and fund of every document are immutable
-- after insert; only descriptive fields and the REGISTRADO -> ANULADO change
-- are allowed. Documents are never deleted (annul instead).
--
-- Also here:
--   * asientos_origen_tipo_check / fn_contabilizar_reverso learn
--     'saldo_inicial' (0016 had no reversal for it).
--   * facturas: annulment is refused while the invoice has active cobros, and a
--     guard stops clients from editing the amounts, condicion_venta,
--     fk_modo_pago, fk_turno or saldo_pendiente of an EMITIDA invoice.
--     saldo_pendiente only moves from inside the cobro triggers.
--
-- Idempotent: running the file again changes nothing.
-- New functions are born without EXECUTE (0012); nothing is granted on purpose.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Ledger origin 'saldo_inicial' can be reversed ───────────────────────────
-- Same check as 0016 plus 'saldo_inicial_anulacion' (created NOT VALID and
-- validated afterwards, so an old out-of-range row only raises a WARNING).
alter table public.asientos
  drop constraint if exists asientos_origen_tipo_check;
alter table public.asientos
  add constraint asientos_origen_tipo_check
    check (origen_tipo is null or origen_tipo in (
      'factura', 'factura_anulacion', 'cobro', 'cobro_anulacion',
      'gasto', 'gasto_anulacion', 'pago', 'pago_anulacion',
      'transferencia', 'transferencia_anulacion', 'saldo_inicial',
      'saldo_inicial_anulacion', 'manual'
    )) not valid;

do $$
begin
  alter table public.asientos validate constraint asientos_origen_tipo_check;
exception
  when check_violation then
    raise warning 'Constraint asientos_origen_tipo_check has older rows that violate it; it only applies to new rows. Fix them and run VALIDATE CONSTRAINT.';
end;
$$;

-- Same function as 0016 with 'saldo_inicial' added to the reversible origins.
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
     or p_origen_tipo not in ('factura', 'cobro', 'gasto', 'pago', 'transferencia', 'saldo_inicial') then
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

-- Reverses the entry of a document when it still has a live one (an opening
-- balance of 0 or a document without ledger has none: nothing to undo).
create or replace function public.fn_reversar_documento(p_tenant bigint, p_tipo text, p_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.asientos a
    where a.tenant_id = p_tenant and a.origen_tipo = p_tipo
      and a.fk_origen = p_id and a.estado = 'CONTABILIZADO'
  ) then
    perform public.fn_contabilizar_reverso(p_tenant, p_tipo, p_id, (now() at time zone 'America/Asuncion')::date);
  end if;
end;
$$;

comment on function public.fn_reversar_documento(bigint, text, bigint) is
  'Reverses the live entry of a document, if any, dated today (America/Asuncion). Internal (no EXECUTE for the client).';

-- ─── proveedores ─────────────────────────────────────────────────────────────
create table if not exists public.proveedores (
  id          bigint generated always as identity primary key,
  tenant_id   bigint not null default public.current_tenant_id() references public.tenants (id),
  created_at  timestamptz not null default now(),
  nombre      text not null check (length(trim(nombre)) > 0),
  ruc         text check (ruc is null or length(trim(ruc)) > 0),
  telefono    text,
  email       text,
  activo      boolean not null default true,
  constraint proveedores_tenant_id_key unique (tenant_id, id)
);

-- Case-insensitive RUC, unique inside a hotel when informed.
create unique index if not exists proveedores_tenant_ruc_key
  on public.proveedores (tenant_id, lower(ruc))
  where ruc is not null;

comment on table public.proveedores is
  'Supplier catalog of the hotel. RUC is optional but unique per hotel (case-insensitive) when informed.';

-- ─── gastos ──────────────────────────────────────────────────────────────────
-- fk_establecimientos is optional on insert: the first establishment of the
-- hotel is used when omitted. iva_10, iva_5, total, saldo_pendiente and estado
-- are always computed by the BEFORE INSERT trigger.
create table if not exists public.gastos (
  id                   bigint generated always as identity primary key,
  tenant_id            bigint not null default public.current_tenant_id() references public.tenants (id),
  created_at           timestamptz not null default now(),
  fecha                date not null default ((now() at time zone 'America/Asuncion')::date),
  fk_establecimientos  bigint not null,
  fk_proveedor         bigint,
  fk_categoria         bigint not null,
  nro_comprobante      text,
  gravado_10           numeric not null default 0 check (gravado_10 >= 0),
  gravado_5            numeric not null default 0 check (gravado_5 >= 0),
  exenta               numeric not null default 0 check (exenta >= 0),
  iva_10               numeric not null default 0,
  iva_5                numeric not null default 0,
  total                numeric not null default 0,
  condicion            text not null check (condicion in ('contado', 'credito')),
  fecha_vencimiento    date,
  fk_cuenta_fondo      bigint,
  saldo_pendiente      numeric not null default 0,
  estado               text not null default 'REGISTRADO' check (estado in ('REGISTRADO', 'ANULADO')),
  observacion          text,
  constraint gastos_tenant_id_key unique (tenant_id, id),
  constraint gastos_total_check check (total > 0),
  constraint gastos_saldo_check check (saldo_pendiente >= 0 and saldo_pendiente <= total),
  constraint gastos_credito_proveedor_check check (condicion <> 'credito' or fk_proveedor is not null),
  -- A cash expense names the fund that paid; a credit one has none until paid.
  constraint gastos_fondo_condicion_check check ((condicion = 'contado') = (fk_cuenta_fondo is not null)),
  constraint gastos_vencimiento_check check (fecha_vencimiento is null or fecha_vencimiento >= fecha),
  constraint gastos_establecimiento_fkey
    foreign key (tenant_id, fk_establecimientos) references public.establecimientos (tenant_id, id_establecimiento),
  constraint gastos_proveedor_fkey
    foreign key (tenant_id, fk_proveedor) references public.proveedores (tenant_id, id),
  constraint gastos_categoria_fkey
    foreign key (tenant_id, fk_categoria) references public.categorias_finanzas (tenant_id, id),
  constraint gastos_fondo_fkey
    foreign key (tenant_id, fk_cuenta_fondo) references public.cuentas_fondos (tenant_id, id)
);

create index if not exists gastos_fecha_idx on public.gastos (tenant_id, fecha desc);
create index if not exists gastos_pendiente_idx
  on public.gastos (tenant_id, fk_proveedor)
  where condicion = 'credito' and estado = 'REGISTRADO' and saldo_pendiente > 0;

comment on table public.gastos is
  'Expenses. Amounts include VAT. iva_10/iva_5/total/saldo_pendiente are computed by trigger. Posted: D category account + IVA_CREDITO, C fund (contado) or CXP_PROVEEDORES (credito).';

-- ─── cobros ──────────────────────────────────────────────────────────────────
create table if not exists public.cobros (
  id               bigint generated always as identity primary key,
  tenant_id        bigint not null default public.current_tenant_id() references public.tenants (id),
  created_at       timestamptz not null default now(),
  fecha            date not null default ((now() at time zone 'America/Asuncion')::date),
  fk_factura       bigint not null,
  fk_cuenta_fondo  bigint not null,
  monto            numeric not null check (monto > 0),
  observacion      text,
  estado           text not null default 'REGISTRADO' check (estado in ('REGISTRADO', 'ANULADO')),
  constraint cobros_tenant_id_key unique (tenant_id, id),
  constraint cobros_factura_fkey
    foreign key (tenant_id, fk_factura) references public.facturas (tenant_id, id_factura),
  constraint cobros_fondo_fkey
    foreign key (tenant_id, fk_cuenta_fondo) references public.cuentas_fondos (tenant_id, id)
);

create index if not exists cobros_factura_idx on public.cobros (tenant_id, fk_factura);

comment on table public.cobros is
  'Collections against credit invoices. Posted: D fund account, C CXC_CLIENTES. Lowers facturas.saldo_pendiente.';

-- ─── pagos ───────────────────────────────────────────────────────────────────
create table if not exists public.pagos (
  id               bigint generated always as identity primary key,
  tenant_id        bigint not null default public.current_tenant_id() references public.tenants (id),
  created_at       timestamptz not null default now(),
  fecha            date not null default ((now() at time zone 'America/Asuncion')::date),
  fk_gasto         bigint not null,
  fk_cuenta_fondo  bigint not null,
  monto            numeric not null check (monto > 0),
  observacion      text,
  estado           text not null default 'REGISTRADO' check (estado in ('REGISTRADO', 'ANULADO')),
  constraint pagos_tenant_id_key unique (tenant_id, id),
  constraint pagos_gasto_fkey
    foreign key (tenant_id, fk_gasto) references public.gastos (tenant_id, id),
  constraint pagos_fondo_fkey
    foreign key (tenant_id, fk_cuenta_fondo) references public.cuentas_fondos (tenant_id, id)
);

create index if not exists pagos_gasto_idx on public.pagos (tenant_id, fk_gasto);

comment on table public.pagos is
  'Payments against credit expenses. Posted: D CXP_PROVEEDORES, C fund account. Lowers gastos.saldo_pendiente.';

-- ─── transferencias_fondos ───────────────────────────────────────────────────
create table if not exists public.transferencias_fondos (
  id                   bigint generated always as identity primary key,
  tenant_id            bigint not null default public.current_tenant_id() references public.tenants (id),
  created_at           timestamptz not null default now(),
  fecha                date not null default ((now() at time zone 'America/Asuncion')::date),
  fk_establecimientos  bigint not null,
  fk_fondo_origen      bigint not null,
  fk_fondo_destino     bigint not null,
  monto                numeric not null check (monto > 0),
  observacion          text,
  estado               text not null default 'REGISTRADO' check (estado in ('REGISTRADO', 'ANULADO')),
  constraint transferencias_fondos_tenant_id_key unique (tenant_id, id),
  constraint transferencias_fondos_distintos_check check (fk_fondo_origen <> fk_fondo_destino),
  constraint transferencias_fondos_establecimiento_fkey
    foreign key (tenant_id, fk_establecimientos) references public.establecimientos (tenant_id, id_establecimiento),
  constraint transferencias_fondos_origen_fkey
    foreign key (tenant_id, fk_fondo_origen) references public.cuentas_fondos (tenant_id, id),
  constraint transferencias_fondos_destino_fkey
    foreign key (tenant_id, fk_fondo_destino) references public.cuentas_fondos (tenant_id, id)
);

create index if not exists transferencias_fondos_fecha_idx on public.transferencias_fondos (tenant_id, fecha desc);

comment on table public.transferencias_fondos is
  'Moves between two funds. Posted: D destination fund account, C origin fund account.';

-- ─── saldos_iniciales_fondos ─────────────────────────────────────────────────
create table if not exists public.saldos_iniciales_fondos (
  id                   bigint generated always as identity primary key,
  tenant_id            bigint not null default public.current_tenant_id() references public.tenants (id),
  created_at           timestamptz not null default now(),
  fecha                date not null default ((now() at time zone 'America/Asuncion')::date),
  fk_establecimientos  bigint not null,
  fk_cuenta_fondo      bigint not null,
  monto                numeric not null check (monto >= 0),
  observacion          text,
  estado               text not null default 'REGISTRADO' check (estado in ('REGISTRADO', 'ANULADO')),
  constraint saldos_iniciales_fondos_tenant_id_key unique (tenant_id, id),
  constraint saldos_iniciales_fondos_establecimiento_fkey
    foreign key (tenant_id, fk_establecimientos) references public.establecimientos (tenant_id, id_establecimiento),
  constraint saldos_iniciales_fondos_fondo_fkey
    foreign key (tenant_id, fk_cuenta_fondo) references public.cuentas_fondos (tenant_id, id)
);

-- One live opening balance per fund; an annulled one can be entered again.
create unique index if not exists saldos_iniciales_fondos_activo_key
  on public.saldos_iniciales_fondos (tenant_id, fk_cuenta_fondo)
  where estado = 'REGISTRADO';

comment on table public.saldos_iniciales_fondos is
  'Opening balance of a fund. Posted: D fund account, C SALDOS_INICIALES (nothing is posted for 0).';

-- ─── RLS (rule `admin_gerente_total` of 0006) ────────────────────────────────
-- Same policies as cuentas_fondos (0018): admin and gerente read and write, plus
-- the RESTRICTIVE ones of 0014 (valid subscription, module `contabilidad`).
-- Drop-then-create keeps the block re-runnable.
alter table public.proveedores             enable row level security;
alter table public.gastos                  enable row level security;
alter table public.cobros                  enable row level security;
alter table public.pagos                   enable row level security;
alter table public.transferencias_fondos   enable row level security;
alter table public.saldos_iniciales_fondos enable row level security;

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
  foreach t in array array['proveedores', 'gastos', 'cobros', 'pagos',
                           'transferencias_fondos', 'saldos_iniciales_fondos'] loop
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

-- ─── Shared trigger functions ────────────────────────────────────────────────
-- Documents are never deleted: the ledger keeps their entries, so the way out
-- is to annul them.
create or replace function public.tg_fn_finanzas_no_borrar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'No se puede eliminar este registro: anúlelo para conservar el historial contable.'
    using errcode = '55000';
end;
$$;

-- Immutability guard. TG_ARGV lists the columns that MAY change; any other
-- difference between OLD and NEW is refused. The only state change allowed is
-- REGISTRADO -> ANULADO, and an annulled row is frozen.
create or replace function public.tg_fn_documento_guarda()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.estado = 'ANULADO' then
    raise exception 'Un registro anulado no se puede modificar.' using errcode = '55000';
  end if;
  if new.estado is distinct from old.estado and new.estado <> 'ANULADO' then
    raise exception 'El único cambio de estado permitido es anular el registro.' using errcode = '55000';
  end if;
  if (to_jsonb(old) - tg_argv) is distinct from (to_jsonb(new) - tg_argv) then
    raise exception 'Los importes, fechas y cuentas de este registro no se pueden modificar: anúlelo y regístrelo de nuevo.'
      using errcode = '55000';
  end if;
  return new;
end;
$$;

-- ─── gastos: rules and posting ───────────────────────────────────────────────
create or replace function public.tg_fn_gasto_antes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tipo   text;
  v_activo boolean;
begin
  -- Computed here, whatever the client sent.
  new.estado     := 'REGISTRADO';
  new.iva_10     := round(new.gravado_10 / 11);
  new.iva_5      := round(new.gravado_5 / 21);
  new.total      := new.gravado_10 + new.gravado_5 + new.exenta;
  new.saldo_pendiente := case when new.condicion = 'credito' then new.total else 0 end;

  if new.fk_establecimientos is null then
    select min(e.id_establecimiento) into new.fk_establecimientos
    from public.establecimientos e where e.tenant_id = new.tenant_id;
  end if;

  -- A row that is not found is left to the composite FK (cross-hotel reference).
  select c.tipo, c.activo into v_tipo, v_activo
  from public.categorias_finanzas c
  where c.tenant_id = new.tenant_id and c.id = new.fk_categoria;
  if found then
    if v_tipo <> 'egreso' then
      raise exception 'La categoría elegida no es de egreso.' using errcode = '23514';
    end if;
    if not v_activo then
      raise exception 'La categoría elegida está inactiva.' using errcode = '23514';
    end if;
  end if;

  if new.fk_cuenta_fondo is not null then
    select f.activo into v_activo
    from public.cuentas_fondos f
    where f.tenant_id = new.tenant_id and f.id = new.fk_cuenta_fondo;
    if found and not v_activo then
      raise exception 'El fondo elegido está inactivo.' using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

-- BEFORE UPDATE (on top of tg_fn_documento_guarda): saldo_pendiente moves only
-- from the pago triggers (nested trigger level) or to 0 when annulling, and an
-- expense with active pagos cannot be annulled.
create or replace function public.tg_fn_gasto_estado()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.estado = 'ANULADO' and old.estado <> 'ANULADO' then
    if exists (
      select 1 from public.pagos p
      where p.tenant_id = new.tenant_id and p.fk_gasto = new.id and p.estado = 'REGISTRADO'
    ) then
      raise exception 'No se puede anular el gasto: tiene pagos registrados. Anule primero los pagos.'
        using errcode = '55000';
    end if;
    new.saldo_pendiente := 0;
  elsif new.saldo_pendiente is distinct from old.saldo_pendiente and pg_trigger_depth() <= 1 then
    raise exception 'El saldo pendiente del gasto solo cambia al registrar o anular pagos.'
      using errcode = '55000';
  end if;
  return new;
end;
$$;

create or replace function public.tg_fn_gasto_contabilizar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cuenta_cat bigint;
  v_cat        text;
  v_neto       numeric := new.total - new.iva_10 - new.iva_5;
  v_iva        numeric := new.iva_10 + new.iva_5;
  v_lineas     jsonb;
begin
  select c.fk_cuenta_contable, c.nombre into v_cuenta_cat, v_cat
  from public.categorias_finanzas c
  where c.tenant_id = new.tenant_id and c.id = new.fk_categoria;

  v_lineas := jsonb_build_array(jsonb_build_object('fk_cuenta', v_cuenta_cat, 'debe', v_neto));
  if v_iva > 0 then
    v_lineas := v_lineas || jsonb_build_array(jsonb_build_object('clave', 'IVA_CREDITO', 'debe', v_iva));
  end if;

  if new.condicion = 'credito' then
    v_lineas := v_lineas || jsonb_build_array(jsonb_build_object('clave', 'CXP_PROVEEDORES', 'haber', new.total));
  else
    v_lineas := v_lineas || jsonb_build_array(jsonb_build_object(
      'fk_cuenta',
      (select f.fk_cuenta_contable from public.cuentas_fondos f
        where f.tenant_id = new.tenant_id and f.id = new.fk_cuenta_fondo),
      'haber', new.total));
  end if;

  perform public.fn_contabilizar(
    new.tenant_id, new.fecha, new.fk_establecimientos,
    'Gasto ' || coalesce(nullif(trim(new.nro_comprobante), ''), '#' || new.id) || ' - ' || v_cat
      || case when new.condicion = 'credito' then ' (crédito)' else ' (contado)' end,
    'gasto', new.id, v_lineas);

  return null;
end;
$$;

create or replace function public.tg_fn_gasto_anulado()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.estado = 'ANULADO' and old.estado <> 'ANULADO' then
    perform public.fn_reversar_documento(new.tenant_id, 'gasto', new.id);
  end if;
  return null;
end;
$$;

drop trigger if exists gastos_antes on public.gastos;
create trigger gastos_antes
  before insert on public.gastos
  for each row execute function public.tg_fn_gasto_antes();

drop trigger if exists gastos_guarda on public.gastos;
create trigger gastos_guarda
  before update on public.gastos
  for each row
  execute function public.tg_fn_documento_guarda('estado', 'saldo_pendiente', 'nro_comprobante', 'observacion', 'fecha_vencimiento', 'fk_proveedor');

drop trigger if exists gastos_estado on public.gastos;
create trigger gastos_estado
  before update on public.gastos
  for each row execute function public.tg_fn_gasto_estado();

drop trigger if exists gastos_contabilizar on public.gastos;
create trigger gastos_contabilizar
  after insert on public.gastos
  for each row execute function public.tg_fn_gasto_contabilizar();

drop trigger if exists gastos_anulado on public.gastos;
create trigger gastos_anulado
  after update of estado on public.gastos
  for each row execute function public.tg_fn_gasto_anulado();

drop trigger if exists gastos_no_borrar on public.gastos;
create trigger gastos_no_borrar
  before delete on public.gastos
  for each row execute function public.tg_fn_finanzas_no_borrar();

-- ─── pagos: rules and posting ────────────────────────────────────────────────
-- The expense row is locked FOR UPDATE: two payments cannot both fit the same
-- balance. A reference that is not found is left to the composite FK.
create or replace function public.tg_fn_pago_antes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_g      record;
  v_activo boolean;
begin
  new.estado := 'REGISTRADO';

  select g.condicion, g.estado, g.saldo_pendiente into v_g
  from public.gastos g
  where g.tenant_id = new.tenant_id and g.id = new.fk_gasto
  for update;

  if found then
    if v_g.estado <> 'REGISTRADO' then
      raise exception 'No se puede pagar un gasto anulado.' using errcode = '55000';
    end if;
    if v_g.condicion <> 'credito' then
      raise exception 'Solo se pagan gastos a crédito: un gasto de contado ya se pagó al registrarlo.'
        using errcode = '55000';
    end if;
    if new.monto > v_g.saldo_pendiente then
      raise exception 'El monto del pago (%) supera el saldo pendiente del gasto (%).', new.monto, v_g.saldo_pendiente
        using errcode = '23514';
    end if;
  end if;

  select f.activo into v_activo
  from public.cuentas_fondos f
  where f.tenant_id = new.tenant_id and f.id = new.fk_cuenta_fondo;
  if found and not v_activo then
    raise exception 'El fondo elegido está inactivo.' using errcode = '23514';
  end if;

  return new;
end;
$$;

create or replace function public.tg_fn_pago_contabilizar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estab bigint;
  v_comp  text;
begin
  update public.gastos
  set saldo_pendiente = saldo_pendiente - new.monto
  where tenant_id = new.tenant_id and id = new.fk_gasto
  returning fk_establecimientos, coalesce(nullif(trim(nro_comprobante), ''), '#' || id) into v_estab, v_comp;

  perform public.fn_contabilizar(
    new.tenant_id, new.fecha, v_estab,
    'Pago de gasto ' || v_comp,
    'pago', new.id,
    jsonb_build_array(
      jsonb_build_object('clave', 'CXP_PROVEEDORES', 'debe', new.monto),
      jsonb_build_object(
        'fk_cuenta',
        (select f.fk_cuenta_contable from public.cuentas_fondos f
          where f.tenant_id = new.tenant_id and f.id = new.fk_cuenta_fondo),
        'haber', new.monto)));

  return null;
end;
$$;

-- Annulment: the balance is restored (unless the expense itself is annulled,
-- which needs every pago annulled first) and the entry reversed.
create or replace function public.tg_fn_pago_anulado()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estado text;
begin
  if new.estado = 'ANULADO' and old.estado <> 'ANULADO' then
    select g.estado into v_estado
    from public.gastos g
    where g.tenant_id = new.tenant_id and g.id = new.fk_gasto
    for update;

    if v_estado = 'REGISTRADO' then
      update public.gastos
      set saldo_pendiente = saldo_pendiente + new.monto
      where tenant_id = new.tenant_id and id = new.fk_gasto;
    end if;

    perform public.fn_reversar_documento(new.tenant_id, 'pago', new.id);
  end if;
  return null;
end;
$$;

drop trigger if exists pagos_antes on public.pagos;
create trigger pagos_antes
  before insert on public.pagos
  for each row execute function public.tg_fn_pago_antes();

drop trigger if exists pagos_guarda on public.pagos;
create trigger pagos_guarda
  before update on public.pagos
  for each row execute function public.tg_fn_documento_guarda('estado', 'observacion');

drop trigger if exists pagos_contabilizar on public.pagos;
create trigger pagos_contabilizar
  after insert on public.pagos
  for each row execute function public.tg_fn_pago_contabilizar();

drop trigger if exists pagos_anulado on public.pagos;
create trigger pagos_anulado
  after update of estado on public.pagos
  for each row execute function public.tg_fn_pago_anulado();

drop trigger if exists pagos_no_borrar on public.pagos;
create trigger pagos_no_borrar
  before delete on public.pagos
  for each row execute function public.tg_fn_finanzas_no_borrar();

-- ─── cobros: rules and posting ───────────────────────────────────────────────
-- Same shape as pagos against facturas. The invoice row is locked FOR UPDATE,
-- which also serialises against its annulment.
create or replace function public.tg_fn_cobro_antes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_f      record;
  v_activo boolean;
begin
  new.estado := 'REGISTRADO';

  select f.estado, f.condicion_venta, f.saldo_pendiente into v_f
  from public.facturas f
  where f.tenant_id = new.tenant_id and f.id_factura = new.fk_factura
  for update;

  if found then
    if v_f.estado <> 'EMITIDA' then
      raise exception 'No se puede cobrar una factura anulada.' using errcode = '55000';
    end if;
    if v_f.condicion_venta <> 2 then
      raise exception 'Solo se cobran facturas a crédito: una factura de contado ya se cobró al emitirla.'
        using errcode = '55000';
    end if;
    if new.monto > v_f.saldo_pendiente then
      raise exception 'El monto del cobro (%) supera el saldo pendiente de la factura (%).', new.monto, v_f.saldo_pendiente
        using errcode = '23514';
    end if;
  end if;

  select f.activo into v_activo
  from public.cuentas_fondos f
  where f.tenant_id = new.tenant_id and f.id = new.fk_cuenta_fondo;
  if found and not v_activo then
    raise exception 'El fondo elegido está inactivo.' using errcode = '23514';
  end if;

  return new;
end;
$$;

create or replace function public.tg_fn_cobro_contabilizar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estab bigint;
  v_nro   bigint;
begin
  update public.facturas
  set saldo_pendiente = saldo_pendiente - new.monto
  where tenant_id = new.tenant_id and id_factura = new.fk_factura
  returning fk_establecimientos, nro_secuencial into v_estab, v_nro;

  perform public.fn_contabilizar(
    new.tenant_id, new.fecha, v_estab,
    'Cobro de factura ' || v_nro,
    'cobro', new.id,
    jsonb_build_array(
      jsonb_build_object(
        'fk_cuenta',
        (select f.fk_cuenta_contable from public.cuentas_fondos f
          where f.tenant_id = new.tenant_id and f.id = new.fk_cuenta_fondo),
        'debe', new.monto),
      jsonb_build_object('clave', 'CXC_CLIENTES', 'haber', new.monto)));

  return null;
end;
$$;

-- Annulment: the balance is restored while the invoice is still EMITIDA (an
-- annulled invoice keeps saldo 0; it cannot have active cobros anyway) and the
-- entry reversed.
create or replace function public.tg_fn_cobro_anulado()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estado text;
begin
  if new.estado = 'ANULADO' and old.estado <> 'ANULADO' then
    select f.estado into v_estado
    from public.facturas f
    where f.tenant_id = new.tenant_id and f.id_factura = new.fk_factura
    for update;

    if v_estado = 'EMITIDA' then
      update public.facturas
      set saldo_pendiente = saldo_pendiente + new.monto
      where tenant_id = new.tenant_id and id_factura = new.fk_factura;
    end if;

    perform public.fn_reversar_documento(new.tenant_id, 'cobro', new.id);
  end if;
  return null;
end;
$$;

drop trigger if exists cobros_antes on public.cobros;
create trigger cobros_antes
  before insert on public.cobros
  for each row execute function public.tg_fn_cobro_antes();

drop trigger if exists cobros_guarda on public.cobros;
create trigger cobros_guarda
  before update on public.cobros
  for each row execute function public.tg_fn_documento_guarda('estado', 'observacion');

drop trigger if exists cobros_contabilizar on public.cobros;
create trigger cobros_contabilizar
  after insert on public.cobros
  for each row execute function public.tg_fn_cobro_contabilizar();

drop trigger if exists cobros_anulado on public.cobros;
create trigger cobros_anulado
  after update of estado on public.cobros
  for each row execute function public.tg_fn_cobro_anulado();

drop trigger if exists cobros_no_borrar on public.cobros;
create trigger cobros_no_borrar
  before delete on public.cobros
  for each row execute function public.tg_fn_finanzas_no_borrar();

-- ─── transferencias_fondos: rules and posting ────────────────────────────────
create or replace function public.tg_fn_transferencia_antes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_activo boolean;
  v_fondo  bigint;
begin
  new.estado := 'REGISTRADO';

  if new.fk_establecimientos is null then
    select min(e.id_establecimiento) into new.fk_establecimientos
    from public.establecimientos e where e.tenant_id = new.tenant_id;
  end if;

  -- A fund that is not found is left to the composite FK.
  foreach v_fondo in array array[new.fk_fondo_origen, new.fk_fondo_destino] loop
    select f.activo into v_activo
    from public.cuentas_fondos f
    where f.tenant_id = new.tenant_id and f.id = v_fondo;
    if found and not v_activo then
      raise exception 'El fondo elegido está inactivo.' using errcode = '23514';
    end if;
  end loop;

  return new;
end;
$$;

create or replace function public.tg_fn_transferencia_contabilizar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_origen  record;
  v_destino record;
begin
  select f.fk_cuenta_contable, f.nombre into v_origen
  from public.cuentas_fondos f where f.tenant_id = new.tenant_id and f.id = new.fk_fondo_origen;
  select f.fk_cuenta_contable, f.nombre into v_destino
  from public.cuentas_fondos f where f.tenant_id = new.tenant_id and f.id = new.fk_fondo_destino;

  perform public.fn_contabilizar(
    new.tenant_id, new.fecha, new.fk_establecimientos,
    'Transferencia ' || v_origen.nombre || ' -> ' || v_destino.nombre,
    'transferencia', new.id,
    jsonb_build_array(
      jsonb_build_object('fk_cuenta', v_destino.fk_cuenta_contable, 'debe', new.monto),
      jsonb_build_object('fk_cuenta', v_origen.fk_cuenta_contable,  'haber', new.monto)));

  return null;
end;
$$;

create or replace function public.tg_fn_transferencia_anulado()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.estado = 'ANULADO' and old.estado <> 'ANULADO' then
    perform public.fn_reversar_documento(new.tenant_id, 'transferencia', new.id);
  end if;
  return null;
end;
$$;

drop trigger if exists transferencias_fondos_antes on public.transferencias_fondos;
create trigger transferencias_fondos_antes
  before insert on public.transferencias_fondos
  for each row execute function public.tg_fn_transferencia_antes();

drop trigger if exists transferencias_fondos_guarda on public.transferencias_fondos;
create trigger transferencias_fondos_guarda
  before update on public.transferencias_fondos
  for each row execute function public.tg_fn_documento_guarda('estado', 'observacion');

drop trigger if exists transferencias_fondos_contabilizar on public.transferencias_fondos;
create trigger transferencias_fondos_contabilizar
  after insert on public.transferencias_fondos
  for each row execute function public.tg_fn_transferencia_contabilizar();

drop trigger if exists transferencias_fondos_anulado on public.transferencias_fondos;
create trigger transferencias_fondos_anulado
  after update of estado on public.transferencias_fondos
  for each row execute function public.tg_fn_transferencia_anulado();

drop trigger if exists transferencias_fondos_no_borrar on public.transferencias_fondos;
create trigger transferencias_fondos_no_borrar
  before delete on public.transferencias_fondos
  for each row execute function public.tg_fn_finanzas_no_borrar();

-- ─── saldos_iniciales_fondos: rules and posting ──────────────────────────────
create or replace function public.tg_fn_saldo_inicial_antes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_activo boolean;
begin
  new.estado := 'REGISTRADO';

  if new.fk_establecimientos is null then
    select min(e.id_establecimiento) into new.fk_establecimientos
    from public.establecimientos e where e.tenant_id = new.tenant_id;
  end if;

  select f.activo into v_activo
  from public.cuentas_fondos f
  where f.tenant_id = new.tenant_id and f.id = new.fk_cuenta_fondo;
  if found and not v_activo then
    raise exception 'El fondo elegido está inactivo.' using errcode = '23514';
  end if;

  return new;
end;
$$;

create or replace function public.tg_fn_saldo_inicial_contabilizar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cuenta bigint;
  v_nombre text;
begin
  if new.monto = 0 then
    return null;
  end if;

  select f.fk_cuenta_contable, f.nombre into v_cuenta, v_nombre
  from public.cuentas_fondos f where f.tenant_id = new.tenant_id and f.id = new.fk_cuenta_fondo;

  perform public.fn_contabilizar(
    new.tenant_id, new.fecha, new.fk_establecimientos,
    'Saldo inicial ' || v_nombre,
    'saldo_inicial', new.id,
    jsonb_build_array(
      jsonb_build_object('fk_cuenta', v_cuenta, 'debe', new.monto),
      jsonb_build_object('clave', 'SALDOS_INICIALES', 'haber', new.monto)));

  return null;
end;
$$;

create or replace function public.tg_fn_saldo_inicial_anulado()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.estado = 'ANULADO' and old.estado <> 'ANULADO' then
    perform public.fn_reversar_documento(new.tenant_id, 'saldo_inicial', new.id);
  end if;
  return null;
end;
$$;

drop trigger if exists saldos_iniciales_fondos_antes on public.saldos_iniciales_fondos;
create trigger saldos_iniciales_fondos_antes
  before insert on public.saldos_iniciales_fondos
  for each row execute function public.tg_fn_saldo_inicial_antes();

drop trigger if exists saldos_iniciales_fondos_guarda on public.saldos_iniciales_fondos;
create trigger saldos_iniciales_fondos_guarda
  before update on public.saldos_iniciales_fondos
  for each row execute function public.tg_fn_documento_guarda('estado', 'observacion');

drop trigger if exists saldos_iniciales_fondos_contabilizar on public.saldos_iniciales_fondos;
create trigger saldos_iniciales_fondos_contabilizar
  after insert on public.saldos_iniciales_fondos
  for each row execute function public.tg_fn_saldo_inicial_contabilizar();

drop trigger if exists saldos_iniciales_fondos_anulado on public.saldos_iniciales_fondos;
create trigger saldos_iniciales_fondos_anulado
  after update of estado on public.saldos_iniciales_fondos
  for each row execute function public.tg_fn_saldo_inicial_anulado();

drop trigger if exists saldos_iniciales_fondos_no_borrar on public.saldos_iniciales_fondos;
create trigger saldos_iniciales_fondos_no_borrar
  before delete on public.saldos_iniciales_fondos
  for each row execute function public.tg_fn_finanzas_no_borrar();

-- ─── facturas hardening ──────────────────────────────────────────────────────
-- (a) Same function as 0018 plus: annulment is refused while the invoice has
-- active cobros. The cobro insert locks the invoice row, the annulment UPDATE
-- holds it too, so the two cannot interleave.
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
    if exists (
      select 1 from public.cobros c
      where c.tenant_id = new.tenant_id and c.fk_factura = new.id_factura and c.estado = 'REGISTRADO'
    ) then
      raise exception 'No se puede anular la factura: tiene cobros registrados. Anule primero los cobros.'
        using errcode = '55000';
    end if;
    new.saldo_pendiente := 0;
  end if;

  return new;
end;
$$;

-- (b) An EMITIDA invoice keeps the amounts the ledger was posted with: totals,
-- discount, date, branch, condicion_venta, fk_modo_pago and fk_turno cannot be
-- edited, and saldo_pendiente only changes (1) to 0 when the invoice is
-- annulled or (2) from inside the cobro triggers, recognised by their nested
-- trigger level (pg_trigger_depth() > 1), which a direct client UPDATE can
-- never have. Free fields (fecha_vencimiento, observacion, fk_motivo, estado
-- itself) stay editable, so anularFactura (estado + fk_motivo) keeps working.
create or replace function public.tg_fn_factura_guarda()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.estado = 'EMITIDA' then
    if (old.total_gravado_10, old.total_gravado_5, old.total_exenta, old.total_iva, old.total_general,
        old.descuento_global, old.fecha_emision, old.fk_establecimientos,
        old.condicion_venta, old.fk_modo_pago, old.fk_turno)
       is distinct from
       (new.total_gravado_10, new.total_gravado_5, new.total_exenta, new.total_iva, new.total_general,
        new.descuento_global, new.fecha_emision, new.fk_establecimientos,
        new.condicion_venta, new.fk_modo_pago, new.fk_turno) then
      raise exception 'Los importes, la condición de venta, el modo de pago y el turno de una factura emitida no se pueden modificar: anúlela y emita una nueva.'
        using errcode = '55000';
    end if;

    if new.saldo_pendiente is distinct from old.saldo_pendiente
       and not (new.estado = 'ANULADA' and new.saldo_pendiente = 0)
       and pg_trigger_depth() <= 1 then
      raise exception 'El saldo pendiente de la factura solo cambia al registrar o anular cobros.'
        using errcode = '55000';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists facturas_guarda on public.facturas;
create trigger facturas_guarda
  before update on public.facturas
  for each row execute function public.tg_fn_factura_guarda();

-- ─── Privileges ──────────────────────────────────────────────────────────────
-- 0012 already revokes EXECUTE from what is created above; repeated so it does
-- not depend on that event trigger. Nothing here is callable by the client.
revoke execute on function public.fn_contabilizar_reverso(bigint, text, bigint, date)  from public, anon, authenticated;
revoke execute on function public.fn_reversar_documento(bigint, text, bigint)          from public, anon, authenticated;
revoke execute on function public.tg_fn_finanzas_no_borrar()                           from public, anon, authenticated;
revoke execute on function public.tg_fn_documento_guarda()                             from public, anon, authenticated;
revoke execute on function public.tg_fn_gasto_antes()                                  from public, anon, authenticated;
revoke execute on function public.tg_fn_gasto_estado()                                 from public, anon, authenticated;
revoke execute on function public.tg_fn_gasto_contabilizar()                           from public, anon, authenticated;
revoke execute on function public.tg_fn_gasto_anulado()                                from public, anon, authenticated;
revoke execute on function public.tg_fn_pago_antes()                                   from public, anon, authenticated;
revoke execute on function public.tg_fn_pago_contabilizar()                            from public, anon, authenticated;
revoke execute on function public.tg_fn_pago_anulado()                                 from public, anon, authenticated;
revoke execute on function public.tg_fn_cobro_antes()                                  from public, anon, authenticated;
revoke execute on function public.tg_fn_cobro_contabilizar()                           from public, anon, authenticated;
revoke execute on function public.tg_fn_cobro_anulado()                                from public, anon, authenticated;
revoke execute on function public.tg_fn_transferencia_antes()                          from public, anon, authenticated;
revoke execute on function public.tg_fn_transferencia_contabilizar()                   from public, anon, authenticated;
revoke execute on function public.tg_fn_transferencia_anulado()                        from public, anon, authenticated;
revoke execute on function public.tg_fn_saldo_inicial_antes()                          from public, anon, authenticated;
revoke execute on function public.tg_fn_saldo_inicial_contabilizar()                   from public, anon, authenticated;
revoke execute on function public.tg_fn_saldo_inicial_anulado()                        from public, anon, authenticated;
revoke execute on function public.tg_fn_factura_antes()                                from public, anon, authenticated;
revoke execute on function public.tg_fn_factura_guarda()                               from public, anon, authenticated;
