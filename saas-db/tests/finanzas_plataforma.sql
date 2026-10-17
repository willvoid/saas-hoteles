-- ═══════════════════════════════════════════════════════════════════════════
-- Suite de finanzas de plataforma (0025)
-- ═══════════════════════════════════════════════════════════════════════════
-- Comprueba categorias sembradas, que las tablas y la funcion de finanzas no
-- son accesibles para authenticated/anon y que fn_admin_finanzas_resumen suma
-- bien (ingresos por suscripcion y manuales, egresos, MRR, serie, anulados).
-- Corre en una transaccion que se revierte al final: no deja nada en la base.
--
-- Requisitos: migraciones 0001-0025 y supabase/seed.sql aplicados.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f tests/finanzas_plataforma.sql
-- ═══════════════════════════════════════════════════════════════════════════

begin;

create schema t;
grant usage on schema t to public;

create function t.ok(p_cond boolean, p_msg text) returns void language plpgsql as $$
begin
  if p_cond is not true then
    raise exception 'FALLO: %', p_msg;
  end if;
  raise notice 'ok  - %', p_msg;
end $$;

create function t.actuar(p_auth text, p_tenant bigint) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_auth, 'role', 'authenticated',
                      'app_metadata', json_build_object('tenant_id', p_tenant))::text, true);
  execute 'set local role authenticated';
end $$;

create function t.volver() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
end $$;

create function t.falla(p_sql text, p_estado text, p_msg text) returns void language plpgsql as $$
declare v_fallo boolean := false;
begin
  begin
    execute p_sql;
  exception when others then
    if sqlstate = p_estado then
      v_fallo := true;
    else
      raise exception 'FALLO: % - se esperaba % y llego % (%)', p_msg, p_estado, sqlstate, sqlerrm;
    end if;
  end;
  if not v_fallo then
    raise exception 'FALLO: % - no fallo', p_msg;
  end if;
  raise notice 'ok  - %', p_msg;
end $$;

insert into auth.users (id, email)
values ('00000000-0000-0000-0000-0000000000b1', 'operador-fin@plataforma.test');

-- ─── Categorias sembradas ───────────────────────────────────────────────────
do $$
begin
  perform t.ok((select count(*) from public.platform_categorias
                where tipo = 'egreso' and nombre in
                  ('Hosting','Dominios','Marketing','Sueldos','Impuestos','Software')) = 6,
               'seis categorias de egreso sembradas');
  perform t.ok(exists (select 1 from public.platform_categorias
                       where nombre = 'Otros ingresos' and tipo = 'ingreso'),
               'categoria de ingreso sembrada');
end $$;

-- ─── authenticated y anon denegados ─────────────────────────────────────────
do $$
begin
  perform t.actuar('00000000-0000-0000-0000-0000000000b1', null);
  perform t.falla('select count(*) from public.platform_categorias', '42501',
                  'authenticated no lee platform_categorias');
  perform t.falla('select count(*) from public.platform_movimientos', '42501',
                  'authenticated no lee platform_movimientos');
  perform t.falla('insert into public.platform_movimientos (tipo, categoria_id, monto, fecha) select ''egreso'', id, 1, current_date from public.platform_categorias limit 1',
                  '42501', 'authenticated no inserta movimientos');
  perform t.falla('select public.fn_admin_finanzas_resumen(current_date, current_date)', '42501',
                  'authenticated no ejecuta fn_admin_finanzas_resumen');
  perform t.volver();

  execute 'set local role anon';
  perform t.falla('select count(*) from public.platform_movimientos', '42501',
                  'anon no lee platform_movimientos');
  perform t.falla('select public.fn_admin_finanzas_resumen(current_date, current_date)', '42501',
                  'anon no ejecuta fn_admin_finanzas_resumen');
  perform t.volver();
end $$;

-- ─── Datos de prueba ────────────────────────────────────────────────────────
-- Linea base del MRR (la base puede traer hoteles): se asevera como delta.
-- Se toma ANTES de insertar los hoteles de prueba.
create temp table base as
select (public.fn_admin_finanzas_resumen('2099-01-01', '2099-12-31')->>'mrr')::numeric as mrr;
grant all on base to public;

insert into public.planes (codigo, nombre, precio_mensual, precio_anual)
values ('tst_fin', 'Plan Test Finanzas', 100000, 1200000);

insert into public.tenants (nombre, slug, estado, plan, ciclo_facturacion, vigente_hasta) values
  ('Hotel Fin Mensual', 'hotel-fin-mensual', 'activo', 'tst_fin', 'mensual', current_date + 20),
  ('Hotel Fin Anual',   'hotel-fin-anual',   'activo', 'tst_fin', 'anual',   current_date + 200),
  ('Hotel Fin Vencido', 'hotel-fin-vencido', 'activo', 'tst_fin', 'mensual', current_date - 5);

-- Los datos de prueba viven en 2099 para no mezclarse con datos reales.
insert into public.pagos_suscripcion (tenant_id, plan, ciclo, monto, desde, hasta, created_at)
select id, 'tst_fin', 'mensual', 100000, '2099-03-10', '2099-04-10', '2099-03-10 12:00+00'
from public.tenants where slug = 'hotel-fin-mensual';
insert into public.pagos_suscripcion (tenant_id, plan, ciclo, monto, desde, hasta, created_at)
select id, 'tst_fin', 'anual', 1200000, '2099-04-05', '2100-04-05', '2099-04-05 12:00+00'
from public.tenants where slug = 'hotel-fin-anual';
insert into public.pagos_suscripcion (tenant_id, plan, ciclo, monto, desde, hasta, created_at)
select id, 'tst_fin', 'mensual', 100000, '2099-06-01', '2099-07-01', '2099-06-01 12:00+00'
from public.tenants where slug = 'hotel-fin-mensual';

insert into public.platform_movimientos (tipo, categoria_id, monto, fecha, anulado)
select 'egreso', id, 300000, '2099-03-15', false from public.platform_categorias where nombre = 'Hosting';
insert into public.platform_movimientos (tipo, categoria_id, monto, fecha, anulado)
select 'egreso', id, 500000, '2099-04-20', false from public.platform_categorias where nombre = 'Sueldos';
insert into public.platform_movimientos (tipo, categoria_id, monto, fecha, anulado)
select 'egreso', id, 999999, '2099-04-21', true from public.platform_categorias where nombre = 'Sueldos';
insert into public.platform_movimientos (tipo, categoria_id, monto, fecha, anulado)
select 'ingreso', id, 250000, '2099-04-02', false from public.platform_categorias where nombre = 'Otros ingresos';
insert into public.platform_movimientos (tipo, categoria_id, monto, fecha, anulado)
select 'ingreso', id, 777777, '2099-04-03', true from public.platform_categorias where nombre = 'Otros ingresos';

-- ─── Validaciones de la tabla ───────────────────────────────────────────────
do $$
begin
  perform t.falla('insert into public.platform_movimientos (tipo, categoria_id, monto, fecha) select ''egreso'', id, 0, current_date from public.platform_categorias limit 1',
                  '23514', 'monto debe ser positivo');
  perform t.falla('insert into public.platform_movimientos (tipo, categoria_id, monto, fecha) select ''otro'', id, 1, current_date from public.platform_categorias limit 1',
                  '23514', 'tipo invalido rechazado');
end $$;

-- ─── Resumen (service_role) ─────────────────────────────────────────────────
do $$
declare
  r jsonb;
begin
  execute 'set local role service_role';

  perform t.falla('select public.fn_admin_finanzas_resumen(''2099-05-01'', ''2099-04-01'')', '22023',
                  'rango invertido rechazado');

  -- Marzo y abril de 2099
  r := public.fn_admin_finanzas_resumen('2099-03-01', '2099-04-30');
  perform t.ok((r->'totales'->>'ingresos_suscripcion')::numeric = 1300000, 'ingresos de suscripcion del rango');
  perform t.ok((r->'totales'->>'ingresos_manuales')::numeric = 250000, 'ingresos manuales excluyen anulados');
  perform t.ok((r->'totales'->>'egresos')::numeric = 800000, 'egresos excluyen anulados');
  perform t.ok((r->'totales'->>'neto')::numeric = 750000, 'neto = ingresos - egresos');

  perform t.ok(jsonb_array_length(r->'serie_mensual') = 2, 'serie mensual con dos meses');
  perform t.ok((r->'serie_mensual'->0->>'mes') = '2099-03'
               and (r->'serie_mensual'->0->>'ingresos')::numeric = 100000
               and (r->'serie_mensual'->0->>'egresos')::numeric = 300000, 'serie de marzo');
  perform t.ok((r->'serie_mensual'->1->>'mes') = '2099-04'
               and (r->'serie_mensual'->1->>'ingresos')::numeric = 1450000
               and (r->'serie_mensual'->1->>'egresos')::numeric = 500000, 'serie de abril');

  perform t.ok((select (e->>'total')::numeric from jsonb_array_elements(r->'por_categoria') e
                where e->>'categoria' = 'Sueldos' and e->>'tipo' = 'egreso') = 500000,
               'por_categoria suma Sueldos sin anulados');

  perform t.ok((r->'por_tenant'->0->>'nombre') = 'Hotel Fin Anual'
               and (r->'por_tenant'->0->>'total')::numeric = 1200000
               and (r->'por_tenant'->1->>'nombre') = 'Hotel Fin Mensual'
               and (r->'por_tenant'->1->>'total')::numeric = 100000,
               'por_tenant ordenado de mayor a menor');

  -- El pago de junio y el egreso de abril quedan fuera de marzo
  r := public.fn_admin_finanzas_resumen('2099-03-01', '2099-03-31');
  perform t.ok((r->'totales'->>'ingresos_suscripcion')::numeric = 100000, 'el rango limita los pagos');
  perform t.ok((r->'totales'->>'egresos')::numeric = 300000, 'el rango limita los egresos');

  -- MRR: mensual 100000 + anual 1200000/12 = 200000; el vencido no cuenta
  perform t.ok((public.fn_admin_finanzas_resumen('2099-01-01', '2099-12-31')->>'mrr')::numeric
               - (select mrr from base) = 200000,
               'MRR cuenta mensual y anual/12 y excluye vencidos');

  r := public.fn_admin_finanzas_resumen('2098-01-01', '2098-01-31');
  perform t.ok((r->'totales'->>'neto')::numeric = 0 and jsonb_array_length(r->'serie_mensual') = 0,
               'rango vacio devuelve ceros');

  perform t.volver();
end $$;

select 'TODAS LAS PRUEBAS DE FINANZAS_PLATAFORMA PASARON' as resultado;

rollback;
