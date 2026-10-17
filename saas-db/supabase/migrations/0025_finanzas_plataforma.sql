-- ═══════════════════════════════════════════════════════════════════════════
-- 0025 · Finanzas de plataforma
-- ═══════════════════════════════════════════════════════════════════════════
-- Libro de ingresos y egresos del propio SaaS (no de los hoteles; eso es
-- 0016-0021). Solo guaranies. Los ingresos por suscripcion salen de
-- pagos_suscripcion; aqui se agregan ingresos manuales y los egresos.
--
-- Mismo patron que 0024: RLS activo, sin acceso para anon ni authenticated,
-- todo pasa por la edge function `superadmin` con service_role.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Categorias ──────────────────────────────────────────────────────────────
create table public.platform_categorias (
  id         uuid primary key default gen_random_uuid(),
  nombre     text not null unique check (length(trim(nombre)) > 0),
  tipo       text not null check (tipo in ('ingreso', 'egreso')),
  activo     boolean not null default true,
  created_at timestamptz not null default now()
);

comment on table public.platform_categorias is
  'Categorias de ingresos y egresos de la plataforma. Sin acceso para anon ni authenticated: solo service_role.';

alter table public.platform_categorias enable row level security;
revoke all on public.platform_categorias from anon, authenticated;

insert into public.platform_categorias (nombre, tipo) values
  ('Hosting',        'egreso'),
  ('Dominios',       'egreso'),
  ('Marketing',      'egreso'),
  ('Sueldos',        'egreso'),
  ('Impuestos',      'egreso'),
  ('Software',       'egreso'),
  ('Otros ingresos', 'ingreso')
on conflict (nombre) do nothing;

-- ─── Movimientos ─────────────────────────────────────────────────────────────
create table public.platform_movimientos (
  id           uuid primary key default gen_random_uuid(),
  tipo         text not null check (tipo in ('ingreso', 'egreso')),
  categoria_id uuid not null references public.platform_categorias (id),
  monto        numeric(14, 0) not null check (monto > 0),
  fecha        date not null,
  descripcion  text,
  referencia   text,
  created_by   uuid,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  anulado      boolean not null default false
);

create index platform_movimientos_fecha_idx on public.platform_movimientos (fecha);

comment on table public.platform_movimientos is
  'Ingresos manuales y egresos de la plataforma, en guaranies. Se anulan con `anulado`, no se borran. Sin acceso para anon ni authenticated.';

alter table public.platform_movimientos enable row level security;
revoke all on public.platform_movimientos from anon, authenticated;

-- ─── Resumen ─────────────────────────────────────────────────────────────────
-- Fecha de un pago de suscripcion = created_at (cuando se cobro) en hora de
-- Paraguay, no `desde` (inicio del periodo cubierto): es el ingreso de caja.
-- MRR: hoteles activos con suscripcion vigente; mensual = precio_mensual,
-- anual = precio_anual / 12. Los trials no pagan y no cuentan.
create or replace function public.fn_admin_finanzas_resumen(p_desde date, p_hasta date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if p_desde is null or p_hasta is null or p_desde > p_hasta then
    raise exception 'Rango de fechas invalido.' using errcode = '22023';
  end if;

  with pagos as (
    select ps.tenant_id, ps.monto,
           (ps.created_at at time zone 'America/Asuncion')::date as fecha
    from public.pagos_suscripcion ps
    where (ps.created_at at time zone 'America/Asuncion')::date between p_desde and p_hasta
  ),
  movs as (
    select m.tipo, m.monto, m.fecha, c.nombre as categoria
    from public.platform_movimientos m
    join public.platform_categorias c on c.id = m.categoria_id
    where not m.anulado and m.fecha between p_desde and p_hasta
  ),
  meses as (
    select to_char(fecha, 'YYYY-MM') as mes, monto as ingresos, 0::numeric as egresos from pagos
    union all
    select to_char(fecha, 'YYYY-MM'), case when tipo = 'ingreso' then monto else 0 end,
           case when tipo = 'egreso' then monto else 0 end
    from movs
  ),
  tot as (
    select coalesce((select sum(monto) from pagos), 0)                              as ing_susc,
           coalesce((select sum(monto) from movs where tipo = 'ingreso'), 0)        as ing_man,
           coalesce((select sum(monto) from movs where tipo = 'egreso'), 0)         as egr
  )
  select jsonb_build_object(
    'totales', jsonb_build_object(
      'ingresos_suscripcion', tot.ing_susc,
      'ingresos_manuales',    tot.ing_man,
      'egresos',              tot.egr,
      'neto',                 tot.ing_susc + tot.ing_man - tot.egr),
    'serie_mensual', coalesce((
      select jsonb_agg(jsonb_build_object('mes', s.mes, 'ingresos', s.ing, 'egresos', s.egr)
                       order by s.mes)
      from (select mes, sum(ingresos) as ing, sum(egresos) as egr from meses group by mes) s
    ), '[]'::jsonb),
    'por_categoria', coalesce((
      select jsonb_agg(jsonb_build_object('categoria', x.categoria, 'tipo', x.tipo, 'total', x.total)
                       order by x.total desc, x.categoria)
      from (select categoria, tipo, sum(monto) as total from movs group by categoria, tipo) x
    ), '[]'::jsonb),
    'por_tenant', coalesce((
      select jsonb_agg(jsonb_build_object('tenant_id', y.tenant_id, 'nombre', y.nombre, 'total', y.total)
                       order by y.total desc, y.nombre)
      from (select p.tenant_id, t.nombre, sum(p.monto) as total
            from pagos p join public.tenants t on t.id = p.tenant_id
            group by p.tenant_id, t.nombre) y
    ), '[]'::jsonb),
    'mrr', coalesce((
      select sum(case t.ciclo_facturacion
                   when 'anual' then pl.precio_anual / 12
                   else pl.precio_mensual end)
      from public.tenants t
      join public.planes pl on pl.codigo = t.plan
      where t.estado = 'activo'
        and t.ciclo_facturacion is not null
        and public.fn_suscripcion_vigente(t.id)
    ), 0)
  ) into v_result
  from tot;

  return v_result;
end;
$$;

comment on function public.fn_admin_finanzas_resumen(date, date) is
  'Resumen financiero de la plataforma para el rango dado (excluye anulados). Solo service_role.';

-- ─── Privilegios ─────────────────────────────────────────────────────────────
revoke execute on function public.fn_admin_finanzas_resumen(date, date) from public, anon, authenticated;
grant  execute on function public.fn_admin_finanzas_resumen(date, date) to service_role;

grant select, insert, update on public.platform_categorias  to service_role;
grant select, insert, update on public.platform_movimientos to service_role;
