-- ═══════════════════════════════════════════════════════════════════════════
-- 0017 · Hotel chart of accounts and finance categories
-- ═══════════════════════════════════════════════════════════════════════════
-- Seeds the standard Paraguayan hotel chart of accounts that every hotel
-- starts from:
--
--   * tipo_cuenta_contable: global catalog (Activo, Pasivo, Patrimonio, Ingreso,
--     Egreso), inserted only when a row with that name is missing.
--   * Chart of accounts of the template tenant `plantilla-base` (0008), as a tree
--     through fk_cuenta_padre. Only leaves are `imputable`; the accounts the
--     posting functions look up carry a system `clave` (see fn_cuenta_por_clave).
--     `1.1.01 Disponibilidades` is a non-imputable parent: the funds created by
--     0018 hang as child accounts under it.
--   * categorias_finanzas: simple income/expense categories, each one pointing
--     at a leaf account. The UI shows categories; the account is the hidden
--     debit/credit side. The seeded categories (one per 4.x/5.x leaf) are
--     flagged es_sistema.
--   * fn_copiar_plan_cuentas_plantilla: copies chart + categories from the
--     template to a hotel (remapping account ids and parents). It does nothing
--     when the hotel already has accounts, so it is safe to call twice.
--   * fn_seed_tenant_desde_plantilla (0008) now delegates the chart to it, so
--     every new hotel (any plan, including `basico`) is born with the chart.
--   * Backfill: every existing hotel without accounts receives the chart.
--
-- Idempotent: running the file again changes nothing.
-- New functions are born without EXECUTE (0012); only what needs it is granted.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Account types (global catalog) ──────────────────────────────────────────
insert into public.tipo_cuenta_contable (nombre, descripcion)
select v.nombre, v.descripcion
from (values
  ('Activo',     'Bienes y derechos del hotel'),
  ('Pasivo',     'Deudas y obligaciones del hotel'),
  ('Patrimonio', 'Capital y resultados de los propietarios'),
  ('Ingreso',    'Ventas y otros ingresos'),
  ('Egreso',     'Gastos y costos')
) as v(nombre, descripcion)
where not exists (
  select 1 from public.tipo_cuenta_contable x where x.nombre = v.nombre
);

-- ─── Chart of accounts of the template tenant ────────────────────────────────
-- Seeded only when the template has no accounts yet (the operator may have
-- loaded a chart by hand). Parents are derived from the code ('5.1.03' -> '5.1').
do $$
declare
  v_plantilla bigint;
  r           record;
begin
  select t.id into v_plantilla
  from public.tenants t
  where t.slug = 'plantilla-base'
    and t.estado = 'suspendido'
    and t.plan = 'plantilla';

  if v_plantilla is null then
    raise notice 'Tenant plantilla-base not found: chart of accounts not seeded.';
  elsif not exists (select 1 from public.cuentas_contables c where c.tenant_id = v_plantilla) then
    for r in
      select v.*
      from (values
        ('1',      'Activo',                                   false, null),
        ('1.1',    'Activo corriente',                         false, null),
        ('1.1.01', 'Disponibilidades',                         false, 'DISPONIBILIDADES'),
        ('1.1.02', 'Deudores por ventas',                      true,  'CXC_CLIENTES'),
        ('1.1.03', 'IVA crédito fiscal',                       true,  'IVA_CREDITO'),
        ('2',      'Pasivo',                                   false, null),
        ('2.1',    'Pasivo corriente',                         false, null),
        ('2.1.01', 'Proveedores',                              true,  'CXP_PROVEEDORES'),
        ('2.1.02', 'IVA débito fiscal',                        true,  'IVA_DEBITO'),
        ('3',      'Patrimonio',                               false, null),
        ('3.1',    'Capital',                                  true,  null),
        ('3.2',    'Resultados acumulados',                    true,  null),
        ('3.3',    'Saldos iniciales',                         true,  'SALDOS_INICIALES'),
        ('4',      'Ingresos',                                 false, null),
        ('4.1',    'Ingresos por servicios',                   false, null),
        ('4.1.01', 'Ventas gravadas 10%',                      true,  'VENTAS_10'),
        ('4.1.02', 'Ventas gravadas 5%',                       true,  'VENTAS_5'),
        ('4.1.03', 'Ventas exentas',                           true,  'VENTAS_EXENTAS'),
        ('4.2',    'Ingresos varios',                          false, null),
        ('4.2.01', 'Otros ingresos',                           true,  'OTROS_INGRESOS'),
        ('5',      'Egresos',                                  false, null),
        ('5.1',    'Gastos de operación',                      false, null),
        ('5.1.01', 'Sueldos y cargas sociales (IPS)',          true,  null),
        ('5.1.02', 'Servicios básicos (ANDE, ESSAP, internet)', true, null),
        ('5.1.03', 'Lavandería',                               true,  null),
        ('5.1.04', 'Limpieza y amenities',                     true,  null),
        ('5.1.05', 'Alimentos y bebidas',                      true,  null),
        ('5.1.06', 'Mantenimiento y reparaciones',             true,  null),
        ('5.1.07', 'Alquiler',                                 true,  null),
        ('5.1.08', 'Comisiones OTA y tarjetas',                true,  null),
        ('5.1.09', 'Publicidad y marketing',                   true,  null),
        ('5.1.10', 'Honorarios profesionales',                 true,  null),
        ('5.1.11', 'Impuestos y tasas',                        true,  null),
        ('5.1.12', 'Gastos bancarios',                         true,  null),
        ('5.1.13', 'Otros egresos',                            true,  'OTROS_EGRESOS')
      ) as v(codigo, nombre, imputable, clave)
      -- Parents first: fewer dots means a shallower level.
      order by length(v.codigo) - length(replace(v.codigo, '.', '')), v.codigo
    loop
      insert into public.cuentas_contables
        (tenant_id, nombre, codigo, fk_tipo_cuenta, imputable, fk_cuenta_padre, clave, activo)
      values (
        v_plantilla,
        r.nombre,
        r.codigo,
        (select tc.id from public.tipo_cuenta_contable tc
         where tc.nombre = case left(r.codigo, 1)
                             when '1' then 'Activo'
                             when '2' then 'Pasivo'
                             when '3' then 'Patrimonio'
                             when '4' then 'Ingreso'
                             else 'Egreso'
                           end
         order by tc.id
         limit 1),
        r.imputable,
        (select p.id from public.cuentas_contables p
         where p.tenant_id = v_plantilla
           and p.codigo = regexp_replace(r.codigo, '\.[^.]*$', '')
           and p.codigo <> r.codigo),
        r.clave,
        true)
      on conflict (tenant_id, codigo) do nothing;
    end loop;
  end if;
end;
$$;

-- ─── categorias_finanzas ─────────────────────────────────────────────────────
create table if not exists public.categorias_finanzas (
  id                  bigint generated always as identity primary key,
  tenant_id           bigint not null default public.current_tenant_id() references public.tenants (id),
  created_at          timestamptz not null default now(),
  nombre              text not null check (length(trim(nombre)) > 0),
  tipo                text not null check (tipo in ('ingreso', 'egreso')),
  fk_cuenta_contable  bigint not null,
  es_sistema          boolean not null default false,
  activo              boolean not null default true,
  constraint categorias_finanzas_tenant_id_key unique (tenant_id, id),
  constraint categorias_finanzas_tenant_nombre_key unique (tenant_id, nombre),
  constraint categorias_finanzas_cuenta_fkey
    foreign key (tenant_id, fk_cuenta_contable) references public.cuentas_contables (tenant_id, id)
);

create index if not exists categorias_finanzas_cuenta_idx
  on public.categorias_finanzas (tenant_id, fk_cuenta_contable);

comment on table public.categorias_finanzas is
  'Income/expense categories shown in the finance UI. Each one points at the leaf account that receives the entry. Seeded ones are es_sistema.';
comment on column public.categorias_finanzas.es_sistema is
  'Seeded from the template; the UI does not let them be deleted.';

-- Template categories: one per income/expense leaf account (4.x / 5.x). Run
-- after the table exists; a template category is never duplicated.
insert into public.categorias_finanzas (tenant_id, nombre, tipo, fk_cuenta_contable, es_sistema, activo)
select c.tenant_id, c.nombre,
       case left(c.codigo, 1) when '4' then 'ingreso' else 'egreso' end,
       c.id, true, true
from public.cuentas_contables c
join public.tenants t on t.id = c.tenant_id
where t.slug = 'plantilla-base'
  and t.estado = 'suspendido'
  and t.plan = 'plantilla'
  and c.imputable
  and left(c.codigo, 1) in ('4', '5')
  and not exists (
    select 1 from public.categorias_finanzas x
    where x.tenant_id = c.tenant_id and x.fk_cuenta_contable = c.id
  )
on conflict (tenant_id, nombre) do nothing;

-- ─── RLS (rule `admin_gerente_total` of 0006) ────────────────────────────────
-- Only admin and gerente read or write. Same policies the 0006 generator
-- produces, plus the RESTRICTIVE ones of 0014 (valid subscription, and the plan
-- must include the `contabilidad` module). Drop-then-create keeps it re-runnable.
alter table public.categorias_finanzas enable row level security;

do $$
declare
  t         constant text := 'categorias_finanzas';
  v_tenant  constant text := 'tenant_id = (select public.current_tenant_id())';
  v_activo  constant text := '(select public.current_usuario_activo())';
  v_admgrt  constant text := '(select public.current_es_admin_o_gerente())';
  v_vigente constant text := '(select public.fn_suscripcion_vigente((select public.current_tenant_id())))';
  v_modulo  constant text := '(select public.fn_modulo_habilitado((select public.current_tenant_id()), ''contabilidad''))';
  v_leer    constant text := v_tenant || ' and ' || v_activo || ' and ' || v_admgrt;
  v_escribir constant text := v_tenant || ' and ' || v_activo || ' and ' || v_admgrt;
  v_op      text;
begin
  foreach v_op in array array['select', 'insert', 'update', 'delete'] loop
    execute format('drop policy if exists %I on public.%I', t || '_' || v_op, t);
  end loop;
  foreach v_op in array array['insert', 'update', 'delete'] loop
    execute format('drop policy if exists %I on public.%I', t || '_vigente_' || v_op, t);
    execute format('drop policy if exists %I on public.%I', t || '_modulo_' || v_op, t);
  end loop;

  execute format('create policy %I on public.%I for select to authenticated using (%s)',
                 t || '_select', t, v_leer);
  execute format('create policy %I on public.%I for insert to authenticated with check (%s)',
                 t || '_insert', t, v_escribir);
  execute format('create policy %I on public.%I for update to authenticated using (%s) with check (%s)',
                 t || '_update', t, v_escribir, v_escribir);
  execute format('create policy %I on public.%I for delete to authenticated using (%s)',
                 t || '_delete', t, v_escribir);

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
end;
$$;

-- ─── Copy of the chart from the template ─────────────────────────────────────
-- Internal helper: copies accounts (with clave and activo) and categories from
-- `plantilla-base` to a hotel, remapping account ids and parents by level. Does
-- nothing when the hotel already has accounts, so a hotel that customised its
-- chart is never touched and a second call is a no-op.
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
end;
$$;

comment on function public.fn_copiar_plan_cuentas_plantilla(bigint) is
  'Copies chart of accounts and finance categories from plantilla-base to a hotel that has no accounts yet. Internal (no EXECUTE for the client).';

-- ─── Provisioning ────────────────────────────────────────────────────────────
-- Same function as 0008 (chart and concepts copied from the template); the chart
-- part moved into fn_copiar_plan_cuentas_plantilla so the backfill below reuses it.
-- Called by fn_provision_tenant (0008/0014) for every new hotel, whatever its plan.
create or replace function public.fn_seed_tenant_desde_plantilla(p_tenant bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plantilla bigint;
begin
  -- The template is identified by slug AND attributes: even if another tenant
  -- got that slug, nothing is copied from it.
  select t.id into v_plantilla
  from public.tenants t
  where t.slug = 'plantilla-base'
    and t.estado = 'suspendido'
    and t.plan = 'plantilla';

  if v_plantilla is null or v_plantilla = p_tenant then
    return;
  end if;

  perform public.fn_copiar_plan_cuentas_plantilla(p_tenant);

  insert into public.conceptos
    (tenant_id, nombre, arancel, descripcion, fk_iva, fk_unidad_medida, estado, fk_servicio)
  select p_tenant, c.nombre, c.arancel, c.descripcion, c.fk_iva, c.fk_unidad_medida, c.estado, c.fk_servicio
  from public.conceptos c
  where c.tenant_id = v_plantilla
    and not exists (
      select 1 from public.conceptos x
      where x.tenant_id = p_tenant and lower(trim(x.nombre)) = lower(trim(c.nombre))
    );
end;
$$;

-- ─── Privileges ──────────────────────────────────────────────────────────────
-- 0012 already revokes EXECUTE from what is created above; repeated so it does
-- not depend on that event trigger. CREATE OR REPLACE of the seed function fires
-- the guard again, hence the explicit grant (same as 0011).
revoke execute on function public.fn_copiar_plan_cuentas_plantilla(bigint) from public, anon, authenticated;
revoke execute on function public.fn_seed_tenant_desde_plantilla(bigint)   from public, anon, authenticated;
grant  execute on function public.fn_seed_tenant_desde_plantilla(bigint)   to service_role;

-- ─── Backfill ────────────────────────────────────────────────────────────────
-- Every existing hotel without accounts gets the chart and categories. Hotels
-- that already have accounts are left untouched (the helper skips them).
do $$
declare
  r record;
begin
  for r in
    select t.id
    from public.tenants t
    where t.slug <> 'plantilla-base'
      and not exists (select 1 from public.cuentas_contables c where c.tenant_id = t.id)
    order by t.id
  loop
    perform public.fn_copiar_plan_cuentas_plantilla(r.id);
  end loop;
end;
$$;
