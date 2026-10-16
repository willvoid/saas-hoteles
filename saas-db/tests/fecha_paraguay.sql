-- ═══════════════════════════════════════════════════════════════════════════
-- Suite de fecha de Paraguay (0015)
-- ═══════════════════════════════════════════════════════════════════════════
-- Comprueba que la base usa public.hoy_py() (America/Asuncion) y no
-- current_date (UTC). No depende del reloj: la conversion horaria se prueba con
-- instantes fijos, y el resto sustituye hoy_py() por una fecha fija dentro de la
-- transaccion (que se revierte), de modo que cualquier uso de current_date en
-- las funciones haria fallar la prueba.
--
-- Requisitos: migraciones 0001-0015 y supabase/seed.sql aplicados.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f tests/fecha_paraguay.sql
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

-- Fija la fecha que devuelve hoy_py() (ignora el reloj real). Se vuelve a
-- conceder EXECUTE porque CREATE OR REPLACE dispara la guarda de 0012.
create function t.reloj(p_fecha date) returns void language plpgsql as $$
begin
  execute format(
    'create or replace function public.hoy_py() returns date language sql stable set search_path = '''' as $f$ select %L::date $f$',
    p_fecha);
  execute 'grant execute on function public.hoy_py() to authenticated';
end $$;

-- ─── Conversion horaria ──────────────────────────────────────────────────────
do $$
declare
  v_def text := pg_get_functiondef('public.hoy_py()'::regprocedure);
begin
  perform t.ok(v_def like '%America/Asuncion%' and v_def not like '%current_date%',
               'hoy_py() usa America/Asuncion y no current_date');
  perform t.ok((select provolatile = 's' from pg_proc where oid = 'public.hoy_py()'::regprocedure),
               'hoy_py() es STABLE');
  perform t.ok((select array_to_string(proconfig, ',') = 'search_path=""' from pg_proc where oid = 'public.hoy_py()'::regprocedure),
               'hoy_py() fija search_path vacio');
  perform t.ok(public.hoy_py() = (now() at time zone 'America/Asuncion')::date,
               'hoy_py() es la fecha local de Paraguay ahora');
  perform t.ok(public.hoy_py() between current_date - 1 and current_date,
               'hoy_py() queda a lo sumo un dia detras de la fecha UTC');

  -- Entre 00:00 y 03:00 UTC Paraguay sigue en el dia anterior: ahi current_date
  -- se adelanta. A las 03:00 UTC (medianoche local) vuelven a coincidir.
  perform t.ok(('2031-03-16 00:00:00+00'::timestamptz at time zone 'America/Asuncion')::date = date '2031-03-15',
               '00:00 UTC sigue siendo el dia anterior en Paraguay');
  perform t.ok(('2031-03-16 02:59:59+00'::timestamptz at time zone 'America/Asuncion')::date = date '2031-03-15',
               '02:59 UTC sigue siendo el dia anterior en Paraguay');
  perform t.ok(('2031-03-16 03:00:00+00'::timestamptz at time zone 'America/Asuncion')::date = date '2031-03-16',
               '03:00 UTC es medianoche en Paraguay');
  perform t.ok(('2031-03-15 23:59:59+00'::timestamptz at time zone 'America/Asuncion')::date = date '2031-03-15',
               '23:59 UTC es el mismo dia en Paraguay');
end $$;

-- ─── Privilegios ─────────────────────────────────────────────────────────────
do $$
begin
  perform t.ok(has_function_privilege('authenticated', 'public.hoy_py()', 'execute'),
               'authenticated ejecuta hoy_py()');
  perform t.ok(not has_function_privilege('anon', 'public.hoy_py()', 'execute'),
               'anon no ejecuta hoy_py()');
  perform t.ok(has_function_privilege('authenticated', 'public.fn_suscripcion_vigente(bigint)', 'execute'),
               'authenticated conserva fn_suscripcion_vigente');
  perform t.ok(not has_function_privilege('authenticated', 'public.fn_activar_plan(bigint,text,text,numeric,text)', 'execute')
               and has_function_privilege('service_role', 'public.fn_activar_plan(bigint,text,text,numeric,text)', 'execute'),
               'fn_activar_plan sigue siendo solo de service_role');
  perform t.ok(not has_function_privilege('authenticated', 'public.fn_provision_tenant(jsonb)', 'execute')
               and has_function_privilege('service_role', 'public.fn_provision_tenant(jsonb)', 'execute'),
               'fn_provision_tenant sigue siendo solo de service_role');
  perform t.ok(not has_function_privilege('authenticated', 'public.fn_actualizar_estado_tarifas()', 'execute'),
               'fn_actualizar_estado_tarifas sigue sin acceso para authenticated');
end $$;

-- ─── Alta con trial: trial_fin parte de hoy_py() ─────────────────────────────
select t.reloj(date '2031-03-15');

do $$
declare
  v_contrib bigint := (select min(id_tipo_contribuyente) from public.tipo_contribuyente);
  v_regimen bigint := (select min(id_regimen) from public.tipo_regimen);
  v_u uuid := gen_random_uuid();
  v_res jsonb; v_t bigint;
begin
  insert into auth.users (id, email) values (v_u, 'fecha@p.test');
  v_res := public.fn_provision_tenant(jsonb_build_object(
    'tenant', jsonb_build_object('nombre', 'Hotel Fecha', 'slug', 'fecha-py'),
    'admin', jsonb_build_object('auth_id', v_u, 'nombre', 'Admin', 'documento', 'F1', 'fk_tipo_doc', 1),
    'empresa', jsonb_build_object('ruc', '81000001-1', 'razon_social', 'Hotel F',
                                  'fk_contribuyente', v_contrib, 'fk_regimen', v_regimen),
    'establecimiento', jsonb_build_object('direccion', 'Calle', 'fk_barrio', 1)));
  v_t := (v_res ->> 'tenant_id')::bigint;
  perform set_config('test.hotel', v_t::text, true);

  perform t.ok((select trial_fin from public.tenants where id = v_t) = date '2031-04-14',
               'fn_provision_tenant: trial_fin = hoy_py() + 30 dias');
end $$;

-- ─── Vigencia del trial ──────────────────────────────────────────────────────
do $$
declare v_t bigint := current_setting('test.hotel')::bigint;
begin
  perform t.reloj(date '2031-04-14');
  perform t.ok(public.fn_suscripcion_vigente(v_t), 'el trial vale hasta el ultimo dia (hoy_py() = trial_fin)');
  perform t.reloj(date '2031-04-15');
  perform t.ok(not public.fn_suscripcion_vigente(v_t), 'el trial vence al dia siguiente segun hoy_py()');
end $$;

-- ─── Activacion y vigencia de un plan pagado ─────────────────────────────────
do $$
declare
  v_t bigint := current_setting('test.hotel')::bigint;
  v_hasta date;
begin
  -- Trial ya vencido: la activacion parte del dia de Paraguay, no del de UTC.
  perform t.reloj(date '2031-05-01');
  v_hasta := public.fn_activar_plan(v_t, 'pro', 'mensual', null, 'fecha-1');
  perform t.ok((select desde from public.pagos_suscripcion where tenant_id = v_t and referencia = 'fecha-1') = date '2031-05-01',
               'fn_activar_plan: desde = hoy_py() cuando no hay vigencia');
  perform t.ok(v_hasta = date '2031-06-01'
               and (select vigente_hasta from public.tenants where id = v_t) = date '2031-06-01',
               'fn_activar_plan: hasta = hoy_py() + 1 mes');

  -- Renovacion con vigencia: se suma a lo que queda, no a hoy.
  perform t.reloj(date '2031-05-20');
  v_hasta := public.fn_activar_plan(v_t, 'pro', 'mensual', null, 'fecha-2');
  perform t.ok((select desde from public.pagos_suscripcion where tenant_id = v_t and referencia = 'fecha-2') = date '2031-06-01'
               and v_hasta = date '2031-07-01',
               'fn_activar_plan: con vigencia la renovacion parte de vigente_hasta');

  -- Vigencia del plan pagado segun hoy_py().
  perform t.reloj(date '2031-07-01');
  perform t.ok(public.fn_suscripcion_vigente(v_t), 'el plan vale hasta el dia de vigente_hasta (hoy_py())');
  perform t.reloj(date '2031-07-02');
  perform t.ok(not public.fn_suscripcion_vigente(v_t), 'el plan vence al dia siguiente segun hoy_py()');

  -- Vencido: la nueva activacion vuelve a partir del dia local.
  v_hasta := public.fn_activar_plan(v_t, 'pro', 'anual', null, 'fecha-3');
  perform t.ok((select desde from public.pagos_suscripcion where tenant_id = v_t and referencia = 'fecha-3') = date '2031-07-02'
               and v_hasta = date '2032-07-02',
               'fn_activar_plan: vencido, el ciclo anual parte de hoy_py()');
end $$;

-- ─── Tarifas: fecha de inicio y vencimiento ──────────────────────────────────
do $$
declare
  v_t bigint := current_setting('test.hotel')::bigint;
  v_th bigint;
begin
  perform t.reloj(date '2031-09-10');
  insert into public.tipo_habitacion (tenant_id, nombre, descripcion, capacidad)
    values (v_t, 'Doble', 'd', 2) returning id into v_th;

  insert into public.tarifas (tenant_id, nombre, precio_base, estado, fk_tipo_habitacion, fecha_fin)
  values (v_t, 'Sin fin', 1, 'Activa', v_th, null),
         (v_t, 'Vencio ayer', 1, 'Activa', v_th, date '2031-09-09'),
         (v_t, 'Vence hoy', 1, 'Activa', v_th, date '2031-09-10');

  perform t.ok((select fecha_inicio from public.tarifas where nombre = 'Sin fin') = date '2031-09-10',
               'tarifas.fecha_inicio toma hoy_py() por defecto');

  perform public.fn_actualizar_estado_tarifas();
  perform t.ok((select estado from public.tarifas where nombre = 'Vencio ayer') = 'Inactiva',
               'la tarifa con fecha_fin anterior a hoy_py() se desactiva');
  perform t.ok((select estado from public.tarifas where nombre = 'Vence hoy') = 'Activa',
               'la tarifa que vence hoy_py() sigue activa hasta que termine el dia');
  perform t.ok((select estado from public.tarifas where nombre = 'Sin fin') = 'Activa',
               'la tarifa sin fecha_fin no vence');
end $$;

select 'TODAS LAS PRUEBAS DE FECHA PARAGUAY PASARON' as resultado;

rollback;
