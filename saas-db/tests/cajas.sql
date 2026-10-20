-- ═══════════════════════════════════════════════════════════════════════════
-- Suite de cajas por plan (0030)
-- ═══════════════════════════════════════════════════════════════════════════
-- Comprueba el tope de cajas por plan, que desactivar y recrear no lo esquiva,
-- que una caja con turno abierto no se desactiva, que solo admin/gerente
-- escriben cajas (la recepcion las lee) y el aislamiento entre hoteles. Corre
-- en una transaccion que se revierte al final: no deja nada en la base.
--
-- Requisitos: migraciones 0001-0030 y supabase/seed.sql aplicados.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f tests/cajas.sql
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

-- Alta de una caja (como superusuario) con el numero indicado.
create function t.alta_caja(p_plan text, p_nro int) returns text language sql as $$
  select format(
    'insert into public.caja (tenant_id, nro_caja, fk_establecimientos) values (%s, %s, %s)',
    t.g(p_plan), p_nro, t.g(p_plan || '_estab'))
$$;

-- ─── Fixtures: tres hoteles (basico, pro, business) y una recepcionista ──────
do $$
declare
  v_contrib bigint := (select min(id_tipo_contribuyente) from public.tipo_contribuyente);
  v_regimen bigint := (select min(id_regimen) from public.tipo_regimen);
  c_rec bigint := (select id_cargo from public.cargo where lower(cargo) = 'recepcionista' limit 1);
  v_plan text; v_i int := 0; v_u uuid; v_res jsonb; v_t bigint; v_estab bigint;
  v_rec uuid := gen_random_uuid();
begin
  foreach v_plan in array array['basico', 'pro', 'business'] loop
    v_i := v_i + 1;
    v_u := gen_random_uuid();
    insert into auth.users (id, email) values (v_u, 'caja-' || v_plan || '@c.test');
    v_res := public.fn_provision_tenant(jsonb_build_object(
      'tenant', jsonb_build_object('nombre', 'Hotel caja ' || v_plan, 'slug', 'caja-' || v_plan),
      'admin', jsonb_build_object('auth_id', v_u, 'nombre', 'Admin', 'documento', 'C' || v_i, 'fk_tipo_doc', 1),
      'empresa', jsonb_build_object('ruc', '8300000' || v_i || '-1', 'razon_social', 'Hotel C',
                                    'fk_contribuyente', v_contrib, 'fk_regimen', v_regimen),
      'establecimiento', jsonb_build_object('direccion', 'Calle', 'fk_barrio', 1)));
    v_t := (v_res ->> 'tenant_id')::bigint;
    v_estab := (v_res ->> 'id_establecimiento')::bigint;
    perform public.fn_activar_plan(v_t, v_plan, 'mensual', null, 'test-caja-' || v_plan);
    perform set_config('test.' || v_plan, v_t::text, true);
    perform set_config('test.' || v_plan || '_admin', v_u::text, true);
    perform set_config('test.' || v_plan || '_estab', v_estab::text, true);
  end loop;

  -- Recepcionista del hotel Pro (el alta crea su perfil via handle_new_user).
  insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
  values (v_rec, 'caja-rec@c.test',
          jsonb_build_object('tenant_id', t.g('pro')::bigint, 'fk_cargo', c_rec),
          jsonb_build_object('nombre', 'Recepcion', 'documento', 'C90', 'fk_tipo_doc', 1));
  perform set_config('test.rec', v_rec::text, true);
end $$;

-- ─── Catalogo y estado inicial ───────────────────────────────────────────────
do $$
begin
  perform t.ok(public.fn_limite(t.g('basico')::bigint, 'cajas') = 1
               and public.fn_limite(t.g('pro')::bigint, 'cajas') = 3
               and public.fn_limite(t.g('business')::bigint, 'cajas') is null,
               'fn_limite(cajas): basico 1, pro 3, business ilimitado');
  perform t.ok((select max_cajas from public.planes where codigo = 'trial') = 3,
               'el trial evalua Pro: 3 cajas');
  perform t.ok(t.cuenta(format('select count(*) from public.caja where tenant_id = %s and estado = ''Activo''', t.g('basico'))) = 1,
               'la caja del alta nace Activa');
  perform t.ok((select max_cajas from public.fn_planes_publicos() where codigo = 'pro') = 3,
               'fn_planes_publicos expone max_cajas');
end $$;

-- ─── Topes ───────────────────────────────────────────────────────────────────
do $$
begin
  -- Basico: ya tiene la caja del alta; la segunda se rechaza.
  perform t.falla(t.alta_caja('basico', 2), '23514', 'Basico rechaza la segunda caja');

  -- Desactivar y recrear no esquiva el tope (se cuentan las inactivas).
  update public.caja set estado = 'Inactivo' where tenant_id = t.g('basico')::bigint;
  perform t.falla(t.alta_caja('basico', 2), '23514', 'Basico: desactivar la caja no libera el cupo');

  -- Pro: tope 3, el cuarto se rechaza.
  execute t.alta_caja('pro', 2);
  execute t.alta_caja('pro', 3);
  perform t.ok(t.cuenta(format('select count(*) from public.caja where tenant_id = %s', t.g('pro'))) = 3,
               'Pro admite hasta tres cajas');
  perform t.falla(t.alta_caja('pro', 4), '23514', 'Pro rechaza la cuarta caja');

  -- Business: sin tope.
  insert into public.caja (tenant_id, nro_caja, fk_establecimientos)
  select t.g('business')::bigint, 1 + g, t.g('business_estab')::bigint
  from generate_series(1, 9) g;
  perform t.ok(t.cuenta(format('select count(*) from public.caja where tenant_id = %s', t.g('business'))) = 10,
               'Business no tiene tope de cajas (10 cajas)');
end $$;

-- ─── Admin escribe; recepcion solo lee ───────────────────────────────────────
do $$
declare
  v_caja bigint;
begin
  select id_caja into v_caja from public.caja
  where tenant_id = t.g('business')::bigint order by id_caja limit 1;

  perform t.actuar(t.g('business_admin'), t.g('business')::bigint);
  insert into public.caja (nro_caja, fk_establecimientos)
    values (100, t.g('business_estab')::bigint);
  perform t.ok(true, 'el admin crea una caja');
  perform t.filas(format('update public.caja set descripcion_caja = ''Editada'' where id_caja = %s', v_caja),
                  1, 'el admin edita una caja');
  perform t.volver();

  perform t.actuar(t.g('rec'), t.g('pro')::bigint);
  perform t.ok(t.cuenta('select count(*) from public.caja') = 3, 'la recepcionista lee las cajas de su hotel');
  perform t.volver();

  -- Libera un cupo: el trigger de tope corre antes que RLS, y con el hotel en
  -- el tope el insert fallaria por 23514 y no por permisos.
  -- (la transaccion se revierte al final, asi que el tope vuelve solo).
  update public.planes set max_cajas = 4 where codigo = 'pro';

  perform t.actuar(t.g('rec'), t.g('pro')::bigint);
  perform t.falla(format('insert into public.caja (nro_caja, fk_establecimientos) values (50, %s)', t.g('pro_estab')),
                  '42501', 'la recepcionista no crea cajas');
  perform t.filas('update public.caja set descripcion_caja = ''x''', 0, 'la recepcionista no edita cajas');
  perform t.filas('delete from public.caja', 0, 'la recepcionista no borra cajas');
  perform t.volver();
end $$;

-- ─── Una caja con turno abierto no se desactiva ──────────────────────────────
do $$
declare
  v_caja bigint; v_usuario bigint; v_turno bigint;
begin
  select id_caja into v_caja from public.caja
  where tenant_id = t.g('pro')::bigint order by id_caja limit 1;
  select id_usuario into v_usuario from public.usuario
  where tenant_id = t.g('pro')::bigint order by id_usuario limit 1;

  insert into public.apertura_cierre_caja (tenant_id, monto_inicial, monto_final, fk_usuario, fk_caja)
    values (t.g('pro')::bigint, 0, 0, v_usuario, v_caja) returning id_turno into v_turno;

  perform t.actuar(t.g('pro_admin'), t.g('pro')::bigint);
  perform t.falla(format('update public.caja set estado = ''Inactivo'' where id_caja = %s', v_caja),
                  '23514', 'no se desactiva una caja con turno abierto');
  perform t.volver();

  update public.apertura_cierre_caja set cierre = now() where id_turno = v_turno;

  perform t.actuar(t.g('pro_admin'), t.g('pro')::bigint);
  perform t.filas(format('update public.caja set estado = ''Inactivo'' where id_caja = %s', v_caja),
                  1, 'con el turno cerrado la caja se desactiva');
  perform t.volver();
end $$;

-- ─── Aislamiento entre hoteles ───────────────────────────────────────────────
do $$
begin
  -- Cupo libre en Basico: el tope corre antes que RLS (rollback al final).
  update public.planes set max_cajas = 2 where codigo = 'basico';

  perform t.actuar(t.g('pro_admin'), t.g('pro')::bigint);
  perform t.ok(t.cuenta(format('select count(*) from public.caja where tenant_id <> %s', t.g('pro'))) = 0,
               'el admin de Pro no ve cajas de otros hoteles');
  perform t.filas(format('update public.caja set descripcion_caja = ''x'' where tenant_id = %s', t.g('basico')),
                  0, 'el admin de Pro no edita cajas de Basico');
  perform t.falla(format('insert into public.caja (tenant_id, nro_caja, fk_establecimientos) values (%s, 7, %s)',
                         t.g('basico'), t.g('basico_estab')),
                  '42501', 'el admin de Pro no crea cajas en Basico');
  perform t.volver();
end $$;

select 'TODAS LAS PRUEBAS DE CAJAS PASARON' as resultado;

rollback;
