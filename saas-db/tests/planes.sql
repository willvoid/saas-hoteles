-- ═══════════════════════════════════════════════════════════════════════════
-- Suite de planes y suscripciones (0014)
-- ═══════════════════════════════════════════════════════════════════════════
-- Comprueba topes de habitaciones y usuarios, modulos por plan, solo lectura al
-- vencer, fn_activar_plan y privilegios. Corre en una transaccion que se
-- revierte al final: no deja nada en la base.
--
-- Requisitos: migraciones 0001-0015 y supabase/seed.sql aplicados.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f tests/planes.sql
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
    raise exception 'FALLO: % - la sentencia no fallo', p_msg;
  end if;
  raise notice 'ok  - % (%)', p_msg, p_estado;
end $$;

create function t.filas(p_sql text, p_esperadas bigint, p_msg text) returns void language plpgsql as $$
declare n bigint;
begin
  execute p_sql;
  get diagnostics n = row_count;
  perform t.ok(n = p_esperadas, p_msg || ' (filas=' || n || ')');
end $$;

create function t.cuenta(p_sql text) returns bigint language plpgsql as $$
declare n bigint;
begin
  execute p_sql into n;
  return n;
end $$;

create function t.g(p_clave text) returns text language sql as $$
  select current_setting('test.' || p_clave)
$$;

-- ─── Fixtures: tres hoteles (basico, pro, business) ──────────────────────────
do $$
declare
  v_contrib bigint := (select min(id_tipo_contribuyente) from public.tipo_contribuyente);
  v_regimen bigint := (select min(id_regimen) from public.tipo_regimen);
  v_plan text; v_i int := 0; v_u uuid; v_res jsonb; v_t bigint; v_estab bigint;
  v_edif bigint; v_piso bigint; v_th bigint;
begin
  foreach v_plan in array array['basico', 'pro', 'business'] loop
    v_i := v_i + 1;
    v_u := gen_random_uuid();
    insert into auth.users (id, email) values (v_u, v_plan || '@p.test');
    v_res := public.fn_provision_tenant(jsonb_build_object(
      'tenant', jsonb_build_object('nombre', 'Hotel ' || v_plan, 'slug', 'plan-' || v_plan),
      'admin', jsonb_build_object('auth_id', v_u, 'nombre', 'Admin', 'documento', 'P' || v_i, 'fk_tipo_doc', 1),
      'empresa', jsonb_build_object('ruc', '8100000' || v_i || '-1', 'razon_social', 'Hotel P',
                                    'fk_contribuyente', v_contrib, 'fk_regimen', v_regimen),
      'establecimiento', jsonb_build_object('direccion', 'Calle', 'fk_barrio', 1)));
    v_t := (v_res ->> 'tenant_id')::bigint;
    v_estab := (v_res ->> 'id_establecimiento')::bigint;
    perform public.fn_activar_plan(v_t, v_plan, 'mensual', null, 'test-' || v_plan);

    insert into public.edificios (tenant_id, nombre, estado, fk_sucursal)
      values (v_t, 'E', 'Activo', v_estab) returning id into v_edif;
    insert into public.pisos (tenant_id, numero, estado, fk_edificio)
      values (v_t, 1, 'Activo', v_edif) returning id into v_piso;
    insert into public.tipo_habitacion (tenant_id, nombre, descripcion, capacidad)
      values (v_t, 'Doble', 'd', 2) returning id into v_th;
    perform set_config('test.' || v_plan, v_t::text, true);
    perform set_config('test.' || v_plan || '_admin', v_u::text, true);
    perform set_config('test.' || v_plan || '_th', v_th::text, true);
    perform set_config('test.' || v_plan || '_piso', v_piso::text, true);
  end loop;
end $$;

-- ─── Activacion y catalogo ───────────────────────────────────────────────────
do $$
begin
  perform t.ok((select vigente_hasta from public.tenants where id = t.g('basico')::bigint) > public.hoy_py()
               and (select estado from public.tenants where id = t.g('basico')::bigint) = 'activo',
               'fn_activar_plan deja el hotel activo con vigencia futura');
  perform t.ok((select monto from public.pagos_suscripcion where tenant_id = t.g('basico')::bigint) = 150000,
               'el pago toma el precio de lista del plan');
  perform t.ok((select count(*) from public.planes where visible) = 3, 'se ofrecen tres planes');
  perform t.ok(public.fn_limite(t.g('pro')::bigint, 'habitaciones') = 60
               and public.fn_limite(t.g('business')::bigint, 'usuarios') is null,
               'fn_limite lee el plan del hotel (null = ilimitado)');
  perform t.falla($f$select public.fn_activar_plan(1, 'trial', 'mensual')$f$, '22023', 'no se puede activar el trial');
  perform t.falla($f$select public.fn_activar_plan(1, 'pro', 'semanal')$f$, '22023', 'el ciclo se valida');
end $$;

-- ─── Topes de habitaciones y usuarios ────────────────────────────────────────
do $$
declare
  c_rec bigint := (select id_cargo from public.cargo where lower(cargo) = 'recepcionista' limit 1);
begin
  insert into public.habitaciones (tenant_id, numero_habitacion, fk_tipo_habitacion, fk_piso)
  select t.g('basico')::bigint, 100 + g, t.g('basico_th')::bigint, t.g('basico_piso')::bigint
  from generate_series(1, 20) g;
  perform t.falla(format(
    'insert into public.habitaciones (tenant_id, numero_habitacion, fk_tipo_habitacion, fk_piso) values (%s, 999, %s, %s)',
    t.g('basico'), t.g('basico_th'), t.g('basico_piso')), '23514', 'Basico rechaza la habitacion 21');

  insert into public.habitaciones (tenant_id, numero_habitacion, fk_tipo_habitacion, fk_piso)
  select t.g('business')::bigint, 100 + g, t.g('business_th')::bigint, t.g('business_piso')::bigint
  from generate_series(1, 70) g;
  perform t.ok(true, 'Business no tiene tope de habitaciones (70 altas)');

  -- Basico: el admin del alta mas 2 = 3; el cuarto se rechaza.
  insert into public.usuario (tenant_id, correo, nombre, documento, usuario, fk_tipo_doc, fk_cargo)
  select t.g('basico')::bigint, 'u' || g || '@p.test', 'U', 'D' || g, 'u' || g, 1, c_rec
  from generate_series(1, 2) g;
  perform t.falla(format(
    'insert into public.usuario (tenant_id, correo, nombre, documento, usuario, fk_tipo_doc, fk_cargo) values (%s, ''u9@p.test'', ''U'', ''D9'', ''u9'', 1, %s)',
    t.g('basico'), c_rec), '23514', 'Basico rechaza el cuarto usuario');
end $$;

-- ─── Modulos por plan ────────────────────────────────────────────────────────
do $$
declare
  v_tipo bigint;
  v_cta  text;
begin
  insert into public.tipo_cuenta_contable (nombre) values ('Activo') returning id into v_tipo;
  v_cta := format('insert into public.cuentas_contables (nombre, codigo, fk_tipo_cuenta, imputable) values (''C'', ''9.9.9'', %s, true)', v_tipo);

  perform t.actuar(t.g('basico_admin'), t.g('basico')::bigint);
  perform t.falla(v_cta, '42501', 'Basico no escribe en contabilidad');
  perform t.falla('insert into public.timbrados (timbrado, inicio, vencimiento, estado, fk_establecimiento) values (''1'', public.hoy_py(), public.hoy_py(), ''Activo'', 1)',
                  '42501', 'Basico no escribe en timbrados (SIFEN)');
  perform t.volver();

  perform t.actuar(t.g('pro_admin'), t.g('pro')::bigint);
  execute v_cta;
  perform t.ok(true, 'Pro si escribe en contabilidad');
  perform t.volver();
end $$;

-- ─── Trial vencido: solo lectura ─────────────────────────────────────────────
do $$
begin
  update public.tenants set estado = 'trial', trial_fin = public.hoy_py() - 1, vigente_hasta = null
  where id = t.g('pro')::bigint;
  perform t.ok(not public.fn_suscripcion_vigente(t.g('pro')::bigint), 'un trial vencido no esta vigente');

  perform t.actuar(t.g('pro_admin'), t.g('pro')::bigint);
  perform t.ok(t.cuenta('select count(*) from public.tipo_habitacion') = 1, 'el trial vencido sigue leyendo');
  perform t.falla('insert into public.clientes (razon_social, documento, celular, es_proveedor_del_estado) values (''X'', ''X1'', ''0'', false)',
                  '42501', 'el trial vencido no inserta');
  perform t.filas('update public.tipo_habitacion set descripcion = ''z''', 0, 'el trial vencido no actualiza');
  perform t.filas('delete from public.tipo_habitacion', 0, 'el trial vencido no borra');
  perform t.volver();

  perform public.fn_activar_plan(t.g('pro')::bigint, 'pro', 'anual', 3500000, 'renovacion');
  perform t.ok((select vigente_hasta from public.tenants where id = t.g('pro')::bigint) >= public.hoy_py() + 365,
               'el ciclo anual extiende 12 meses');
  perform t.actuar(t.g('pro_admin'), t.g('pro')::bigint);
  perform t.filas('update public.tipo_habitacion set descripcion = ''z''', 1, 'tras activar el plan vuelve a escribir');
  perform t.volver();
end $$;

-- ─── Privilegios ─────────────────────────────────────────────────────────────
do $$
begin
  perform t.actuar(t.g('pro_admin'), t.g('pro')::bigint);
  perform t.falla(format('select public.fn_activar_plan(%s, ''business'', ''mensual'')', t.g('pro')), '42501',
                  'authenticated no ejecuta fn_activar_plan');
  perform t.falla('select count(*) from public.pagos_suscripcion', '42501', 'authenticated no lee pagos_suscripcion');
  perform t.ok(t.cuenta('select count(*) from public.planes') = 5, 'authenticated lee el catalogo de planes');
  perform t.falla('update public.planes set precio_mensual = 0', '42501', 'authenticated no modifica planes');
  perform t.ok(public.fn_max_hoteles_cuenta() = 5, 'fn_max_hoteles_cuenta devuelve el tope del plan administrado');
  perform t.volver();
end $$;

select 'TODAS LAS PRUEBAS DE PLANES PASARON' as resultado;

rollback;
