-- ═══════════════════════════════════════════════════════════════════════════
-- Suite del registro publico (0015)
-- ═══════════════════════════════════════════════════════════════════════════
-- Comprueba fn_planes_publicos, los catalogos del asistente de registro y el
-- rate limit de register-tenant desde los roles anon, authenticated y
-- service_role. Corre en una transaccion que se revierte al final.
--
-- Requisitos: migraciones 0001-0015 y supabase/seed.sql aplicados.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f tests/registro_publico.sql
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

create function t.como(p_rol text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    case when p_rol = 'anon' then json_build_object('role', 'anon')::text
         else json_build_object('sub', gen_random_uuid()::text, 'role', p_rol)::text end, true);
  execute format('set local role %I', p_rol);
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
    raise exception 'FALLO: % - la sentencia no fallo', p_msg;
  end if;
  raise notice 'ok  - % (%)', p_msg, p_estado;
end $$;

-- ─── Planes publicos (anon) ──────────────────────────────────────────────────
do $$
declare
  v_json jsonb;
  v_prev numeric := -1;
  r record;
  v_ordenado boolean := true;
begin
  perform t.como('anon');
  select coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb) into v_json from public.fn_planes_publicos() p;
  for r in select precio_mensual from public.fn_planes_publicos() loop
    if r.precio_mensual < v_prev then v_ordenado := false; end if;
    v_prev := r.precio_mensual;
  end loop;
  perform t.volver();

  perform t.ok(jsonb_array_length(v_json) = 3, 'anon ve los tres planes que se ofrecen');
  perform t.ok(not exists (select 1 from jsonb_array_elements(v_json) e where e ->> 'codigo' in ('trial', 'plantilla')),
               'no aparecen trial ni plantilla');
  perform t.ok(not exists (
                 select 1 from jsonb_array_elements(v_json) e, jsonb_object_keys(e) k where k ilike '%sifen%'),
               'ninguna columna menciona SIFEN');
  perform t.ok(position('sifen' in lower(v_json::text)) = 0, 'el resultado no contiene la palabra sifen');
  perform t.ok(v_ordenado, 'los planes salen por precio mensual ascendente');
  perform t.ok((select e ->> 'codigo' from jsonb_array_elements(v_json) e limit 1) = 'basico',
               'el primero es el mas barato (basico)');
  perform t.ok((select (e ->> 'max_habitaciones') is null and (e ->> 'max_usuarios') is null
                       and (e ->> 'max_hoteles') is null
                from jsonb_array_elements(v_json) e where e ->> 'codigo' = 'business'),
               'business conserva los topes null (ilimitado)');
  perform t.ok((select (e ->> 'mod_contabilidad')::boolean from jsonb_array_elements(v_json) e where e ->> 'codigo' = 'pro')
               and not (select (e ->> 'mod_contabilidad')::boolean from jsonb_array_elements(v_json) e where e ->> 'codigo' = 'basico'),
               'se informa el modulo de contabilidad por plan');
  perform t.ok((select count(*) from jsonb_object_keys((v_json -> 0))) = 9, 'cada plan expone solo 9 campos');

  perform t.como('authenticated');
  perform t.ok((select count(*) from public.fn_planes_publicos()) = 3, 'authenticated tambien lee los planes publicos');
  perform t.volver();

  perform t.como('anon');
  perform t.falla('select count(*) from public.planes', '42501', 'anon no lee la tabla planes');
  perform t.volver();
end $$;

-- ─── Catalogos del asistente (anon) ──────────────────────────────────────────
do $$
declare
  v_cat   jsonb;
  v_dis   jsonb;
  v_ciu   jsonb;
  v_bar   jsonb;
  v_depto bigint;
  v_distr bigint;
  v_ciud  bigint;
  v_barr  bigint;
begin
  perform t.como('anon');
  v_cat := public.fn_catalogos_registro();
  v_depto := (v_cat -> 'departamentos' -> 0 ->> 'id')::bigint;
  v_dis := public.fn_ubicaciones_registro('distritos', v_depto);
  v_distr := (v_dis -> 0 ->> 'id')::bigint;
  v_ciu := public.fn_ubicaciones_registro('ciudades', v_distr);
  v_ciud := (v_ciu -> 0 ->> 'id')::bigint;
  v_bar := public.fn_ubicaciones_registro('barrios', v_ciud);
  v_barr := (v_bar -> 0 ->> 'id')::bigint;

  perform t.ok(jsonb_array_length(v_cat -> 'tipos_documento') >= 1, 'anon lee los tipos de documento');
  perform t.ok(jsonb_array_length(v_cat -> 'contribuyentes') >= 1, 'anon lee los tipos de contribuyente');
  perform t.ok(jsonb_array_length(v_cat -> 'regimenes') >= 1, 'anon lee los regimenes');
  perform t.ok(jsonb_array_length(v_cat -> 'departamentos') >= 1, 'anon lee los departamentos');
  perform t.ok(jsonb_array_length(v_bar) >= 1, 'anon baja departamento > distrito > ciudad > barrio');
  perform t.ok(public.fn_ubicaciones_registro('barrios', -1) = '[]'::jsonb, 'un padre sin hijos devuelve []');
  perform t.falla($f$select public.fn_ubicaciones_registro('paises', 1)$f$, '22023', 'un nivel invalido se rechaza');
  perform t.falla($f$select public.fn_ubicaciones_registro('barrios', null)$f$, '22023', 'el padre es obligatorio');
  perform t.falla('select count(*) from public.barrios', '42501', 'anon sigue sin leer las tablas de catalogo');
  perform t.falla('select count(*) from public.tipo_documento', '42501', 'anon sigue sin leer tipo_documento');
  perform t.volver();

  -- Los ids devueltos son los que acepta fn_provision_tenant.
  perform t.ok(exists (select 1 from public.tipo_documento where cod_tipodoc = (v_cat -> 'tipos_documento' -> 0 ->> 'id')::bigint)
               and exists (select 1 from public.tipo_contribuyente where id_tipo_contribuyente = (v_cat -> 'contribuyentes' -> 0 ->> 'id')::bigint)
               and exists (select 1 from public.tipo_regimen where id_regimen = (v_cat -> 'regimenes' -> 0 ->> 'id')::bigint)
               and exists (select 1 from public.barrios where cod_barrio = v_barr),
               'los ids del catalogo son las llaves foraneas que usa el alta');
end $$;

-- ─── Rate limit: privilegios ─────────────────────────────────────────────────
do $$
begin
  perform t.como('anon');
  perform t.falla($f$select public.fn_registro_rate_limit('k', 3, interval '1 hour')$f$, '42501',
                  'anon no ejecuta fn_registro_rate_limit');
  perform t.falla('select count(*) from public.registro_intentos', '42501', 'anon no lee registro_intentos');
  perform t.volver();

  perform t.como('authenticated');
  perform t.falla($f$select public.fn_registro_rate_limit('k', 3, interval '1 hour')$f$, '42501',
                  'authenticated no ejecuta fn_registro_rate_limit');
  perform t.falla('select count(*) from public.registro_intentos', '42501', 'authenticated no lee registro_intentos');
  perform t.volver();
end $$;

-- ─── Rate limit: comportamiento (service_role) ───────────────────────────────
do $$
declare
  v_res boolean[] := '{}';
  i int;
begin
  perform t.como('service_role');

  for i in 1..5 loop
    v_res := v_res || public.fn_registro_rate_limit('ip-1', 3, interval '1 hour');
  end loop;
  perform t.ok(v_res = array[true, true, true, false, false], 'permite p_max intentos y rechaza el siguiente');
  perform t.ok(public.fn_registro_rate_limit('ip-2', 3, interval '1 hour'), 'otra clave tiene su propio contador');
  perform t.ok(not exists (select 1 from public.registro_intentos where clave_hash like '%ip-%'),
               'no se guarda la clave en claro');
  perform t.ok((select count(*) from public.registro_intentos where clave_hash = encode(sha256('ip-1'::bytea), 'hex')) = 5,
               'se guarda el hash sha256 de la clave y cada intento queda registrado');

  perform t.falla($f$select public.fn_registro_rate_limit('', 3, interval '1 hour')$f$, '22023', 'la clave no puede ser vacia');
  perform t.falla($f$select public.fn_registro_rate_limit('x', 0, interval '1 hour')$f$, '22023', 'p_max debe ser >= 1');
  perform t.falla($f$select public.fn_registro_rate_limit('x', 3, interval '0')$f$, '22023', 'la ventana debe ser positiva');
  perform t.volver();

  -- Los intentos fuera de la ventana no cuentan.
  update public.registro_intentos set created_at = now() - interval '2 hours'
  where clave_hash = encode(sha256('ip-1'::bytea), 'hex');
  perform t.como('service_role');
  perform t.ok(public.fn_registro_rate_limit('ip-1', 3, interval '1 hour'), 'pasada la ventana la clave vuelve a poder intentar');

  -- Limpieza: lo que supera max(ventana, 1 dia) se borra.
  perform t.volver();
  update public.registro_intentos set created_at = now() - interval '3 days'
  where clave_hash = encode(sha256('ip-1'::bytea), 'hex') and created_at < now() - interval '1 hour';
  perform t.como('service_role');
  perform public.fn_registro_rate_limit('ip-2', 3, interval '1 hour');
  perform t.volver();
  perform t.ok((select count(*) from public.registro_intentos where created_at < now() - interval '1 day') = 0,
               'las filas de mas de un dia se limpian');
end $$;

select 'TODAS LAS PRUEBAS DEL REGISTRO PUBLICO PASARON' as resultado;

rollback;
