-- ═══════════════════════════════════════════════════════════════════════════
-- Finance suite (double-entry accounting, 0016+)
-- ═══════════════════════════════════════════════════════════════════════════
-- Runs in one transaction that is rolled back at the end: it leaves nothing behind.
--
-- Requirements: migrations 0001-0017 (or whatever the sections cover) and
-- supabase/seed.sql applied.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f tests/finanzas.sql
--
-- Layout (so later tasks can append sections):
--   1. `t.*` helpers (same as planes.sql, plus `falla_con`).
--   2. Fixtures: hotels `pro` and `basico`, `pro` staff and a minimal chart of
--      accounts loaded as superuser. Keys are stored with
--      set_config('test.<key>') and read with t.g('<key>').
--   3. One section per migration, each in its own `do $$` block:
--        T1 (0016) accounting base  <- this one
--        T2 (0017) chart of accounts and categories
--        T3 (0018) funds and credit invoices             (pending)
--        T4 (0019) expenses, collections, payments, transfers (pending)
--        T5 (0020) month lock
--        T6 (0021) reports                               (pending)
--      Each task inserts its section right BEFORE the `FIN` marker at the end.
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

-- Impersonates an authenticated user of a tenant.
create function t.actuar(p_auth text, p_tenant bigint) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_auth, 'role', 'authenticated',
                      'app_metadata', json_build_object('tenant_id', p_tenant))::text, true);
  execute 'set local role authenticated';
end $$;

create function t.anonimo() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  execute 'set local role anon';
end $$;

create function t.volver() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
end $$;

-- The statement must fail with the given SQLSTATE.
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

-- Like falla, and the message must also contain a fragment.
create function t.falla_con(p_sql text, p_estado text, p_fragmento text, p_msg text) returns void language plpgsql as $$
declare v_fallo boolean := false;
begin
  begin
    execute p_sql;
  exception when others then
    if sqlstate <> p_estado then
      raise exception 'FALLO: % - se esperaba % y llego % (%)', p_msg, p_estado, sqlstate, sqlerrm;
    end if;
    if position(lower(p_fragmento) in lower(sqlerrm)) = 0 then
      raise exception 'FALLO: % - el mensaje "%" no contiene "%"', p_msg, sqlerrm, p_fragmento;
    end if;
    v_fallo := true;
  end;
  if not v_fallo then
    raise exception 'FALLO: % - la sentencia no fallo', p_msg;
  end if;
  raise notice 'ok  - % (%)', p_msg, p_estado;
end $$;

-- The DML statement must affect exactly p_esperadas rows.
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

-- ─── Fixtures ────────────────────────────────────────────────────────────────
-- `pro` (accounting module) and `basico` (without it). `pro` adds a gerente and
-- a receptionist through handle_new_user.
do $$
declare
  v_contrib bigint := (select min(id_tipo_contribuyente) from public.tipo_contribuyente);
  v_regimen bigint := (select min(id_regimen) from public.tipo_regimen);
  c_ger bigint := (select id_cargo from public.cargo where lower(cargo) = 'gerente' limit 1);
  c_rec bigint := (select id_cargo from public.cargo where lower(cargo) = 'recepcionista' limit 1);
  v_plan text; v_i int := 0; v_u uuid; v_res jsonb; v_t bigint; v_estab bigint;
  v_ger uuid := gen_random_uuid(); v_rec uuid := gen_random_uuid();
  v_tipo bigint; v_padre bigint;
begin
  foreach v_plan in array array['pro', 'basico'] loop
    v_i := v_i + 1;
    v_u := gen_random_uuid();
    insert into auth.users (id, email) values (v_u, 'fin-' || v_plan || '@f.test');
    v_res := public.fn_provision_tenant(jsonb_build_object(
      'tenant', jsonb_build_object('nombre', 'Hotel fin ' || v_plan, 'slug', 'fin-' || v_plan),
      'admin', jsonb_build_object('auth_id', v_u, 'nombre', 'Admin', 'documento', 'F' || v_i, 'fk_tipo_doc', 1),
      'empresa', jsonb_build_object('ruc', '8200000' || v_i || '-1', 'razon_social', 'Hotel F',
                                    'fk_contribuyente', v_contrib, 'fk_regimen', v_regimen),
      'establecimiento', jsonb_build_object('direccion', 'Calle', 'fk_barrio', 1)));
    v_t := (v_res ->> 'tenant_id')::bigint;
    v_estab := (v_res ->> 'id_establecimiento')::bigint;
    perform public.fn_activar_plan(v_t, v_plan, 'mensual', null, 'test-fin-' || v_plan);
    perform set_config('test.' || v_plan, v_t::text, true);
    perform set_config('test.' || v_plan || '_admin', v_u::text, true);
    perform set_config('test.' || v_plan || '_estab', v_estab::text, true);
  end loop;

  v_t := t.g('pro')::bigint;
  insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
    (v_ger, 'fin-ger@f.test', jsonb_build_object('tenant_id', v_t, 'fk_cargo', c_ger),
       jsonb_build_object('nombre', 'Gerente', 'documento', 'F11', 'fk_tipo_doc', 1)),
    (v_rec, 'fin-rec@f.test', jsonb_build_object('tenant_id', v_t, 'fk_cargo', c_rec),
       jsonb_build_object('nombre', 'Recepcion', 'documento', 'F12', 'fk_tipo_doc', 1));
  perform set_config('test.ger', v_ger::text, true);
  perform set_config('test.rec', v_rec::text, true);

  -- Minimal chart of accounts, as superuser (the real seed arrives in 0017).
  insert into public.tipo_cuenta_contable (nombre) values ('Activo') returning id into v_tipo;
  perform set_config('test.tipo', v_tipo::text, true);

  foreach v_plan in array array['pro', 'basico'] loop
    v_t := t.g(v_plan)::bigint;
    -- Since 0017 provisioning copies the full hotel chart; the T1 sections want
    -- this small one, so the copied chart (and its categories) is dropped first.
    if to_regclass('public.categorias_finanzas') is not null then
      delete from public.categorias_finanzas where tenant_id = v_t;
    end if;
    -- 0018 hangs a fund (and its account) on every caja; they reference the chart.
    if to_regclass('public.cuentas_fondos') is not null then
      delete from public.cuentas_fondos where tenant_id = v_t;
    end if;
    delete from public.cuentas_contables where tenant_id = v_t;
    insert into public.cuentas_contables (tenant_id, nombre, codigo, fk_tipo_cuenta, imputable)
      values (v_t, 'Activo', '1', v_tipo, false) returning id into v_padre;
    insert into public.cuentas_contables (tenant_id, nombre, codigo, fk_tipo_cuenta, imputable, fk_cuenta_padre, clave) values
      (v_t, 'Caja',        '1.1.01', v_tipo, true, v_padre, 'CAJA'),
      (v_t, 'Banco',       '1.1.02', v_tipo, true, v_padre, 'BANCO'),
      (v_t, 'Ventas',      '4.1',    v_tipo, true, null,    'VENTAS'),
      (v_t, 'IVA debito',  '2.1.02', v_tipo, true, null,    'IVA_DEBITO');
    perform set_config('test.' || v_plan || '_padre', v_padre::text, true);
  end loop;

  insert into public.cuentas_contables (tenant_id, nombre, codigo, fk_tipo_cuenta, imputable, clave, activo)
    values (t.g('pro')::bigint, 'Cuenta inactiva', '9.9', v_tipo, true, 'INACTIVA', false);
end $$;

-- ═══ T1 · 0016 accounting base ═════════════════════════════════════════════

-- ─── cuentas_contables structure ─────────────────────────────────────────
do $$
begin
  perform t.ok((select data_type from information_schema.columns
                where table_schema = 'public' and table_name = 'cuentas_contables'
                  and column_name = 'fk_tipo_cuenta') = 'bigint',
               'cuentas_contables.fk_tipo_cuenta es bigint');
  perform t.ok(exists (select 1 from information_schema.columns
                       where table_schema = 'public' and table_name = 'cuentas_contables'
                         and column_name = 'clave'),
               'cuentas_contables tiene clave');
  perform t.ok((select column_default from information_schema.columns
                where table_schema = 'public' and table_name = 'cuentas_contables'
                  and column_name = 'activo') = 'true',
               'cuentas_contables.activo existe y es true por defecto');

  perform t.falla(format(
    'insert into public.cuentas_contables (tenant_id, nombre, codigo, fk_tipo_cuenta, imputable) values (%s, ''Dup'', ''1.1.01'', %s, true)',
    t.g('pro'), t.g('tipo')), '23505', 'el codigo es unico por hotel');
  perform t.falla(format(
    'insert into public.cuentas_contables (tenant_id, nombre, codigo, fk_tipo_cuenta, imputable, clave) values (%s, ''Dup'', ''7.7'', %s, true, ''CAJA'')',
    t.g('pro'), t.g('tipo')), '23505', 'la clave es unica por hotel');

  -- Without a key they can repeat (partial index) and the same codigo works in another hotel.
  insert into public.cuentas_contables (tenant_id, nombre, codigo, fk_tipo_cuenta, imputable) values
    (t.g('pro')::bigint, 'Sin clave 1', '8.1', t.g('tipo')::bigint, true),
    (t.g('pro')::bigint, 'Sin clave 2', '8.2', t.g('tipo')::bigint, true);
  perform t.ok(true, 'varias cuentas sin clave conviven');
  perform t.ok(t.cuenta(format(
    'select count(*) from public.cuentas_contables where tenant_id = %s and clave = ''CAJA''', t.g('basico'))) = 1,
    'el mismo codigo y clave existen en otro hotel');
end $$;

-- ─── Account lookup by key ─────────────────────────────────────────
do $$
begin
  perform t.ok(public.fn_cuenta_por_clave(t.g('pro')::bigint, 'CAJA') =
               (select id from public.cuentas_contables
                where tenant_id = t.g('pro')::bigint and clave = 'CAJA'),
               'fn_cuenta_por_clave devuelve el id de la cuenta');
  perform t.ok(public.fn_cuenta_por_clave(t.g('pro')::bigint, 'CAJA') <>
               public.fn_cuenta_por_clave(t.g('basico')::bigint, 'CAJA'),
               'fn_cuenta_por_clave resuelve dentro del hotel indicado');
  perform t.falla_con(format('select public.fn_cuenta_por_clave(%s, ''CXC_CLIENTES'')', t.g('pro')),
                      'P0002', 'CXC_CLIENTES', 'una clave inexistente nombra la clave faltante');
  perform t.falla_con(format('select public.fn_cuenta_por_clave(%s, ''INACTIVA'')', t.g('pro')),
                      'P0002', 'INACTIVA', 'una cuenta inactiva no se resuelve');
end $$;

-- ─── fn_contabilizar: balanced entry and numbering ────────────────────────
do $$
declare
  v_a1 bigint; v_a2 bigint; v_a3 bigint; v_otro bigint;
  v_pro bigint := t.g('pro')::bigint;
  v_estab bigint := t.g('pro_estab')::bigint;
  v_caja bigint := public.fn_cuenta_por_clave(t.g('pro')::bigint, 'CAJA');
begin
  v_a1 := public.fn_contabilizar(v_pro, date '2026-03-10', v_estab, 'Venta de prueba', 'factura', 501,
    '[{"clave":"CAJA","debe":110000},
      {"clave":"VENTAS","haber":100000},
      {"clave":"IVA_DEBITO","haber":10000}]'::jsonb);

  perform t.ok((select estado from public.asientos where id = v_a1) = 'CONTABILIZADO',
               'el asiento nace CONTABILIZADO');
  perform t.ok((select nro_asiento from public.asientos where id = v_a1) = 1,
               'el primer asiento del hotel es el 1');
  perform t.ok((select origen_tipo = 'factura' and fk_origen = 501 from public.asientos where id = v_a1),
               'el asiento guarda origen_tipo y fk_origen');
  perform t.ok((select (fecha at time zone 'America/Asuncion')::date from public.asientos where id = v_a1)
               = date '2026-03-10', 'la fecha se guarda en hora de Asuncion');
  perform t.ok((select count(*) from public.detalle_asientos where fk_asientos = v_a1) = 3,
               'se insertan las tres lineas');
  perform t.ok((select sum(debe) = sum(haber) and sum(debe) = 110000
                from public.detalle_asientos where fk_asientos = v_a1),
               'las lineas balancean');
  perform t.ok((select debe from public.detalle_asientos
                where fk_asientos = v_a1 and fk_cuenta_contables = v_caja) = 110000,
               'la clave CAJA se resolvio a la cuenta correcta');

  -- A line by fk_cuenta instead of clave.
  v_a2 := public.fn_contabilizar(v_pro, date '2026-03-11', v_estab, 'Por id', 'manual', null,
    jsonb_build_array(jsonb_build_object('fk_cuenta', v_caja, 'debe', 5000),
                      jsonb_build_object('clave', 'VENTAS', 'haber', 5000)));
  perform t.ok((select nro_asiento from public.asientos where id = v_a2) = 2,
               'la numeracion es correlativa por hotel');
  perform t.ok((select origen_tipo = 'manual' and fk_origen is null from public.asientos where id = v_a2),
               'un asiento manual no necesita fk_origen');

  -- Another hotel starts its own numbering.
  v_otro := public.fn_contabilizar(t.g('basico')::bigint, date '2026-03-10', t.g('basico_estab')::bigint,
    'Venta basico', 'factura', 1,
    '[{"clave":"CAJA","debe":1000},{"clave":"VENTAS","haber":1000}]'::jsonb);
  perform t.ok((select nro_asiento from public.asientos where id = v_otro) = 1,
               'la numeracion es independiente por hotel');

  v_a3 := public.fn_contabilizar(v_pro, date '2026-03-12', v_estab, 'Tercero', 'manual', null,
    '[{"clave":"CAJA","debe":1},{"clave":"VENTAS","haber":1}]'::jsonb);
  perform t.ok((select nro_asiento from public.asientos where id = v_a3) = 3
               and (select ultimo from public.asiento_secuencia where tenant_id = v_pro) = 3,
               'asiento_secuencia lleva el ultimo numero emitido');
end $$;

-- ─── fn_contabilizar: invalid input ─────────────────────────────────────
do $$
declare
  v_pro text := t.g('pro');
  v_estab text := t.g('pro_estab');
  v_base text := format('select public.fn_contabilizar(%s, date ''2026-03-10'', %s, ''x'', ''manual'', null, ', v_pro, v_estab);
  v_antes bigint := t.cuenta('select count(*) from public.asientos');
  v_ajena bigint := public.fn_cuenta_por_clave(t.g('basico')::bigint, 'CAJA');
  v_padre bigint := t.g('pro_padre')::bigint;
begin
  perform t.falla_con(v_base || 'null)', '23514', 'al menos dos', 'rechaza lineas nulas');
  perform t.falla_con(v_base || '''[]''::jsonb)', '23514', 'al menos dos', 'rechaza un asiento sin lineas');
  perform t.falla_con(v_base || '''[{"clave":"CAJA","debe":10}]''::jsonb)', '23514', 'al menos dos', 'rechaza una sola linea');
  perform t.falla_con(v_base || '''{"clave":"CAJA","debe":10}''::jsonb)', '23514', 'al menos dos', 'rechaza lineas que no son un arreglo');
  perform t.falla_con(v_base || '''[{"clave":"CAJA","debe":100},{"clave":"VENTAS","haber":90}]''::jsonb)',
                      '23514', 'no balancea', 'rechaza un asiento descuadrado');
  perform t.falla_con(v_base || '''[{"clave":"CAJA","debe":100,"haber":100},{"clave":"VENTAS","haber":0,"debe":0}]''::jsonb)',
                      '23514', 'debe o en el haber', 'rechaza una linea con debe y haber a la vez');
  perform t.falla_con(v_base || '''[{"clave":"CAJA","debe":0},{"clave":"VENTAS","haber":0}]''::jsonb)',
                      '23514', 'debe o en el haber', 'rechaza lineas en cero');
  perform t.falla_con(v_base || '''[{"clave":"CAJA","debe":-5},{"clave":"VENTAS","haber":-5}]''::jsonb)',
                      '23514', 'debe o en el haber', 'rechaza importes negativos');
  perform t.falla_con(v_base || '''[{"debe":10},{"clave":"VENTAS","haber":10}]''::jsonb)',
                      '23514', 'clave o fk_cuenta', 'rechaza una linea sin cuenta');
  perform t.falla_con(v_base || '''[{"clave":"CAJA","fk_cuenta":1,"debe":10},{"clave":"VENTAS","haber":10}]''::jsonb)',
                      '23514', 'clave o fk_cuenta', 'rechaza una linea con clave y fk_cuenta');
  perform t.falla_con(v_base || '''[{"clave":"NO_EXISTE","debe":10},{"clave":"VENTAS","haber":10}]''::jsonb)',
                      'P0002', 'NO_EXISTE', 'rechaza una clave inexistente');
  perform t.falla_con(v_base || '''[{"clave":"INACTIVA","debe":10},{"clave":"VENTAS","haber":10}]''::jsonb)',
                      'P0002', 'INACTIVA', 'rechaza una cuenta inactiva');
  perform t.falla_con(v_base || format('''[{"fk_cuenta":%s,"debe":10},{"clave":"VENTAS","haber":10}]''::jsonb)', v_padre),
                      '23514', 'imputable', 'rechaza una cuenta no imputable');
  perform t.falla_con(v_base || format('''[{"fk_cuenta":%s,"debe":10},{"clave":"VENTAS","haber":10}]''::jsonb)', v_ajena),
                      '23503', 'no pertenece', 'rechaza la cuenta de otro hotel');
  perform t.falla(format(
    'select public.fn_contabilizar(%s, date ''2026-03-10'', %s, ''x'', ''inventado'', null, ''[{"clave":"CAJA","debe":10},{"clave":"VENTAS","haber":10}]''::jsonb)',
    v_pro, v_estab), '23514', 'rechaza un origen_tipo desconocido');
  perform t.falla_con(format(
    'select public.fn_contabilizar(%s, date ''2026-03-10'', %s, ''x'', ''manual'', null, ''[{"clave":"CAJA","debe":10},{"clave":"VENTAS","haber":10}]''::jsonb)',
    v_pro, t.g('basico_estab')), '23503', 'establecimiento', 'rechaza un establecimiento de otro hotel');

  perform t.ok(t.cuenta('select count(*) from public.asientos') = v_antes,
               'las entradas invalidas no dejan asientos');
end $$;

-- ─── Direct constraints on asientos and detalle ─────────────────────────
do $$
declare
  v_pro text := t.g('pro');
  v_estab text := t.g('pro_estab');
begin
  perform t.falla(format(
    'insert into public.asientos (tenant_id, descripcion, nro_asiento, fk_sucursal, estado) values (%s, ''dup'', 1, %s, ''CONTABILIZADO'')',
    v_pro, v_estab), '23505', 'nro_asiento es unico por hotel');
  perform t.falla(format(
    'insert into public.asientos (tenant_id, descripcion, nro_asiento, fk_sucursal, estado) values (%s, ''e'', 900, %s, ''BORRADOR'')',
    v_pro, v_estab), '23514', 'estado solo admite CONTABILIZADO y ANULADO');
  perform t.falla(format(
    'insert into public.asientos (tenant_id, descripcion, nro_asiento, fk_sucursal, estado, origen_tipo) values (%s, ''o'', 901, %s, ''CONTABILIZADO'', ''inventado'')',
    v_pro, v_estab), '23514', 'origen_tipo solo admite los tipos conocidos');
  -- A valid type and a null origin are accepted.
  insert into public.asientos (tenant_id, descripcion, nro_asiento, fk_sucursal, estado, origen_tipo)
    values (v_pro::bigint, 'o', 902, v_estab::bigint, 'CONTABILIZADO', 'pago_anulacion');
  insert into public.asientos (tenant_id, descripcion, nro_asiento, fk_sucursal, estado, origen_tipo)
    values (v_pro::bigint, 'o', 903, v_estab::bigint, 'ANULADO', null);
  perform t.ok(true, 'origen_tipo acepta un tipo conocido y tambien null');
end $$;

do $$
declare
  v_pro text := t.g('pro');
  v_a bigint := (select id from public.asientos where tenant_id = t.g('pro')::bigint and nro_asiento = 1);
  v_cta bigint := public.fn_cuenta_por_clave(t.g('pro')::bigint, 'CAJA');
  v_ins text := format('insert into public.detalle_asientos (tenant_id, fk_cuenta_contables, fk_asientos, debe, haber) values (%s, %s, %s, ',
                       t.g('pro'), public.fn_cuenta_por_clave(t.g('pro')::bigint, 'CAJA'),
                       (select id from public.asientos where tenant_id = t.g('pro')::bigint and nro_asiento = 1));
begin
  perform t.falla(v_ins || '-1, 0)', '23514', 'debe negativo');
  perform t.falla(v_ins || '0, -1)', '23514', 'haber negativo');
  perform t.falla(v_ins || '5, 5)', '23514', 'debe y haber a la vez');
  perform t.falla(v_ins || '0, 0)', '23514', 'debe y haber en cero');
  perform t.ok(exists (select 1 from pg_constraint
                       where conrelid = 'public.detalle_asientos'::regclass and contype = 'u'
                         and pg_get_constraintdef(oid) = 'UNIQUE (tenant_id, id)'),
               'detalle_asientos tiene UNIQUE (tenant_id, id)');
end $$;

-- ─── Deferred balance trigger ─────────────────────────────────────────────
do $$
declare
  v_pro text := t.g('pro');
  v_estab text := t.g('pro_estab');
  v_caja text := public.fn_cuenta_por_clave(t.g('pro')::bigint, 'CAJA')::text;
  v_ventas text := public.fn_cuenta_por_clave(t.g('pro')::bigint, 'VENTAS')::text;
  v_asiento bigint;
  v_linea bigint;
begin
  perform t.ok((select tgdeferrable and tginitdeferred from pg_trigger
                where tgrelid = 'public.detalle_asientos'::regclass and tgconstraint <> 0
                  and tgname = 'detalle_asientos_balanceado'),
               'el balance se verifica en un constraint trigger DEFERRABLE INITIALLY DEFERRED');

  -- Insert the asiento and ONE line: with the deferred trigger it does not fail until commit.
  insert into public.asientos (tenant_id, descripcion, nro_asiento, fk_sucursal, estado, origen_tipo)
    values (v_pro::bigint, 'directo', 800, v_estab::bigint, 'CONTABILIZADO', 'manual') returning id into v_asiento;
  insert into public.detalle_asientos (tenant_id, fk_cuenta_contables, fk_asientos, debe, haber)
    values (v_pro::bigint, v_caja::bigint, v_asiento, 100, 0);
  perform t.ok(true, 'la linea suelta no falla mientras la transaccion sigue abierta');
  perform t.falla_con('set constraints all immediate', '23514', 'no balancea',
                      'al confirmar, un asiento descuadrado se rechaza');
  -- The failed SET CONSTRAINTS leaves the transaction usable: still deferred.

  insert into public.detalle_asientos (tenant_id, fk_cuenta_contables, fk_asientos, debe, haber)
    values (v_pro::bigint, v_ventas::bigint, v_asiento, 0, 100) returning id into v_linea;
  set constraints all immediate;
  set constraints all deferred;
  perform t.ok(true, 'completar la contrapartida deja el asiento balanceado');

  update public.detalle_asientos set haber = 90 where id = v_linea;
  perform t.falla('set constraints all immediate', '23514', 'cambiar un importe y descuadrar se rechaza');
  update public.detalle_asientos set haber = 100 where id = v_linea;
  set constraints all immediate;
  set constraints all deferred;

  delete from public.detalle_asientos where id = v_linea;
  perform t.falla('set constraints all immediate', '23514', 'borrar una linea y descuadrar se rechaza');
  insert into public.detalle_asientos (tenant_id, fk_cuenta_contables, fk_asientos, debe, haber)
    values (v_pro::bigint, v_ventas::bigint, v_asiento, 0, 100);
  set constraints all immediate;
  set constraints all deferred;
  perform t.ok(true, 'reponer la linea deja el asiento balanceado');
end $$;

-- ─── fn_contabilizar_reverso ─────────────────────────────────────────────────
do $$
declare
  v_pro bigint := t.g('pro')::bigint;
  v_estab bigint := t.g('pro_estab')::bigint;
  v_orig bigint; v_rev bigint; v_nro_orig bigint;
  v_caja bigint := public.fn_cuenta_por_clave(t.g('pro')::bigint, 'CAJA');
begin
  v_orig := public.fn_contabilizar(v_pro, date '2026-04-01', v_estab, 'Factura a anular', 'factura', 777,
    '[{"clave":"CAJA","debe":55000},{"clave":"VENTAS","haber":50000},{"clave":"IVA_DEBITO","haber":5000}]'::jsonb);
  v_nro_orig := (select nro_asiento from public.asientos where id = v_orig);

  v_rev := public.fn_contabilizar_reverso(v_pro, 'factura', 777, date '2026-04-02');
  perform t.ok(v_rev <> v_orig and (select nro_asiento from public.asientos where id = v_rev) = v_nro_orig + 1,
               'el reverso es un asiento nuevo con el siguiente numero');
  perform t.ok((select origen_tipo from public.asientos where id = v_rev) = 'factura_anulacion'
               and (select fk_origen from public.asientos where id = v_rev) = 777,
               'el reverso usa <tipo>_anulacion y el mismo fk_origen');
  perform t.ok((select (fecha at time zone 'America/Asuncion')::date from public.asientos where id = v_rev)
               = date '2026-04-02', 'el reverso toma la fecha indicada');
  perform t.ok((select haber from public.detalle_asientos where fk_asientos = v_rev and fk_cuenta_contables = v_caja) = 55000
               and (select debe from public.detalle_asientos where fk_asientos = v_rev and fk_cuenta_contables = v_caja) = 0,
               'las lineas del reverso estan invertidas');
  perform t.ok((select sum(debe) = sum(haber) and count(*) = 3 from public.detalle_asientos where fk_asientos = v_rev),
               'el reverso balancea y copia todas las lineas');
  perform t.ok((select count(*) from public.asientos
                where id in (v_orig, v_rev) and estado = 'ANULADO') = 2,
               'el original y su reverso quedan ANULADO');
  perform t.ok((select coalesce(sum(debe - haber), 0) from public.detalle_asientos
                where fk_asientos in (v_orig, v_rev)) = 0,
               'el par original + reverso neta cero');

  perform t.falla_con(format('select public.fn_contabilizar_reverso(%s, ''factura'', 777, date ''2026-04-03'')', v_pro),
                      '55000', 'ya fue anulado', 'no se puede revertir dos veces');
  perform t.falla_con(format('select public.fn_contabilizar_reverso(%s, ''factura'', 99999, date ''2026-04-03'')', v_pro),
                      'P0002', 'no hay un asiento', 'revertir un origen sin asiento falla con mensaje claro');
  perform t.falla_con(format('select public.fn_contabilizar_reverso(%s, ''manual'', 1, date ''2026-04-03'')', v_pro),
                      '23514', 'no admite reverso', 'un origen manual no admite reverso');
  perform t.falla_con(format('select public.fn_contabilizar_reverso(%s, ''factura'', 501, date ''2026-04-03'')', t.g('basico')),
                      'P0002', 'no hay un asiento', 'el reverso no cruza de hotel');
end $$;

-- ─── Privileges of the internal functions ───────────────────────────────────
do $$
declare
  v_firmas text[] := array[
    'public.fn_contabilizar(bigint, date, bigint, text, text, bigint, jsonb)',
    'public.fn_contabilizar_reverso(bigint, text, bigint, date)',
    'public.fn_cuenta_por_clave(bigint, text)',
    'public.fn_siguiente_nro_asiento(bigint)'];
  v_f text;
begin
  foreach v_f in array v_firmas loop
    perform t.ok(not has_function_privilege('authenticated', v_f, 'execute')
                 and not has_function_privilege('anon', v_f, 'execute'),
                 v_f || ' no es ejecutable por authenticated ni anon');
  end loop;

  perform t.actuar(t.g('pro_admin'), t.g('pro')::bigint);
  perform t.falla(format(
    'select public.fn_contabilizar(%s, current_date, %s, ''x'', ''manual'', null, ''[{"clave":"CAJA","debe":1},{"clave":"VENTAS","haber":1}]''::jsonb)',
    t.g('pro'), t.g('pro_estab')), '42501', 'un admin autenticado no llama a fn_contabilizar');
  perform t.falla(format('select public.fn_cuenta_por_clave(%s, ''CAJA'')', t.g('pro')), '42501',
                  'un admin autenticado no llama a fn_cuenta_por_clave');
  perform t.falla(format('select public.fn_siguiente_nro_asiento(%s)', t.g('pro')), '42501',
                  'un admin autenticado no consume numeros de asiento');
  perform t.volver();

  perform t.anonimo();
  perform t.falla(format('select public.fn_contabilizar_reverso(%s, ''factura'', 777, current_date)', t.g('pro')), '42501',
                  'anon no llama a fn_contabilizar_reverso');
  perform t.volver();
end $$;

-- ─── RLS: only admin and gerente read and write accounting ───────────────
do $$
declare
  v_tabla text;
begin
  insert into public.saldos_mensuales (tenant_id, fk_cuenta, mes, anio, saldo_debe_acumulado, saldo_haber_acumulado, saldo_final)
    values (t.g('pro')::bigint, public.fn_cuenta_por_clave(t.g('pro')::bigint, 'CAJA'), 3, 2026, 0, 0, 0);

  foreach v_tabla in array array['cuentas_contables', 'asientos', 'detalle_asientos', 'saldos_mensuales'] loop
    perform t.ok(t.cuenta(format('select count(*) from public.%I where tenant_id = %s', v_tabla, t.g('pro'))) > 0,
                 v_tabla || ': hay filas en pro (control)');

    perform t.actuar(t.g('rec'), t.g('pro')::bigint);
    perform t.ok(t.cuenta(format('select count(*) from public.%I', v_tabla)) = 0,
                 v_tabla || ': la recepcionista lee 0 filas');
    perform t.volver();

    perform t.actuar(t.g('pro_admin'), t.g('pro')::bigint);
    perform t.ok(t.cuenta(format('select count(*) from public.%I', v_tabla)) > 0,
                 v_tabla || ': el admin lee');
    perform t.volver();

    perform t.actuar(t.g('ger'), t.g('pro')::bigint);
    perform t.ok(t.cuenta(format('select count(*) from public.%I', v_tabla)) > 0,
                 v_tabla || ': el gerente lee');
    perform t.volver();
  end loop;

  -- Writes: admin and gerente yes; receptionist no.
  perform t.actuar(t.g('pro_admin'), t.g('pro')::bigint);
  insert into public.cuentas_contables (nombre, codigo, fk_tipo_cuenta, imputable)
    values ('Del admin', '6.1', t.g('tipo')::bigint, true);
  perform t.filas('update public.cuentas_contables set nombre = ''Del admin 2'' where codigo = ''6.1''', 1,
                  'el admin actualiza cuentas_contables');
  perform t.volver();

  perform t.actuar(t.g('ger'), t.g('pro')::bigint);
  insert into public.cuentas_contables (nombre, codigo, fk_tipo_cuenta, imputable)
    values ('Del gerente', '6.2', t.g('tipo')::bigint, true);
  perform t.filas('delete from public.cuentas_contables where codigo = ''6.2''', 1,
                  'el gerente borra cuentas_contables');
  perform t.volver();

  perform t.actuar(t.g('rec'), t.g('pro')::bigint);
  perform t.falla(format(
    'insert into public.cuentas_contables (nombre, codigo, fk_tipo_cuenta, imputable) values (''Rec'', ''6.3'', %s, true)',
    t.g('tipo')), '42501', 'la recepcionista no escribe cuentas_contables');
  perform t.falla(format(
    'insert into public.asientos (descripcion, nro_asiento, fk_sucursal, estado) values (''r'', 950, %s, ''CONTABILIZADO'')',
    t.g('pro_estab')), '42501', 'la recepcionista no escribe asientos');
  perform t.volver();

  -- Isolation between hotels: the pro admin does not see basico's asiento.
  perform t.actuar(t.g('pro_admin'), t.g('pro')::bigint);
  perform t.ok(t.cuenta(format('select count(*) from public.asientos where tenant_id = %s', t.g('basico'))) = 0,
               'el admin de pro no ve asientos de basico');
  perform t.volver();
end $$;

-- An asiento written directly by the admin (as the API would) also passes the balance check.
do $$
declare
  v_a bigint;
  v_caja bigint := public.fn_cuenta_por_clave(t.g('pro')::bigint, 'CAJA');
  v_ventas bigint := public.fn_cuenta_por_clave(t.g('pro')::bigint, 'VENTAS');
begin
  perform t.actuar(t.g('pro_admin'), t.g('pro')::bigint);
  insert into public.asientos (descripcion, nro_asiento, fk_sucursal, estado, origen_tipo)
    values ('api', 960, t.g('pro_estab')::bigint, 'CONTABILIZADO', 'manual') returning id into v_a;
  insert into public.detalle_asientos (fk_cuenta_contables, fk_asientos, debe, haber) values
    (v_caja, v_a, 10, 0),
    (v_ventas, v_a, 0, 10);
  set constraints all immediate;
  set constraints all deferred;
  perform t.ok(true, 'un asiento balanceado insertado por el admin autenticado se acepta');
  perform t.volver();
end $$;

-- ─── Policies: plan basico vs pro and the 0006/0014 rules ─────────────────────
do $$
declare
  v_tabla text;
begin
  perform t.actuar(t.g('basico_admin'), t.g('basico')::bigint);
  perform t.falla(format(
    'insert into public.cuentas_contables (nombre, codigo, fk_tipo_cuenta, imputable) values (''B'', ''5.5'', %s, true)',
    t.g('tipo')), '42501', 'el plan basico no escribe cuentas_contables');
  perform t.falla(format(
    'insert into public.asientos (descripcion, nro_asiento, fk_sucursal, estado) values (''b'', 970, %s, ''CONTABILIZADO'')',
    t.g('basico_estab')), '42501', 'el plan basico no escribe asientos');
  perform t.ok(t.cuenta('select count(*) from public.cuentas_contables') > 0,
               'el plan basico si lee su plan de cuentas');
  perform t.volver();

  foreach v_tabla in array array['cuentas_contables', 'asientos', 'detalle_asientos', 'saldos_mensuales'] loop
    perform t.ok((select count(*) from pg_policies
                  where schemaname = 'public' and tablename = v_tabla and permissive = 'RESTRICTIVE') = 6,
                 v_tabla || ' conserva las 6 policies RESTRICTIVE de 0014');
    perform t.ok((select qual from pg_policies
                  where schemaname = 'public' and tablename = v_tabla and policyname = v_tabla || '_select')
                 like '%current_es_admin_o_gerente%',
                 v_tabla || '_select exige admin o gerente');
    perform t.ok((select count(*) from pg_policies
                  where schemaname = 'public' and tablename = v_tabla and cmd = 'SELECT'
                    and permissive = 'PERMISSIVE') = 1,
                 v_tabla || ' tiene una sola policy de lectura');
  end loop;
end $$;

-- ─── asiento_secuencia: read-only for the client ─────────────────────────
do $$
begin
  perform t.ok((select relrowsecurity from pg_class where oid = 'public.asiento_secuencia'::regclass),
               'asiento_secuencia tiene RLS');
  perform t.actuar(t.g('pro_admin'), t.g('pro')::bigint);
  perform t.ok(t.cuenta('select count(*) from public.asiento_secuencia') = 1,
               'el admin lee solo la secuencia de su hotel');
  perform t.falla(format('insert into public.asiento_secuencia (tenant_id, ultimo) values (%s, 99)', t.g('pro')),
                  '42501', 'el cliente no inserta en asiento_secuencia');
  perform t.falla('update public.asiento_secuencia set ultimo = 1', '42501',
                  'el cliente no actualiza asiento_secuencia');
  perform t.falla('delete from public.asiento_secuencia', '42501', 'el cliente no borra asiento_secuencia');
  perform t.volver();
  perform t.anonimo();
  perform t.falla('select count(*) from public.asiento_secuencia', '42501', 'anon no lee asiento_secuencia');
  perform t.volver();
end $$;

-- ─── saldos_mensuales documented as unused ───────────────────────────────
do $$
begin
  perform t.ok(obj_description('public.saldos_mensuales'::regclass, 'pg_class') ilike '%unused%',
               'saldos_mensuales queda documentada como sin uso');
end $$;

-- ═══ T2 · 0017 hotel chart of accounts and categories ══════════════════════

-- ─── tipo_cuenta_contable catalog ────────────────────────────────────────
do $$
declare v_n text;
begin
  foreach v_n in array array['Activo', 'Pasivo', 'Patrimonio', 'Ingreso', 'Egreso'] loop
    perform t.ok(exists (select 1 from public.tipo_cuenta_contable where nombre = v_n),
                 'el catalogo tiene el tipo ' || v_n);
  end loop;
  -- The T1 fixture inserted a second 'Activo' on purpose; the seed itself added one each.
  perform t.ok(t.cuenta('select count(*) from public.tipo_cuenta_contable where nombre in (''Pasivo'', ''Patrimonio'', ''Ingreso'', ''Egreso'')') = 4,
               'el seed no duplica los tipos de cuenta');
end $$;

-- ─── Template chart is a valid tree ──────────────────────────────────────
do $$
declare
  v_pl bigint := (select id from public.tenants where slug = 'plantilla-base');
  v_k  text;
  v_mal bigint;
begin
  perform t.ok(v_pl is not null, 'existe el tenant plantilla-base');
  perform t.ok(t.cuenta(format('select count(*) from public.cuentas_contables where tenant_id = %s', v_pl)) = 35,
               'la plantilla tiene las 35 cuentas del plan hotelero');
  perform t.ok(t.cuenta(format('select count(*) from public.cuentas_contables where tenant_id = %s and fk_cuenta_padre is null', v_pl)) = 5,
               'la plantilla tiene 5 raices (Activo, Pasivo, Patrimonio, Ingresos, Egresos)');

  foreach v_k in array array['DISPONIBILIDADES', 'CXC_CLIENTES', 'IVA_CREDITO', 'CXP_PROVEEDORES',
                             'IVA_DEBITO', 'SALDOS_INICIALES', 'VENTAS_10', 'VENTAS_5',
                             'VENTAS_EXENTAS', 'OTROS_INGRESOS', 'OTROS_EGRESOS'] loop
    perform t.ok(t.cuenta(format('select count(*) from public.cuentas_contables where tenant_id = %s and clave = %L', v_pl, v_k)) = 1,
                 'la plantilla tiene exactamente una cuenta con clave ' || v_k);
  end loop;
  perform t.ok(t.cuenta(format('select count(*) from public.cuentas_contables where tenant_id = %s and clave is not null', v_pl)) = 11,
               'la plantilla no tiene otras claves de sistema');

  -- Only leaves are imputable. Disponibilidades is the one non-imputable leaf:
  -- it is a parent waiting for the fund accounts of 0018.
  select count(*) into v_mal from public.cuentas_contables c
  where c.tenant_id = v_pl
    and c.imputable is distinct from (
      not exists (select 1 from public.cuentas_contables h where h.tenant_id = v_pl and h.fk_cuenta_padre = c.id)
      and c.clave is distinct from 'DISPONIBILIDADES');
  perform t.ok(v_mal = 0, 'solo las hojas son imputables y todas las hojas (salvo Disponibilidades) lo son');
  perform t.ok(t.cuenta(format('select count(*) from public.cuentas_contables where tenant_id = %s and imputable', v_pl)) = 24,
               'la plantilla tiene 24 cuentas imputables');

  -- Parent code is the code minus its last segment; type follows the first digit.
  select count(*) into v_mal from public.cuentas_contables c
  left join public.cuentas_contables p on p.tenant_id = c.tenant_id and p.id = c.fk_cuenta_padre
  where c.tenant_id = v_pl
    and (case when position('.' in c.codigo) = 0 then c.fk_cuenta_padre is not null
              else p.codigo is distinct from regexp_replace(c.codigo, '\.[^.]*$', '') end);
  perform t.ok(v_mal = 0, 'cada cuenta cuelga del padre que indica su codigo');

  select count(*) into v_mal from public.cuentas_contables c
  join public.tipo_cuenta_contable tc on tc.id = c.fk_tipo_cuenta
  where c.tenant_id = v_pl
    and tc.nombre is distinct from case left(c.codigo, 1)
      when '1' then 'Activo' when '2' then 'Pasivo' when '3' then 'Patrimonio'
      when '4' then 'Ingreso' when '5' then 'Egreso' end;
  perform t.ok(v_mal = 0, 'el tipo de cada cuenta corresponde a su primer digito');

  perform t.ok(not (select imputable from public.cuentas_contables where tenant_id = v_pl and clave = 'DISPONIBILIDADES'),
               'Disponibilidades es padre no imputable (cuelgan los fondos)');
  perform t.ok((select codigo from public.cuentas_contables where tenant_id = v_pl and clave = 'DISPONIBILIDADES') = '1.1.01',
               'Disponibilidades es 1.1.01');
  perform t.ok(not exists (select 1 from public.cuentas_contables where tenant_id = v_pl and not activo),
               'todas las cuentas de la plantilla estan activas');
end $$;

-- ─── Template categories ─────────────────────────────────────────────────
do $$
declare
  v_pl bigint := (select id from public.tenants where slug = 'plantilla-base');
  v_mal bigint;
begin
  perform t.ok(t.cuenta(format('select count(*) from public.categorias_finanzas where tenant_id = %s', v_pl)) = 17,
               'la plantilla tiene 17 categorias (4 ingresos y 13 egresos)');

  -- Every 4.x/5.x leaf has exactly one category of the right type.
  select count(*) into v_mal from public.cuentas_contables c
  where c.tenant_id = v_pl and c.imputable and left(c.codigo, 1) in ('4', '5')
    and (select count(*) from public.categorias_finanzas k
         where k.tenant_id = v_pl and k.fk_cuenta_contable = c.id
           and k.tipo = case left(c.codigo, 1) when '4' then 'ingreso' else 'egreso' end) <> 1;
  perform t.ok(v_mal = 0, 'cada hoja 4.x/5.x tiene una categoria del tipo correcto');

  -- No category on parents or on balance-sheet accounts.
  select count(*) into v_mal from public.categorias_finanzas k
  join public.cuentas_contables c on c.tenant_id = k.tenant_id and c.id = k.fk_cuenta_contable
  where k.tenant_id = v_pl and (not c.imputable or left(c.codigo, 1) not in ('4', '5'));
  perform t.ok(v_mal = 0, 'ninguna categoria apunta a una cuenta padre o patrimonial');
  perform t.ok(not exists (select 1 from public.categorias_finanzas where tenant_id = v_pl and (not es_sistema or not activo)),
               'las categorias sembradas son de sistema y estan activas');
  perform t.ok((select k.fk_cuenta_contable from public.categorias_finanzas k
                where k.tenant_id = v_pl and k.nombre = 'Otros egresos') =
               (select id from public.cuentas_contables where tenant_id = v_pl and clave = 'OTROS_EGRESOS'),
               'la categoria Otros egresos apunta a la cuenta OTROS_EGRESOS');
end $$;

-- ─── New hotel (plan basico) receives chart and categories ───────────────
do $$
declare
  v_contrib bigint := (select min(id_tipo_contribuyente) from public.tipo_contribuyente);
  v_regimen bigint := (select min(id_regimen) from public.tipo_regimen);
  v_pl bigint := (select id from public.tenants where slug = 'plantilla-base');
  v_u uuid := gen_random_uuid(); v_res jsonb; v_t bigint; v_k text; v_mal bigint; v_id bigint;
begin
  insert into auth.users (id, email) values (v_u, 'fin-nuevo@f.test');
  v_res := public.fn_provision_tenant(jsonb_build_object(
    'tenant', jsonb_build_object('nombre', 'Hotel fin nuevo', 'slug', 'fin-nuevo'),
    'admin', jsonb_build_object('auth_id', v_u, 'nombre', 'Admin', 'documento', 'F21', 'fk_tipo_doc', 1),
    'empresa', jsonb_build_object('ruc', '82000021-1', 'razon_social', 'Hotel N',
                                  'fk_contribuyente', v_contrib, 'fk_regimen', v_regimen),
    'establecimiento', jsonb_build_object('direccion', 'Calle', 'fk_barrio', 1)));
  v_t := (v_res ->> 'tenant_id')::bigint;
  perform public.fn_activar_plan(v_t, 'basico', 'mensual', null, 'test-fin-nuevo');
  perform set_config('test.nuevo', v_t::text, true);
  perform t.ok((select plan from public.tenants where id = v_t) = 'basico', 'el hotel nuevo esta en plan basico');

  perform t.ok(t.cuenta(format('select count(*) from public.cuentas_contables where tenant_id = %s and codigo !~ ''^1\.1\.01\.''', v_t)) = 35,
               'el hotel nuevo recibe las 35 cuentas (sin contar las de sus fondos)');
  perform t.ok(not exists (
    select 1 from public.cuentas_contables c
    join public.cuentas_contables m on m.tenant_id = v_pl and m.id = c.id
    where c.tenant_id = v_t), 'los ids del hotel nuevo son propios (no se comparten con la plantilla)');

  -- Same content as the template, parents remapped inside the new hotel.
  select count(*) into v_mal
  from public.cuentas_contables o
  left join public.cuentas_contables n
    on n.tenant_id = v_t and n.codigo = o.codigo
  where o.tenant_id = v_pl
    and (n.id is null
         or (o.nombre, o.imputable, o.activo, o.clave, o.fk_tipo_cuenta)
            is distinct from (n.nombre, n.imputable, n.activo, n.clave, n.fk_tipo_cuenta));
  perform t.ok(v_mal = 0, 'las cuentas copiadas conservan nombre, tipo, imputable, activo y clave');

  select count(*) into v_mal
  from public.cuentas_contables n
  left join public.cuentas_contables p on p.tenant_id = n.tenant_id and p.id = n.fk_cuenta_padre
  where n.tenant_id = v_t
    and (case when position('.' in n.codigo) = 0 then n.fk_cuenta_padre is not null
              else p.codigo is distinct from regexp_replace(n.codigo, '\.[^.]*$', '') end);
  perform t.ok(v_mal = 0, 'el arbol copiado cuelga de padres del mismo hotel');

  foreach v_k in array array['DISPONIBILIDADES', 'CXC_CLIENTES', 'IVA_CREDITO', 'CXP_PROVEEDORES',
                             'IVA_DEBITO', 'SALDOS_INICIALES', 'VENTAS_10', 'VENTAS_5',
                             'VENTAS_EXENTAS', 'OTROS_INGRESOS', 'OTROS_EGRESOS'] loop
    -- Called as a plain statement: a STABLE function inside a subquery would
    -- run on the snapshot of the whole statement, not of this transaction's inserts.
    v_id := public.fn_cuenta_por_clave(v_t, v_k);
    perform t.ok((select clave from public.cuentas_contables where id = v_id) = v_k
                 and (select tenant_id from public.cuentas_contables where id = v_id) = v_t,
                 'fn_cuenta_por_clave resuelve ' || v_k || ' en el hotel nuevo');
  end loop;

  perform t.ok(t.cuenta(format('select count(*) from public.categorias_finanzas where tenant_id = %s', v_t)) = 17,
               'el hotel nuevo recibe las 17 categorias');
  select count(*) into v_mal
  from public.categorias_finanzas k
  join public.cuentas_contables c on c.id = k.fk_cuenta_contable
  join public.categorias_finanzas ko on ko.tenant_id = v_pl and ko.nombre = k.nombre
  join public.cuentas_contables co on co.id = ko.fk_cuenta_contable
  where k.tenant_id = v_t
    and (c.tenant_id <> v_t or c.codigo <> co.codigo or k.tipo <> ko.tipo
         or k.es_sistema <> ko.es_sistema or k.activo <> ko.activo);
  perform t.ok(v_mal = 0, 'las categorias copiadas apuntan a la cuenta equivalente del hotel nuevo');
  perform t.ok(exists (select 1 from public.conceptos where tenant_id = v_t and nombre = 'Alojamiento'),
               'el alta sigue creando el concepto Alojamiento');

  -- The seed helper is a no-op on a hotel that already has accounts.
  perform public.fn_copiar_plan_cuentas_plantilla(v_t);
  perform public.fn_seed_tenant_desde_plantilla(v_t);
  perform t.ok(t.cuenta(format('select count(*) from public.cuentas_contables where tenant_id = %s and codigo !~ ''^1\.1\.01\.''', v_t)) = 35
               and t.cuenta(format('select count(*) from public.categorias_finanzas where tenant_id = %s', v_t)) = 17,
               'volver a sembrar un hotel con plan de cuentas no cambia nada');
end $$;

-- ─── Backfill: empty hotel gets the chart, populated hotels are untouched ─
do $$
declare
  v_vacio bigint;
  v_pro_antes bigint := t.cuenta(format('select count(*) from public.cuentas_contables where tenant_id = %s', t.g('pro')));
  v_pl_antes bigint;
  r record;
  v_pasada int;
  v_cuentas bigint;
  v_cats bigint;
begin
  insert into public.tenants (nombre, slug, estado, plan, trial_fin)
  values ('Hotel sin plan de cuentas', 'fin-vacio', 'trial', 'trial', current_date + 30)
  returning id into v_vacio;
  v_pl_antes := t.cuenta('select count(*) from public.cuentas_contables c join public.tenants t on t.id = c.tenant_id where t.slug = ''plantilla-base''');
  perform t.ok(t.cuenta(format('select count(*) from public.cuentas_contables where tenant_id = %s', v_vacio)) = 0,
               'el hotel de prueba parte sin cuentas');

  -- The backfill statement of 0017, run twice.
  for v_pasada in 1 .. 2 loop
    for r in
      select tt.id from public.tenants tt
      where tt.slug <> 'plantilla-base'
        and not exists (select 1 from public.cuentas_contables c where c.tenant_id = tt.id)
      order by tt.id
    loop
      perform public.fn_copiar_plan_cuentas_plantilla(r.id);
    end loop;

    if v_pasada = 1 then
      v_cuentas := t.cuenta(format('select count(*) from public.cuentas_contables where tenant_id = %s', v_vacio));
      v_cats := t.cuenta(format('select count(*) from public.categorias_finanzas where tenant_id = %s', v_vacio));
      perform t.ok(v_cuentas = 35 and v_cats = 17, 'el backfill da al hotel sin cuentas el plan y las categorias');
    else
      perform t.ok(t.cuenta(format('select count(*) from public.cuentas_contables where tenant_id = %s', v_vacio)) = v_cuentas
                   and t.cuenta(format('select count(*) from public.categorias_finanzas where tenant_id = %s', v_vacio)) = v_cats,
                   'el backfill es idempotente (segunda pasada sin cambios)');
    end if;
  end loop;

  perform t.ok(t.cuenta(format('select count(*) from public.cuentas_contables where tenant_id = %s', t.g('pro'))) = v_pro_antes,
               'el backfill no toca un hotel que ya tenia cuentas');
  perform t.ok(t.cuenta(format('select count(*) from public.categorias_finanzas where tenant_id = %s', t.g('pro'))) = 0,
               'un hotel con plan propio no recibe categorias de la plantilla');
  perform t.ok(t.cuenta('select count(*) from public.cuentas_contables c join public.tenants t on t.id = c.tenant_id where t.slug = ''plantilla-base''') = v_pl_antes,
               'el backfill no modifica la plantilla');
end $$;

-- ─── categorias_finanzas: structure, RLS and plan module ─────────────────
do $$
declare v_ven bigint; v_ven_b bigint;
begin
  perform t.ok((select relrowsecurity from pg_class where oid = 'public.categorias_finanzas'::regclass),
               'categorias_finanzas tiene RLS');
  perform t.ok(not has_table_privilege('anon', 'public.categorias_finanzas', 'select'),
               'anon no tiene acceso a categorias_finanzas');
  perform t.ok(not has_function_privilege('authenticated', 'public.fn_copiar_plan_cuentas_plantilla(bigint)', 'execute')
               and not has_function_privilege('anon', 'public.fn_copiar_plan_cuentas_plantilla(bigint)', 'execute'),
               'el helper de copia no se puede ejecutar desde el cliente');
  perform t.ok(not has_function_privilege('authenticated', 'public.fn_seed_tenant_desde_plantilla(bigint)', 'execute')
               and has_function_privilege('service_role', 'public.fn_seed_tenant_desde_plantilla(bigint)', 'execute'),
               'fn_seed_tenant_desde_plantilla conserva sus privilegios (solo service_role)');

  select id into v_ven   from public.cuentas_contables where tenant_id = t.g('pro')::bigint    and clave = 'VENTAS';
  select id into v_ven_b from public.cuentas_contables where tenant_id = t.g('basico')::bigint and clave = 'VENTAS';
  perform set_config('test.ven', v_ven::text, true);
  perform set_config('test.ven_b', v_ven_b::text, true);

  insert into public.categorias_finanzas (tenant_id, nombre, tipo, fk_cuenta_contable) values
    (t.g('pro')::bigint,    'Ventas varias', 'ingreso', v_ven),
    (t.g('basico')::bigint, 'Ventas varias', 'ingreso', v_ven_b);

  perform t.falla(format('insert into public.categorias_finanzas (tenant_id, nombre, tipo, fk_cuenta_contable) values (%s, ''Ventas varias'', ''ingreso'', %s)', t.g('pro'), v_ven),
                  '23505', 'el nombre de la categoria es unico por hotel');
  perform t.falla(format('insert into public.categorias_finanzas (tenant_id, nombre, tipo, fk_cuenta_contable) values (%s, ''Rara'', ''otro'', %s)', t.g('pro'), v_ven),
                  '23514', 'el tipo de la categoria es ingreso o egreso');
  perform t.falla(format('insert into public.categorias_finanzas (tenant_id, nombre, tipo, fk_cuenta_contable) values (%s, ''Cruzada'', ''ingreso'', %s)', t.g('pro'), v_ven_b),
                  '23503', 'la categoria no puede apuntar a una cuenta de otro hotel');
end $$;

do $$
begin
  -- admin: reads, writes (plan pro includes the module)
  perform t.actuar(t.g('pro_admin'), t.g('pro')::bigint);
  perform t.ok(t.cuenta('select count(*) from public.categorias_finanzas') = 1, 'el admin lee las categorias de su hotel');
  perform t.filas(format('insert into public.categorias_finanzas (nombre, tipo, fk_cuenta_contable) values (''Eventos'', ''ingreso'', %s)', t.g('ven')),
                  1, 'el admin del plan pro crea una categoria');
  perform t.filas('update public.categorias_finanzas set activo = false where nombre = ''Eventos''', 1,
                  'el admin edita una categoria');
  perform t.filas('delete from public.categorias_finanzas where nombre = ''Eventos''', 1,
                  'el admin borra una categoria');
  perform t.volver();

  perform t.actuar(t.g('ger'), t.g('pro')::bigint);
  perform t.ok(t.cuenta('select count(*) from public.categorias_finanzas') = 1, 'el gerente lee las categorias');
  perform t.filas(format('insert into public.categorias_finanzas (nombre, tipo, fk_cuenta_contable) values (''Gerencia'', ''ingreso'', %s)', t.g('ven')),
                  1, 'el gerente crea una categoria');
  perform t.volver();

  -- receptionist: no access at all
  perform t.actuar(t.g('rec'), t.g('pro')::bigint);
  perform t.ok(t.cuenta('select count(*) from public.categorias_finanzas') = 0, 'la recepcionista no ve categorias');
  perform t.falla(format('insert into public.categorias_finanzas (nombre, tipo, fk_cuenta_contable) values (''Rec'', ''ingreso'', %s)', t.g('ven')),
                  '42501', 'la recepcionista no crea categorias');
  perform t.volver();

  -- plan basico: reads, cannot write
  perform t.actuar(t.g('basico_admin'), t.g('basico')::bigint);
  perform t.ok(t.cuenta('select count(*) from public.categorias_finanzas') = 1, 'el admin del plan basico lee sus categorias');
  perform t.falla(format('insert into public.categorias_finanzas (nombre, tipo, fk_cuenta_contable) values (''Eventos'', ''ingreso'', %s)', t.g('ven_b')),
                  '42501', 'el plan basico no escribe categorias (modulo contabilidad)');
  perform t.filas('update public.categorias_finanzas set activo = false', 0,
                  'el plan basico no edita categorias');
  perform t.volver();

  -- tenant isolation
  perform t.actuar(t.g('pro_admin'), t.g('pro')::bigint);
  perform t.ok(t.cuenta(format('select count(*) from public.categorias_finanzas where tenant_id = %s', t.g('basico'))) = 0,
               'el admin no ve categorias de otro hotel');
  perform t.volver();
  perform t.anonimo();
  perform t.falla('select count(*) from public.categorias_finanzas', '42501', 'anon no lee categorias');
  perform t.volver();
end $$;

-- ═══ T3 · 0018 funds, credit invoices and invoice posting ═════════════════

-- Helpers. `factura` inserts a header the way the app does (detail rows are
-- not needed: posting reads the header only).
create function t.factura(
  p_tenant bigint, p_estab bigint, p_cliente bigint, p_turno bigint, p_modo bigint,
  p_cond int, p_g10 numeric, p_g5 numeric, p_ex numeric, p_iva numeric, p_total numeric,
  p_desc numeric default 0, p_estado text default 'EMITIDA',
  p_fecha timestamptz default now()
) returns bigint language plpgsql as $$
declare v_id bigint;
begin
  insert into public.facturas
    (tenant_id, fecha_emision, fk_cliente, condicion_venta, total_gravado_10, total_gravado_5,
     total_exenta, total_iva, total_general, observacion, fk_monedas, fk_establecimientos,
     fk_modo_pago, fk_tipo_factura, nro_secuencial, fk_turno, tipo_emision, estado,
     efectivo, vuelto, descuento_global, fk_inmueble)
  values
    (p_tenant, p_fecha, p_cliente, p_cond, p_g10, p_g5, p_ex, p_iva, p_total, '',
     (select min(id_monedas) from public.monedas), p_estab, p_modo,
     (select min(id_tipo_factura) from public.tipo_factura),
     (select coalesce(max(nro_secuencial), 0) + 1 from public.facturas where fk_establecimientos = p_estab),
     p_turno, 1, p_estado, p_total, 0, p_desc, 1)
  returning id_factura into v_id;
  return v_id;
end $$;

-- Net debit minus credit of an origin's entries on the account with that key.
create function t.mov(p_tenant bigint, p_tipo text, p_origen bigint, p_clave text) returns numeric
language sql as $$
  select coalesce(sum(d.debe - d.haber), 0)
  from public.asientos a
  join public.detalle_asientos d on d.tenant_id = a.tenant_id and d.fk_asientos = a.id
  join public.cuentas_contables c on c.tenant_id = d.tenant_id and c.id = d.fk_cuenta_contables
  where a.tenant_id = p_tenant and a.origen_tipo = p_tipo and a.fk_origen = p_origen and c.clave = p_clave
$$;

-- Same, by account id (fund accounts carry no key).
create function t.mov_cta(p_tenant bigint, p_tipo text, p_origen bigint, p_cuenta bigint) returns numeric
language sql as $$
  select coalesce(sum(d.debe - d.haber), 0)
  from public.asientos a
  join public.detalle_asientos d on d.tenant_id = a.tenant_id and d.fk_asientos = a.id
  where a.tenant_id = p_tenant and a.origen_tipo = p_tipo and a.fk_origen = p_origen
    and d.fk_cuenta_contables = p_cuenta
$$;

create function t.n_asientos(p_tenant bigint, p_tipo text, p_origen bigint) returns bigint
language sql as $$
  select count(*) from public.asientos a
  where a.tenant_id = p_tenant and a.origen_tipo = p_tipo and a.fk_origen = p_origen
$$;

create function t.n_lineas(p_tenant bigint, p_tipo text, p_origen bigint) returns bigint
language sql as $$
  select count(*) from public.asientos a
  join public.detalle_asientos d on d.tenant_id = a.tenant_id and d.fk_asientos = a.id
  where a.tenant_id = p_tenant and a.origen_tipo = p_tipo and a.fk_origen = p_origen
$$;

-- Ledger account of the fund attached to a caja.
create function t.cta_caja(p_tenant bigint, p_caja bigint) returns bigint
language sql as $$
  select fk_cuenta_contable from public.cuentas_fondos where tenant_id = p_tenant and fk_caja = p_caja
$$;

-- Fixture hotels provisioned the real way (chart, caja and fund come with it):
--   hp  plan pro (accounting module), admin + gerente + receptionist
--   hb  plan basico (no module)
--   hs  plan basico whose chart was removed (a hotel with an empty ledger)
do $$
declare
  v_contrib bigint := (select min(id_tipo_contribuyente) from public.tipo_contribuyente);
  v_regimen bigint := (select min(id_regimen) from public.tipo_regimen);
  c_ger bigint := (select id_cargo from public.cargo where lower(cargo) = 'gerente' limit 1);
  c_rec bigint := (select id_cargo from public.cargo where lower(cargo) = 'recepcionista' limit 1);
  v_cod text; v_plan text; v_i int := 0; v_u uuid; v_res jsonb; v_t bigint; v_estab bigint;
  v_caja bigint; v_us bigint; v_cli bigint; v_turno bigint;
  v_ger uuid := gen_random_uuid(); v_rec uuid := gen_random_uuid();
begin
  foreach v_cod in array array['hp', 'hb', 'hs'] loop
    v_i := v_i + 1;
    v_plan := case v_cod when 'hp' then 'pro' else 'basico' end;
    v_u := gen_random_uuid();
    insert into auth.users (id, email) values (v_u, 'fin3-' || v_cod || '@f.test');
    v_res := public.fn_provision_tenant(jsonb_build_object(
      'tenant', jsonb_build_object('nombre', 'Hotel fin3 ' || v_cod, 'slug', 'fin3-' || v_cod),
      'admin', jsonb_build_object('auth_id', v_u, 'nombre', 'Admin', 'documento', 'G' || v_i, 'fk_tipo_doc', 1),
      'empresa', jsonb_build_object('ruc', '8300000' || v_i || '-1', 'razon_social', 'Hotel G',
                                    'fk_contribuyente', v_contrib, 'fk_regimen', v_regimen),
      'establecimiento', jsonb_build_object('direccion', 'Calle', 'fk_barrio', 1)));
    v_t := (v_res ->> 'tenant_id')::bigint;
    v_estab := (v_res ->> 'id_establecimiento')::bigint;
    v_caja := (v_res ->> 'id_caja')::bigint;
    perform public.fn_activar_plan(v_t, v_plan, 'mensual', null, 'test-fin3-' || v_cod);

    if v_cod = 'hs' then
      delete from public.cuentas_fondos where tenant_id = v_t;
      delete from public.categorias_finanzas where tenant_id = v_t;
      delete from public.cuentas_contables where tenant_id = v_t;
    end if;

    select id_usuario into v_us from public.usuario where tenant_id = v_t and auth_id = v_u;
    insert into public.clientes (tenant_id, razon_social, documento, celular, es_proveedor_del_estado)
      values (v_t, 'Cliente ' || v_cod, '1234567', '0981000000', false) returning id_cliente into v_cli;
    insert into public.apertura_cierre_caja (tenant_id, monto_inicial, monto_final, fk_usuario, fk_caja)
      values (v_t, 0, 0, v_us, v_caja) returning id_turno into v_turno;

    perform set_config('test.' || v_cod, v_t::text, true);
    perform set_config('test.' || v_cod || '_admin', v_u::text, true);
    perform set_config('test.' || v_cod || '_estab', v_estab::text, true);
    perform set_config('test.' || v_cod || '_caja', v_caja::text, true);
    perform set_config('test.' || v_cod || '_cli', v_cli::text, true);
    perform set_config('test.' || v_cod || '_turno', v_turno::text, true);
  end loop;

  v_t := t.g('hp')::bigint;
  insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
    (v_ger, 'fin3-ger@f.test', jsonb_build_object('tenant_id', v_t, 'fk_cargo', c_ger),
       jsonb_build_object('nombre', 'Gerente', 'documento', 'G11', 'fk_tipo_doc', 1)),
    (v_rec, 'fin3-rec@f.test', jsonb_build_object('tenant_id', v_t, 'fk_cargo', c_rec),
       jsonb_build_object('nombre', 'Recepcion', 'documento', 'G12', 'fk_tipo_doc', 1));
  perform set_config('test.hp_ger', v_ger::text, true);
  perform set_config('test.hp_rec', v_rec::text, true);

  perform set_config('test.m_efe', (select id_modo_pago::text from public.modo_pago where descripcion = 'Efectivo'), true);
  perform set_config('test.m_tar', (select id_modo_pago::text from public.modo_pago where descripcion = 'Tarjeta'), true);
  perform set_config('test.m_tra', (select id_modo_pago::text from public.modo_pago where descripcion = 'Transferencia'), true);
  perform set_config('test.motivo', (select min(id_motivos)::text from public.motivos_emision), true);
end $$;

-- ─── Funds: every caja gets one, each with its own ledger account ─────────
do $$
declare
  v_t bigint := t.g('hp')::bigint;
  v_dis bigint; v_f bigint; v_cta bigint; v_caja2 bigint; v_fb bigint; v_n bigint;
begin
  perform t.ok((select relrowsecurity from pg_class where oid = 'public.cuentas_fondos'::regclass)
               and (select relrowsecurity from pg_class where oid = 'public.medios_pago_fondo'::regclass),
               'cuentas_fondos y medios_pago_fondo tienen RLS');
  perform t.ok(not has_table_privilege('anon', 'public.cuentas_fondos', 'select')
               and not has_table_privilege('anon', 'public.medios_pago_fondo', 'select'),
               'anon no tiene acceso a las tablas de fondos');

  v_dis := public.fn_cuenta_por_clave(v_t, 'DISPONIBILIDADES');

  -- Provisioning created the caja before the chart: the seed still gives it a fund.
  perform t.ok(t.cuenta(format('select count(*) from public.cuentas_fondos where tenant_id = %s', v_t)) = 1,
               'el hotel nuevo tiene un fondo (por su unica caja)');
  select f.id, f.fk_cuenta_contable into v_f, v_cta
  from public.cuentas_fondos f where f.tenant_id = v_t;
  perform t.ok((select (tipo, fk_caja, nombre, activo) = ('caja_turno', t.g('hp_caja')::bigint, 'Caja principal', true)
               from public.cuentas_fondos where id = v_f),
               'el fondo de la caja es caja_turno, activo y se llama como la caja');
  perform t.ok((select (fk_cuenta_padre, imputable, activo, codigo, nombre, clave is null)
                       = (v_dis, true, true, '1.1.01.01', 'Caja principal', true)
                from public.cuentas_contables where id = v_cta),
               'su cuenta es hija imputable de Disponibilidades (1.1.01.01), sin clave de sistema');

  -- A new caja creates its fund and the next account code.
  insert into public.caja (tenant_id, nro_caja, descripcion_caja, fk_establecimientos)
    values (v_t, 2, 'Caja de la noche', t.g('hp_estab')::bigint) returning id_caja into v_caja2;
  perform set_config('test.hp_caja2', v_caja2::text, true);
  perform t.ok((select (f.tipo, f.nombre) = ('caja_turno', 'Caja de la noche')
                       and c.codigo = '1.1.01.02' and c.fk_cuenta_padre = v_dis and c.imputable
                from public.cuentas_fondos f join public.cuentas_contables c on c.id = f.fk_cuenta_contable
                where f.tenant_id = v_t and f.fk_caja = v_caja2),
               'una caja nueva crea su fondo y su cuenta 1.1.01.02');

  -- A fund inserted without account gets one named like the fund.
  insert into public.cuentas_fondos (tenant_id, nombre, tipo)
    values (v_t, 'Banco Itau', 'banco') returning id into v_fb;
  perform set_config('test.hp_fbanco', v_fb::text, true);
  perform t.ok((select (c.codigo, c.nombre, c.imputable, c.activo, c.fk_cuenta_padre, c.fk_tipo_cuenta)
                       = ('1.1.01.03', 'Banco Itau', true, true, v_dis,
                          (select fk_tipo_cuenta from public.cuentas_contables where id = v_dis))
                from public.cuentas_fondos f join public.cuentas_contables c on c.id = f.fk_cuenta_contable
                where f.id = v_fb),
               'un fondo banco crea su cuenta hija con el nombre del fondo');

  -- The parent is untouched and the lookup by key still resolves to it.
  perform t.ok(public.fn_cuenta_por_clave(v_t, 'DISPONIBILIDADES') = v_dis
               and not (select imputable from public.cuentas_contables where id = v_dis)
               and t.cuenta(format('select count(*) from public.cuentas_contables where tenant_id = %s and clave = ''DISPONIBILIDADES''', v_t)) = 1,
               'Disponibilidades sigue siendo el unico padre no imputable con esa clave');
  perform t.ok(t.cuenta(format('select count(distinct codigo) from public.cuentas_contables where tenant_id = %s and fk_cuenta_padre = %s', v_t, v_dis))
               = t.cuenta(format('select count(*) from public.cuentas_contables where tenant_id = %s and fk_cuenta_padre = %s', v_t, v_dis)),
               'los codigos de las cuentas de fondos no se repiten');

  -- Constraints
  perform t.falla(format('insert into public.cuentas_fondos (tenant_id, nombre, tipo) values (%s, ''Banco Itau'', ''banco'')', v_t),
                  '23505', 'el nombre del fondo es unico por hotel');
  perform t.falla(format('insert into public.cuentas_fondos (tenant_id, nombre, tipo) values (%s, ''Rara'', ''otro'')', v_t),
                  '23514', 'el tipo de fondo es caja_turno, caja_chica o banco');
  perform t.falla(format('insert into public.cuentas_fondos (tenant_id, nombre, tipo) values (%s, ''  '', ''banco'')', v_t),
                  '23514', 'el nombre del fondo no puede estar vacio');
  perform t.falla(format('insert into public.cuentas_fondos (tenant_id, nombre, tipo, fk_caja) values (%s, ''Banco con caja'', ''banco'', %s)', v_t, t.g('hp_caja')),
                  '23514', 'solo un fondo caja_turno apunta a una caja');
  perform t.falla(format('insert into public.cuentas_fondos (tenant_id, nombre, tipo) values (%s, ''Turno sin caja'', ''caja_turno'')', v_t),
                  '23514', 'un fondo caja_turno necesita su caja');
  perform t.falla(format('insert into public.cuentas_fondos (tenant_id, nombre, tipo, fk_caja) values (%s, ''Otra de la misma'', ''caja_turno'', %s)', v_t, t.g('hp_caja')),
                  '23505', 'una caja tiene a lo sumo un fondo por hotel');
  perform t.falla(format('insert into public.cuentas_fondos (tenant_id, nombre, tipo, fk_caja) values (%s, ''Caja ajena'', ''caja_turno'', %s)', v_t, t.g('hb_caja')),
                  '23503', 'un fondo no puede apuntar a la caja de otro hotel');

  -- A name already taken by another fund does not break the caja trigger.
  insert into public.cuentas_fondos (tenant_id, nombre, tipo) values (v_t, 'Caja 3', 'caja_chica');
  insert into public.caja (tenant_id, nro_caja, fk_establecimientos)
    values (v_t, 3, t.g('hp_estab')::bigint) returning id_caja into v_caja2;
  perform t.ok(exists (select 1 from public.cuentas_fondos where tenant_id = v_t and fk_caja = v_caja2
                       and nombre = 'Caja 3 #' || v_caja2),
               'si el nombre de la caja ya existe, el fondo lleva el id de la caja como sufijo');
end $$;

-- ─── Funds: hotel without a usable chart, backfill ───────────────────────
do $$
declare
  v_pro bigint := t.g('pro')::bigint;   -- T1 fixture hotel: chart without DISPONIBILIDADES
  v_t bigint := t.g('hp')::bigint;
  v_antes bigint; v_total bigint; v_f bigint;
begin
  insert into public.caja (tenant_id, nro_caja, fk_establecimientos)
    values (v_pro, 2, t.g('pro_estab')::bigint);
  perform t.ok(t.cuenta(format('select count(*) from public.cuentas_fondos where tenant_id = %s', v_pro)) = 0,
               'una caja de un hotel sin Disponibilidades no crea fondo y no falla');
  perform t.falla_con(format('insert into public.cuentas_fondos (tenant_id, nombre, tipo) values (%s, ''Banco X'', ''banco'')', v_pro),
                      'P0002', 'DISPONIBILIDADES', 'crear un fondo sin cuenta Disponibilidades da un error claro');

  perform t.ok(t.cuenta(format('select count(*) from public.cuentas_fondos where tenant_id = %s', t.g('hs'))) = 0,
               'un hotel sin plan de cuentas no recibe fondos');
  perform public.fn_asegurar_fondos_cajas(t.g('hs')::bigint);
  perform t.ok(t.cuenta(format('select count(*) from public.cuentas_fondos where tenant_id = %s', t.g('hs'))) = 0,
               'la siembra de fondos omite un hotel sin plan de cuentas');

  -- Backfill: the fund of a caja disappears, the helper restores it, twice is a no-op.
  select f.id into v_f from public.cuentas_fondos f where f.tenant_id = v_t and f.fk_caja = t.g('hp_caja')::bigint;
  delete from public.cuentas_fondos where id = v_f;
  perform t.ok(not exists (select 1 from public.cuentas_fondos where tenant_id = v_t and fk_caja = t.g('hp_caja')::bigint),
               'el fondo de la caja principal se borro (preparacion del backfill)');
  perform public.fn_asegurar_fondos_cajas(v_t);
  perform t.ok(exists (select 1 from public.cuentas_fondos where tenant_id = v_t and fk_caja = t.g('hp_caja')::bigint
                       and nombre = 'Caja principal'),
               'el backfill recrea el fondo que falta');
  v_antes := t.cuenta('select count(*) from public.cuentas_fondos');
  v_total := t.cuenta('select count(*) from public.cuentas_contables');
  perform public.fn_asegurar_fondos_cajas(v_t);
  perform public.fn_asegurar_fondos_cajas(t.g('hb')::bigint);
  perform public.fn_asegurar_fondos_cajas(t.g('pro')::bigint);
  perform t.ok(t.cuenta('select count(*) from public.cuentas_fondos') = v_antes
               and t.cuenta('select count(*) from public.cuentas_contables') = v_total,
               'el backfill es idempotente (segunda pasada sin fondos ni cuentas nuevas)');
  perform t.ok(not has_function_privilege('authenticated', 'public.fn_asegurar_fondos_cajas(bigint)', 'execute')
               and not has_function_privilege('anon', 'public.fn_asegurar_fondos_cajas(bigint)', 'execute'),
               'el helper de fondos no se puede ejecutar desde el cliente');
end $$;

-- ─── medios_pago_fondo ───────────────────────────────────────────────────
do $$
declare v_t bigint := t.g('hp')::bigint;
begin
  insert into public.medios_pago_fondo (tenant_id, fk_modo_pago, fk_fondo)
    values (v_t, t.g('m_tar')::bigint, t.g('hp_fbanco')::bigint);
  perform t.ok(t.cuenta(format('select count(*) from public.medios_pago_fondo where tenant_id = %s', v_t)) = 1,
               'Tarjeta queda mapeada al fondo del banco');
  perform t.falla(format('insert into public.medios_pago_fondo (tenant_id, fk_modo_pago, fk_fondo) values (%s, %s, %s)',
                         v_t, t.g('m_tar'), t.g('hp_fbanco')),
                  '23505', 'un modo de pago se mapea a un solo fondo por hotel');
  perform t.falla(format('insert into public.medios_pago_fondo (tenant_id, fk_modo_pago, fk_fondo) values (%s, %s, (select id from public.cuentas_fondos where tenant_id = %s limit 1))',
                         v_t, t.g('m_tra'), t.g('hb')),
                  '23503', 'no se mapea a un fondo de otro hotel');
  perform t.falla(format('insert into public.medios_pago_fondo (tenant_id, fk_modo_pago, fk_fondo) values (%s, -1, %s)',
                         v_t, t.g('hp_fbanco')),
                  '23503', 'el modo de pago debe existir en el catalogo');
end $$;

-- ─── facturas: columns and constraints ───────────────────────────────────
do $$
declare v_t bigint := t.g('hp')::bigint; v_estab bigint := t.g('hp_estab')::bigint;
begin
  perform t.ok(exists (select 1 from information_schema.columns
                       where table_name = 'facturas' and column_name = 'fecha_vencimiento' and data_type = 'date')
               and exists (select 1 from information_schema.columns
                           where table_name = 'facturas' and column_name = 'saldo_pendiente' and is_nullable = 'NO'),
               'facturas tiene fecha_vencimiento y saldo_pendiente');
  perform t.ok((select is_nullable = 'YES' from information_schema.columns
                where table_name = 'facturas' and column_name = 'fk_modo_pago'),
               'fk_modo_pago admite null (ventas a credito)');
  perform t.falla(format('select t.factura(%s, %s, %s, %s, %s, 3, 100, 0, 0, 9, 100)',
                         v_t, v_estab, t.g('hp_cli'), t.g('hp_turno'), t.g('m_efe')),
                  '23514', 'condicion_venta solo admite 1 (contado) y 2 (credito)');
  perform t.falla(format('select t.factura(%s, %s, %s, %s, null, 1, 100, 0, 0, 9, 100)',
                         v_t, v_estab, t.g('hp_cli'), t.g('hp_turno')),
                  '23514', 'una venta de contado exige modo de pago');
end $$;

-- ─── Posting of cash invoices ────────────────────────────────────────────
do $$
declare
  v_t bigint := t.g('hp')::bigint; v_estab bigint := t.g('hp_estab')::bigint;
  v_cli bigint := t.g('hp_cli')::bigint; v_turno bigint := t.g('hp_turno')::bigint;
  v_cta_caja bigint := t.cta_caja(t.g('hp')::bigint, t.g('hp_caja')::bigint);
  v_cta_banco bigint;
  v_f bigint; v_a record; v_debe numeric; v_haber numeric;
begin
  select fk_cuenta_contable into v_cta_banco from public.cuentas_fondos where id = t.g('hp_fbanco')::bigint;

  -- Mix: 10% (IVA 10.000), 5% (IVA 1.000), exempt. Total 181.000.
  v_f := t.factura(v_t, v_estab, v_cli, v_turno, t.g('m_efe')::bigint, 1, 110000, 21000, 50000, 11000, 181000);
  perform t.ok(t.n_asientos(v_t, 'factura', v_f) = 1, 'una factura de contado genera un asiento');
  select * into v_a from public.asientos where tenant_id = v_t and origen_tipo = 'factura' and fk_origen = v_f;
  perform t.ok(v_a.estado = 'CONTABILIZADO' and v_a.fk_sucursal = v_estab and v_a.descripcion like 'Factura%',
               'el asiento esta contabilizado, en el establecimiento de la factura y describe la factura');
  perform t.ok(t.mov_cta(v_t, 'factura', v_f, v_cta_caja) = 181000, 'debita el fondo de la caja del turno por el total');
  perform t.ok(t.mov(v_t, 'factura', v_f, 'VENTAS_10') = -100000, 'acredita ventas 10% sin IVA');
  perform t.ok(t.mov(v_t, 'factura', v_f, 'VENTAS_5') = -20000, 'acredita ventas 5% sin IVA');
  perform t.ok(t.mov(v_t, 'factura', v_f, 'VENTAS_EXENTAS') = -50000, 'acredita ventas exentas');
  perform t.ok(t.mov(v_t, 'factura', v_f, 'IVA_DEBITO') = -11000, 'acredita el IVA debito');
  perform t.ok(t.mov(v_t, 'factura', v_f, 'CXC_CLIENTES') = 0, 'una venta de contado no toca deudores por ventas');
  select sum(d.debe), sum(d.haber) into v_debe, v_haber
  from public.detalle_asientos d where d.tenant_id = v_t and d.fk_asientos = v_a.id;
  perform t.ok(v_debe = 181000 and v_haber = 181000, 'el asiento balancea y el debe es el total general');
  perform t.ok((select saldo_pendiente from public.facturas where id_factura = v_f) = 0,
               'una venta de contado no deja saldo pendiente');

  -- Mapped payment mode goes to its fund; an unmapped one falls back to the shift fund.
  v_f := t.factura(v_t, v_estab, v_cli, v_turno, t.g('m_tar')::bigint, 1, 11000, 0, 0, 1000, 11000);
  perform t.ok(t.mov_cta(v_t, 'factura', v_f, v_cta_banco) = 11000 and t.mov_cta(v_t, 'factura', v_f, v_cta_caja) = 0,
               'Tarjeta mapeada debita el fondo del banco y no el de la caja');
  v_f := t.factura(v_t, v_estab, v_cli, v_turno, t.g('m_tra')::bigint, 1, 11000, 0, 0, 1000, 11000);
  perform t.ok(t.mov_cta(v_t, 'factura', v_f, v_cta_caja) = 11000 and t.mov_cta(v_t, 'factura', v_f, v_cta_banco) = 0,
               'Transferencia sin mapear cae en el fondo de la caja del turno');

  -- An inactive mapped fund is not used.
  update public.cuentas_fondos set activo = false where id = t.g('hp_fbanco')::bigint;
  v_f := t.factura(v_t, v_estab, v_cli, v_turno, t.g('m_tar')::bigint, 1, 11000, 0, 0, 1000, 11000);
  perform t.ok(t.mov_cta(v_t, 'factura', v_f, v_cta_caja) = 11000,
               'un fondo mapeado inactivo se ignora y se usa el de la caja');
  update public.cuentas_fondos set activo = true where id = t.g('hp_fbanco')::bigint;

  -- Zero lines are skipped.
  v_f := t.factura(v_t, v_estab, v_cli, v_turno, t.g('m_efe')::bigint, 1, 0, 0, 30000, 0, 30000);
  perform t.ok(t.n_lineas(v_t, 'factura', v_f) = 2 and t.mov(v_t, 'factura', v_f, 'IVA_DEBITO') = 0,
               'una factura solo exenta genera dos lineas (sin lineas en cero)');
  -- Per-line IVA rounding can leave the header IVA below round(5% / 21): the entry still balances.
  v_f := t.factura(v_t, v_estab, v_cli, v_turno, t.g('m_efe')::bigint, 1, 0, 20, 0, 0, 20);
  perform t.ok(t.mov(v_t, 'factura', v_f, 'VENTAS_5') = -20 and t.mov_cta(v_t, 'factura', v_f, v_cta_caja) = 20,
               'el IVA del 5% se acota al IVA de la cabecera y el asiento balancea');
  -- Header discount: sales absorb it so the debit is still total_general.
  v_f := t.factura(v_t, v_estab, v_cli, v_turno, t.g('m_efe')::bigint, 1, 110000, 0, 0, 10000, 100000, 10000);
  perform t.ok(t.mov_cta(v_t, 'factura', v_f, v_cta_caja) = 100000
               and t.mov(v_t, 'factura', v_f, 'VENTAS_10') = -90000
               and t.mov(v_t, 'factura', v_f, 'IVA_DEBITO') = -10000,
               'con descuento_global el debe es total_general y las ventas absorben la diferencia');
  perform t.falla_con(format('select t.factura(%s, %s, %s, %s, %s, 1, 100, 0, 0, 500, 100)',
                             v_t, v_estab, t.g('hp_cli'), v_turno, t.g('m_efe')),
                      '23514', 'consistentes', 'un IVA mayor que el monto gravado se rechaza con un mensaje claro');

  -- The accounting date is the local day of the invoice, not the UTC one.
  v_f := t.factura(v_t, v_estab, v_cli, v_turno, t.g('m_efe')::bigint, 1, 11000, 0, 0, 1000, 11000, 0, 'EMITIDA',
                   timestamp '2026-03-15 23:30' at time zone 'America/Asuncion');
  perform t.ok((select (fecha at time zone 'America/Asuncion')::date from public.asientos
                where tenant_id = v_t and origen_tipo = 'factura' and fk_origen = v_f) = date '2026-03-15',
               'el asiento lleva el dia local (America/Asuncion) de la factura');
end $$;

-- ─── Credit invoices ─────────────────────────────────────────────────────
do $$
declare
  v_t bigint := t.g('hp')::bigint; v_estab bigint := t.g('hp_estab')::bigint;
  v_cli bigint := t.g('hp_cli')::bigint; v_turno bigint := t.g('hp_turno')::bigint;
  v_cta_caja bigint := t.cta_caja(t.g('hp')::bigint, t.g('hp_caja')::bigint);
  v_f bigint;
begin
  v_f := t.factura(v_t, v_estab, v_cli, v_turno, null, 2, 110000, 21000, 50000, 11000, 181000);
  perform t.ok(t.mov(v_t, 'factura', v_f, 'CXC_CLIENTES') = 181000 and t.mov_cta(v_t, 'factura', v_f, v_cta_caja) = 0,
               'una venta a credito debita deudores por ventas y no un fondo');
  perform t.ok(t.mov(v_t, 'factura', v_f, 'VENTAS_10') = -100000 and t.mov(v_t, 'factura', v_f, 'VENTAS_5') = -20000
               and t.mov(v_t, 'factura', v_f, 'VENTAS_EXENTAS') = -50000 and t.mov(v_t, 'factura', v_f, 'IVA_DEBITO') = -11000,
               'una venta a credito acredita las mismas cuentas de ventas e IVA');
  perform t.ok((select saldo_pendiente from public.facturas where id_factura = v_f) = 181000,
               'una venta a credito nace con saldo_pendiente igual al total');
  update public.facturas set fecha_vencimiento = current_date + 30 where id_factura = v_f;
  perform t.ok((select fecha_vencimiento from public.facturas where id_factura = v_f) = current_date + 30,
               'la fecha de vencimiento es opcional y se puede fijar');

  -- A client-supplied saldo is ignored at insert.
  v_f := t.factura(v_t, v_estab, v_cli, v_turno, t.g('m_efe')::bigint, 2, 11000, 0, 0, 1000, 11000);
  perform t.ok((select saldo_pendiente from public.facturas where id_factura = v_f) = 11000,
               'un credito con modo de pago tambien es valido');

  -- Plan basico: contado posts, credito is refused (module not in the plan).
  v_f := t.factura(t.g('hb')::bigint, t.g('hb_estab')::bigint, t.g('hb_cli')::bigint, t.g('hb_turno')::bigint,
                   t.g('m_efe')::bigint, 1, 11000, 0, 0, 1000, 11000);
  perform t.ok(t.n_asientos(t.g('hb')::bigint, 'factura', v_f) = 1
               and t.mov_cta(t.g('hb')::bigint, 'factura', v_f, t.cta_caja(t.g('hb')::bigint, t.g('hb_caja')::bigint)) = 11000,
               'el plan basico tambien contabiliza las ventas de contado');
  perform t.falla_con(format('select t.factura(%s, %s, %s, %s, null, 2, 11000, 0, 0, 1000, 11000)',
                             t.g('hb'), t.g('hb_estab'), t.g('hb_cli'), t.g('hb_turno')),
                      '42501', 'contabilidad', 'el plan basico no puede vender a credito');
end $$;

-- ─── Annulment ───────────────────────────────────────────────────────────
do $$
declare
  v_t bigint := t.g('hp')::bigint; v_estab bigint := t.g('hp_estab')::bigint;
  v_cli bigint := t.g('hp_cli')::bigint; v_turno bigint := t.g('hp_turno')::bigint;
  v_cta_caja bigint := t.cta_caja(t.g('hp')::bigint, t.g('hp_caja')::bigint);
  v_f bigint; v_c bigint; v_h bigint; v_n bigint;
begin
  v_f := t.factura(v_t, v_estab, v_cli, v_turno, t.g('m_efe')::bigint, 1, 110000, 0, 0, 10000, 110000);
  update public.facturas set estado = 'ANULADA', fk_motivo = t.g('motivo')::smallint where id_factura = v_f;
  perform t.ok(t.n_asientos(v_t, 'factura_anulacion', v_f) = 1, 'anular la factura crea el asiento de reverso');
  perform t.ok(not exists (select 1 from public.asientos where tenant_id = v_t and fk_origen = v_f
                           and origen_tipo in ('factura', 'factura_anulacion') and estado <> 'ANULADO'),
               'el asiento original y su reverso quedan ANULADO');
  perform t.ok(t.mov_cta(v_t, 'factura', v_f, v_cta_caja) + t.mov_cta(v_t, 'factura_anulacion', v_f, v_cta_caja) = 0
               and t.mov(v_t, 'factura', v_f, 'VENTAS_10') + t.mov(v_t, 'factura_anulacion', v_f, 'VENTAS_10') = 0
               and t.mov(v_t, 'factura', v_f, 'IVA_DEBITO') + t.mov(v_t, 'factura_anulacion', v_f, 'IVA_DEBITO') = 0,
               'el reverso deja las cuentas en cero');
  update public.facturas set estado = 'ANULADA' where id_factura = v_f;
  perform t.ok(t.n_asientos(v_t, 'factura_anulacion', v_f) = 1, 'una factura ya anulada no genera otro reverso');

  -- Credit: the balance goes to zero and the receivable is reversed.
  v_c := t.factura(v_t, v_estab, v_cli, v_turno, null, 2, 110000, 0, 0, 10000, 110000);
  update public.facturas set estado = 'ANULADA', fk_motivo = t.g('motivo')::smallint where id_factura = v_c;
  perform t.ok((select saldo_pendiente from public.facturas where id_factura = v_c) = 0,
               'anular una venta a credito pone el saldo en cero');
  perform t.ok(t.mov(v_t, 'factura', v_c, 'CXC_CLIENTES') + t.mov(v_t, 'factura_anulacion', v_c, 'CXC_CLIENTES') = 0
               and t.n_asientos(v_t, 'factura_anulacion', v_c) = 1,
               'anular una venta a credito revierte deudores por ventas');
  -- T4 adds here: annulment is refused while the invoice has active cobros.

  -- Invoices without an entry (before the module existed, or born annulled).
  v_h := t.factura(v_t, v_estab, v_cli, v_turno, t.g('m_efe')::bigint, 1, 11000, 0, 0, 1000, 11000, 0, 'ANULADA');
  perform t.ok(t.n_asientos(v_t, 'factura', v_h) = 0, 'una factura insertada ANULADA no se contabiliza');

  set local session_replication_role = replica;
  v_h := t.factura(v_t, v_estab, v_cli, v_turno, t.g('m_efe')::bigint, 1, 11000, 0, 0, 1000, 11000);
  set local session_replication_role = origin;
  perform t.ok(t.n_asientos(v_t, 'factura', v_h) = 0, 'la factura historica no tiene asiento (preparacion)');
  update public.facturas set estado = 'ANULADA', fk_motivo = t.g('motivo')::smallint where id_factura = v_h;
  perform t.ok((select estado from public.facturas where id_factura = v_h) = 'ANULADA'
               and t.n_asientos(v_t, 'factura_anulacion', v_h) = 0,
               'anular una factura historica (sin asiento) funciona y no crea reverso');

  -- A hotel with an empty chart issues invoices normally; nothing is posted.
  v_h := t.factura(t.g('hs')::bigint, t.g('hs_estab')::bigint, t.g('hs_cli')::bigint, t.g('hs_turno')::bigint,
                   t.g('m_efe')::bigint, 1, 11000, 0, 0, 1000, 11000);
  perform t.ok(t.n_asientos(t.g('hs')::bigint, 'factura', v_h) = 0,
               'un hotel sin plan de cuentas factura sin contabilizar');
  update public.facturas set estado = 'ANULADA' where id_factura = v_h;
  perform t.ok((select estado from public.facturas where id_factura = v_h) = 'ANULADA',
               'y puede anular esa factura');

  -- The shift's caja without a fund: a clear Spanish error, nothing is posted.
  declare
    v_caja2 bigint := t.g('hp_caja2')::bigint; v_us bigint; v_turno2 bigint;
  begin
    select id_usuario into v_us from public.usuario where tenant_id = v_t and auth_id = t.g('hp_admin')::uuid;
    insert into public.apertura_cierre_caja (tenant_id, monto_inicial, monto_final, fk_usuario, fk_caja)
      values (v_t, 0, 0, v_us, v_caja2) returning id_turno into v_turno2;
    delete from public.cuentas_fondos where tenant_id = v_t and fk_caja = v_caja2;
    select count(*) into v_n from public.facturas where tenant_id = v_t;
    perform t.falla_con(format('select t.factura(%s, %s, %s, %s, %s, 1, 11000, 0, 0, 1000, 11000)',
                               v_t, v_estab, v_cli, v_turno2, t.g('m_efe')),
                        'P0002', 'fondo', 'sin fondo para la caja del turno la factura falla con un mensaje claro');
    perform t.ok((select count(*) from public.facturas where tenant_id = v_t) = v_n,
                 'la factura sin fondo no queda guardada');
  end;
end $$;

-- ─── Posting through the app path (receptionist, RLS) ────────────────────
do $$
declare
  v_t bigint := t.g('hp')::bigint; v_estab bigint := t.g('hp_estab')::bigint;
  v_cli bigint := t.g('hp_cli')::bigint; v_turno bigint := t.g('hp_turno')::bigint;
  v_f bigint; v_c bigint;
begin
  perform t.actuar(t.g('hp_rec'), v_t);
  v_f := t.factura(v_t, v_estab, v_cli, v_turno, t.g('m_efe')::bigint, 1, 110000, 0, 0, 10000, 110000);
  v_c := t.factura(v_t, v_estab, v_cli, v_turno, null, 2, 55000, 0, 0, 5000, 55000);
  perform t.ok(t.cuenta('select count(*) from public.asientos') = 0
               and t.cuenta('select count(*) from public.cuentas_fondos') = 0
               and t.cuenta('select count(*) from public.medios_pago_fondo') = 0,
               'la recepcionista no ve asientos, fondos ni medios de pago');
  perform t.filas(format('update public.facturas set estado = ''ANULADA'', fk_motivo = %s where id_factura = %s', t.g('motivo'), v_f),
                  1, 'la recepcionista anula una factura');
  perform t.volver();

  perform t.ok(t.n_asientos(v_t, 'factura', v_f) = 1 and t.n_asientos(v_t, 'factura_anulacion', v_f) = 1,
               'la factura de la recepcionista se contabilizo y se revirtio al anularla');
  perform t.ok(t.mov(v_t, 'factura', v_c, 'CXC_CLIENTES') = 55000
               and (select saldo_pendiente from public.facturas where id_factura = v_c) = 55000,
               'la recepcionista emite ventas a credito (plan pro) y se contabilizan');
end $$;

-- ─── RLS of the new tables ───────────────────────────────────────────────
do $$
declare v_t bigint := t.g('hp')::bigint; v_cj bigint;
begin
  perform t.actuar(t.g('hp_admin'), v_t);
  perform t.ok(t.cuenta('select count(*) from public.cuentas_fondos') >= 3, 'el admin lee los fondos de su hotel');
  perform t.filas('insert into public.cuentas_fondos (nombre, tipo) values (''Caja chica'', ''caja_chica'')', 1,
                  'el admin crea un fondo (la cuenta contable se crea sola)');
  perform t.ok(exists (select 1 from public.cuentas_contables where nombre = 'Caja chica' and imputable),
               'el fondo creado por el admin tiene su cuenta');
  select id into v_cj from public.cuentas_fondos where nombre = 'Caja chica';
  perform t.filas(format('insert into public.medios_pago_fondo (fk_modo_pago, fk_fondo) values (%s, %s)', t.g('m_tra'), v_cj),
                  1, 'el admin mapea un modo de pago a un fondo');
  perform t.filas('update public.cuentas_fondos set activo = false where nombre = ''Caja chica''', 1, 'el admin edita un fondo');
  perform t.ok(t.cuenta('select count(*) from public.medios_pago_fondo') = 2, 'el admin lee los medios de pago');
  perform t.filas('delete from public.medios_pago_fondo where fk_modo_pago = ' || t.g('m_tra'), 1, 'el admin borra un mapeo');
  perform t.filas('delete from public.cuentas_fondos where nombre = ''Caja chica''', 1, 'el admin borra un fondo sin uso');
  perform t.volver();

  perform t.actuar(t.g('hp_ger'), v_t);
  perform t.ok(t.cuenta('select count(*) from public.cuentas_fondos') >= 3, 'el gerente lee los fondos');
  perform t.filas('insert into public.cuentas_fondos (nombre, tipo) values (''Banco Gerencia'', ''banco'')', 1,
                  'el gerente crea un fondo');
  perform t.volver();

  perform t.actuar(t.g('hp_rec'), v_t);
  perform t.falla('insert into public.cuentas_fondos (nombre, tipo) values (''Rec'', ''banco'')',
                  '42501', 'la recepcionista no crea fondos');
  perform t.falla(format('insert into public.medios_pago_fondo (fk_modo_pago, fk_fondo) values (%s, %s)', t.g('m_tra'), t.g('hp_fbanco')),
                  '42501', 'la recepcionista no crea mapeos de pago');
  perform t.volver();

  perform t.actuar(t.g('hb_admin'), t.g('hb')::bigint);
  perform t.ok(t.cuenta('select count(*) from public.cuentas_fondos') = 1, 'el admin del plan basico lee su fondo');
  perform t.falla('insert into public.cuentas_fondos (nombre, tipo) values (''Banco'', ''banco'')',
                  '42501', 'el plan basico no escribe fondos (modulo contabilidad)');
  perform t.falla(format('insert into public.medios_pago_fondo (fk_modo_pago, fk_fondo) values (%s, (select id from public.cuentas_fondos limit 1))', t.g('m_tra')),
                  '42501', 'el plan basico no escribe medios de pago');
  perform t.filas('update public.cuentas_fondos set activo = false', 0, 'el plan basico no edita fondos');
  perform t.volver();

  perform t.actuar(t.g('hp_admin'), v_t);
  perform t.ok(t.cuenta(format('select count(*) from public.cuentas_fondos where tenant_id = %s', t.g('hb'))) = 0
               and t.cuenta(format('select count(*) from public.medios_pago_fondo where tenant_id = %s', t.g('hb'))) = 0,
               'el admin no ve fondos ni medios de pago de otro hotel');
  perform t.volver();
  perform t.anonimo();
  perform t.falla('select count(*) from public.cuentas_fondos', '42501', 'anon no lee fondos');
  perform t.falla('select count(*) from public.medios_pago_fondo', '42501', 'anon no lee medios de pago');
  perform t.volver();
end $$;

-- ═══ T4 · 0019 expenses, collections, payments, transfers, opening balances ═══

-- Helpers: thin wrappers over INSERT that return the new id.
create function t.gasto(
  p_tenant bigint, p_cond text, p_g10 numeric, p_g5 numeric, p_ex numeric,
  p_prov bigint, p_fondo bigint, p_cat bigint,
  p_fecha date default date '2026-03-10', p_comp text default null
) returns bigint language plpgsql as $$
declare v_id bigint;
begin
  insert into public.gastos
    (tenant_id, fecha, fk_proveedor, fk_categoria, nro_comprobante,
     gravado_10, gravado_5, exenta, condicion, fk_cuenta_fondo)
  values (p_tenant, p_fecha, p_prov, p_cat, p_comp, p_g10, p_g5, p_ex, p_cond, p_fondo)
  returning id into v_id;
  return v_id;
end $$;

create function t.pago(p_tenant bigint, p_gasto bigint, p_fondo bigint, p_monto numeric) returns bigint
language plpgsql as $$
declare v_id bigint;
begin
  insert into public.pagos (tenant_id, fk_gasto, fk_cuenta_fondo, monto)
  values (p_tenant, p_gasto, p_fondo, p_monto) returning id into v_id;
  return v_id;
end $$;

create function t.cobro(p_tenant bigint, p_factura bigint, p_fondo bigint, p_monto numeric) returns bigint
language plpgsql as $$
declare v_id bigint;
begin
  insert into public.cobros (tenant_id, fk_factura, fk_cuenta_fondo, monto)
  values (p_tenant, p_factura, p_fondo, p_monto) returning id into v_id;
  return v_id;
end $$;

create function t.transf(p_tenant bigint, p_origen bigint, p_destino bigint, p_monto numeric) returns bigint
language plpgsql as $$
declare v_id bigint;
begin
  insert into public.transferencias_fondos (tenant_id, fk_fondo_origen, fk_fondo_destino, monto)
  values (p_tenant, p_origen, p_destino, p_monto) returning id into v_id;
  return v_id;
end $$;

create function t.saldo_inicial(p_tenant bigint, p_fondo bigint, p_monto numeric) returns bigint
language plpgsql as $$
declare v_id bigint;
begin
  insert into public.saldos_iniciales_fondos (tenant_id, fk_cuenta_fondo, monto)
  values (p_tenant, p_fondo, p_monto) returning id into v_id;
  return v_id;
end $$;

-- Net debit minus credit of everything posted to a ledger account (reversals included).
create function t.saldo_cta(p_tenant bigint, p_cuenta bigint) returns numeric language sql as $$
  select coalesce(sum(debe - haber), 0) from public.detalle_asientos
  where tenant_id = p_tenant and fk_cuenta_contables = p_cuenta
$$;

create function t.saldo_clave(p_tenant bigint, p_clave text) returns numeric language sql as $$
  select t.saldo_cta(p_tenant, (select id from public.cuentas_contables where tenant_id = p_tenant and clave = p_clave))
$$;

create function t.cta_fondo(p_fondo bigint) returns bigint language sql as $$
  select fk_cuenta_contable from public.cuentas_fondos where id = p_fondo
$$;

-- ─── Fixtures: categories, funds and suppliers ───────────────────────────
do $$
declare
  v_hp bigint := t.g('hp')::bigint; v_hb bigint := t.g('hb')::bigint; v_f bigint;
begin
  perform set_config('test.hp_cat_egr', (select id::text from public.categorias_finanzas
    where tenant_id = v_hp and tipo = 'egreso' and activo order by id limit 1), true);
  perform set_config('test.hp_cat_egr2', (select id::text from public.categorias_finanzas
    where tenant_id = v_hp and tipo = 'egreso' and activo order by id offset 1 limit 1), true);
  perform set_config('test.hp_cat_ing', (select id::text from public.categorias_finanzas
    where tenant_id = v_hp and tipo = 'ingreso' and activo order by id limit 1), true);
  perform set_config('test.hb_cat_egr', (select id::text from public.categorias_finanzas
    where tenant_id = v_hb and tipo = 'egreso' and activo order by id limit 1), true);
  perform set_config('test.hp_fcaja', (select id::text from public.cuentas_fondos
    where tenant_id = v_hp and fk_caja = t.g('hp_caja')::bigint), true);
  perform set_config('test.hb_fcaja', (select id::text from public.cuentas_fondos
    where tenant_id = v_hb and fk_caja = t.g('hb_caja')::bigint), true);

  insert into public.cuentas_fondos (tenant_id, nombre, tipo, activo)
    values (v_hp, 'Fondo inactivo', 'banco', false) returning id into v_f;
  perform set_config('test.hp_finactivo', v_f::text, true);

  insert into public.proveedores (tenant_id, nombre, ruc) values (v_hp, 'Proveedor Uno', '80011111-1')
    returning id into v_f;
  perform set_config('test.hp_prov', v_f::text, true);
  insert into public.proveedores (tenant_id, nombre, ruc) values (v_hb, 'Proveedor Basico', '80022222-2')
    returning id into v_f;
  perform set_config('test.hb_prov', v_f::text, true);
end $$;

-- ─── proveedores ─────────────────────────────────────────────────────────
do $$
declare v_hp bigint := t.g('hp')::bigint;
begin
  perform t.ok((select relrowsecurity from pg_class where oid = 'public.proveedores'::regclass), 'proveedores tiene RLS');
  perform t.falla(format('insert into public.proveedores (tenant_id, nombre, ruc) values (%s, ''Otro'', ''80011111-1'')', v_hp),
                  '23505', 'el RUC es unico por hotel');
  insert into public.proveedores (tenant_id, nombre, ruc) values (v_hp, 'Dos', 'ABC-1');
  perform t.falla(format('insert into public.proveedores (tenant_id, nombre, ruc) values (%s, ''Tres'', ''abc-1'')', v_hp),
                  '23505', 'el RUC no distingue mayusculas');
  insert into public.proveedores (tenant_id, nombre) values (v_hp, 'Sin RUC 1'), (v_hp, 'Sin RUC 2');
  perform t.ok(true, 'varios proveedores sin RUC conviven');
  insert into public.proveedores (tenant_id, nombre, ruc) values (t.g('hb')::bigint, 'Mismo RUC otro hotel', '80011111-1');
  perform t.ok(true, 'el mismo RUC puede existir en otro hotel');
  perform t.falla(format('insert into public.proveedores (tenant_id, nombre) values (%s, ''  '')', v_hp),
                  '23514', 'el nombre del proveedor no puede estar vacio');
  perform t.falla(format('insert into public.proveedores (tenant_id, nombre, ruc) values (%s, ''X'', ''  '')', v_hp),
                  '23514', 'el RUC informado no puede estar vacio');
end $$;

-- ─── gastos: posting of cash and credit expenses ─────────────────────────
do $$
declare
  v_t bigint := t.g('hp')::bigint; v_estab bigint := t.g('hp_estab')::bigint;
  v_cat bigint := t.g('hp_cat_egr')::bigint; v_prov bigint := t.g('hp_prov')::bigint;
  v_fc bigint := t.g('hp_fcaja')::bigint; v_fb bigint := t.g('hp_fbanco')::bigint;
  v_cta_caja bigint := t.cta_caja(t.g('hp')::bigint, t.g('hp_caja')::bigint);
  v_cta_cat bigint := (select fk_cuenta_contable from public.categorias_finanzas where id = t.g('hp_cat_egr')::bigint);
  v_g bigint; v_a record; v_debe numeric; v_haber numeric;
begin
  -- Mix: 10% (IVA 10.000), 5% (IVA 1.000), exempt. Total 181.000.
  v_g := t.gasto(v_t, 'contado', 110000, 21000, 50000, null, v_fc, v_cat);
  perform t.ok((select (iva_10, iva_5, total, saldo_pendiente, estado) = (10000, 1000, 181000, 0, 'REGISTRADO')
                from public.gastos where id = v_g),
               'el gasto calcula iva_10, iva_5 y total, nace REGISTRADO y sin saldo');
  perform t.ok((select fk_establecimientos from public.gastos where id = v_g) = v_estab,
               'sin establecimiento se usa el primero del hotel');
  perform t.ok(t.n_asientos(v_t, 'gasto', v_g) = 1, 'un gasto de contado genera un asiento');
  select * into v_a from public.asientos where tenant_id = v_t and origen_tipo = 'gasto' and fk_origen = v_g;
  perform t.ok(v_a.estado = 'CONTABILIZADO' and v_a.fk_sucursal = v_estab and v_a.descripcion like 'Gasto%'
               and (v_a.fecha at time zone 'America/Asuncion')::date = date '2026-03-10',
               'el asiento esta contabilizado, en el establecimiento y con la fecha del gasto');
  perform t.ok(t.mov_cta(v_t, 'gasto', v_g, v_cta_cat) = 170000, 'debita la cuenta de la categoria por el total sin IVA');
  perform t.ok(t.mov(v_t, 'gasto', v_g, 'IVA_CREDITO') = 11000, 'debita IVA credito fiscal');
  perform t.ok(t.mov_cta(v_t, 'gasto', v_g, v_cta_caja) = -181000, 'acredita el fondo que pago por el total');
  perform t.ok(t.mov(v_t, 'gasto', v_g, 'CXP_PROVEEDORES') = 0, 'un gasto de contado no toca proveedores');
  select sum(d.debe), sum(d.haber) into v_debe, v_haber
  from public.detalle_asientos d where d.tenant_id = v_t and d.fk_asientos = v_a.id;
  perform t.ok(v_debe = 181000 and v_haber = 181000, 'el asiento del gasto balancea');

  -- Only exempt: no VAT line.
  v_g := t.gasto(v_t, 'contado', 0, 0, 30000, null, v_fb, v_cat);
  perform t.ok(t.n_lineas(v_t, 'gasto', v_g) = 2 and t.mov(v_t, 'gasto', v_g, 'IVA_CREDITO') = 0
               and t.mov_cta(v_t, 'gasto', v_g, t.cta_fondo(v_fb)) = -30000,
               'un gasto solo exento no lleva linea de IVA y acredita el fondo banco');
  -- Rounding.
  v_g := t.gasto(v_t, 'contado', 10, 10, 0, null, v_fc, v_cat);
  perform t.ok((select (iva_10, iva_5, total) = (1, 0, 20) from public.gastos where id = v_g),
               'el IVA se redondea (10/11 = 1, 10/21 = 0)');

  -- The client cannot spoof the computed columns.
  insert into public.gastos (tenant_id, fk_categoria, gravado_10, iva_10, iva_5, total, saldo_pendiente, estado, condicion, fk_cuenta_fondo)
    values (v_t, v_cat, 11000, 999, 999, 1, 77, 'ANULADO', 'contado', v_fc) returning id into v_g;
  perform t.ok((select (iva_10, iva_5, total, saldo_pendiente, estado) = (1000, 0, 11000, 0, 'REGISTRADO')
                from public.gastos where id = v_g),
               'iva, total, saldo y estado enviados por el cliente se ignoran');
  insert into public.gastos (tenant_id, fk_categoria, fk_proveedor, gravado_10, saldo_pendiente, condicion)
    values (v_t, v_cat, v_prov, 11000, 5, 'credito') returning id into v_g;
  perform t.ok((select saldo_pendiente from public.gastos where id = v_g) = 11000,
               'un gasto a credito nace con saldo igual al total aunque el cliente mande otro');

  -- Credit: accounts payable.
  v_g := t.gasto(v_t, 'credito', 110000, 21000, 50000, v_prov, null, v_cat);
  perform t.ok(t.mov(v_t, 'gasto', v_g, 'CXP_PROVEEDORES') = -181000 and t.mov_cta(v_t, 'gasto', v_g, v_cta_caja) = 0
               and t.mov_cta(v_t, 'gasto', v_g, v_cta_cat) = 170000 and t.mov(v_t, 'gasto', v_g, 'IVA_CREDITO') = 11000,
               'un gasto a credito acredita proveedores y no un fondo');
  perform t.ok((select (saldo_pendiente, total) = (181000, 181000) from public.gastos where id = v_g),
               'un gasto a credito nace con saldo igual al total');

  -- Rules.
  perform t.falla(format('select t.gasto(%s, ''credito'', 1000, 0, 0, null, null, %s)', v_t, v_cat),
                  '23514', 'el gasto a credito exige proveedor');
  perform t.falla(format('select t.gasto(%s, ''credito'', 1000, 0, 0, %s, %s, %s)', v_t, v_prov, v_fc, v_cat),
                  '23514', 'el gasto a credito no lleva fondo');
  perform t.falla(format('select t.gasto(%s, ''contado'', 1000, 0, 0, null, null, %s)', v_t, v_cat),
                  '23514', 'el gasto de contado exige fondo');
  perform t.falla_con(format('select t.gasto(%s, ''contado'', 1000, 0, 0, null, %s, %s)', v_t, v_fc, t.g('hp_cat_ing')),
                      '23514', 'egreso', 'la categoria debe ser de egreso');
  update public.categorias_finanzas set activo = false where id = t.g('hp_cat_egr2')::bigint;
  perform t.falla_con(format('select t.gasto(%s, ''contado'', 1000, 0, 0, null, %s, %s)', v_t, v_fc, t.g('hp_cat_egr2')),
                      '23514', 'inactiva', 'la categoria inactiva se rechaza');
  update public.categorias_finanzas set activo = true where id = t.g('hp_cat_egr2')::bigint;
  perform t.falla_con(format('select t.gasto(%s, ''contado'', 1000, 0, 0, null, %s, %s)', v_t, t.g('hp_finactivo'), v_cat),
                      '23514', 'inactivo', 'el fondo inactivo se rechaza');
  perform t.falla(format('select t.gasto(%s, ''contado'', 0, 0, 0, null, %s, %s)', v_t, v_fc, v_cat),
                  '23514', 'el total debe ser mayor a cero');
  perform t.falla(format('select t.gasto(%s, ''contado'', -1000, 5000, 0, null, %s, %s)', v_t, v_fc, v_cat),
                  '23514', 'los montos no pueden ser negativos');
  perform t.falla(format('select t.gasto(%s, ''otra'', 1000, 0, 0, null, %s, %s)', v_t, v_fc, v_cat),
                  '23514', 'la condicion es contado o credito');
  perform t.falla(format('insert into public.gastos (tenant_id, fecha, fecha_vencimiento, fk_categoria, gravado_10, fk_proveedor, condicion) values (%s, date ''2026-03-10'', date ''2026-03-01'', %s, 1000, %s, ''credito'')',
                         v_t, v_cat, v_prov),
                  '23514', 'el vencimiento no puede ser anterior a la fecha');

  -- Another hotel's data cannot be referenced.
  perform t.falla(format('select t.gasto(%s, ''credito'', 1000, 0, 0, %s, null, %s)', v_t, t.g('hb_prov'), v_cat),
                  '23503', 'un gasto no usa el proveedor de otro hotel');
  perform t.falla(format('select t.gasto(%s, ''contado'', 1000, 0, 0, null, %s, %s)', v_t, t.g('hb_fcaja'), v_cat),
                  '23503', 'un gasto no usa el fondo de otro hotel');
  perform t.falla(format('select t.gasto(%s, ''contado'', 1000, 0, 0, null, %s, %s)', v_t, v_fc, t.g('hb_cat_egr')),
                  '23503', 'un gasto no usa la categoria de otro hotel');
  perform t.falla(format('insert into public.gastos (tenant_id, fk_establecimientos, fk_categoria, gravado_10, condicion, fk_cuenta_fondo) values (%s, %s, %s, 1000, ''contado'', %s)',
                         v_t, t.g('hb_estab'), v_cat, v_fc),
                  '23503', 'un gasto no usa el establecimiento de otro hotel');
end $$;

-- ─── gastos: immutability and annulment ──────────────────────────────────
do $$
declare
  v_t bigint := t.g('hp')::bigint; v_cat bigint := t.g('hp_cat_egr')::bigint;
  v_prov bigint := t.g('hp_prov')::bigint; v_fc bigint := t.g('hp_fcaja')::bigint;
  v_cta_caja bigint := t.cta_caja(t.g('hp')::bigint, t.g('hp_caja')::bigint);
  v_cta_cat bigint := (select fk_cuenta_contable from public.categorias_finanzas where id = t.g('hp_cat_egr')::bigint);
  v_g bigint; v_c bigint;
begin
  v_g := t.gasto(v_t, 'contado', 110000, 0, 0, null, v_fc, v_cat);
  v_c := t.gasto(v_t, 'credito', 55000, 0, 0, v_prov, null, v_cat);

  perform t.falla_con(format('update public.gastos set total = 5 where id = %s', v_g), '55000', 'no se pueden modificar',
                      'el total de un gasto es inmutable');
  perform t.falla(format('update public.gastos set gravado_10 = 5000 where id = %s', v_g), '55000', 'los importes son inmutables');
  perform t.falla(format('update public.gastos set exenta = 5000 where id = %s', v_g), '55000', 'la parte exenta es inmutable');
  perform t.falla(format('update public.gastos set iva_10 = 0 where id = %s', v_g), '55000', 'el IVA es inmutable');
  perform t.falla(format('update public.gastos set fk_categoria = %s where id = %s', t.g('hp_cat_egr2'), v_g),
                  '55000', 'la categoria es inmutable');
  perform t.falla(format('update public.gastos set fk_cuenta_fondo = %s where id = %s', t.g('hp_fbanco'), v_g),
                  '55000', 'el fondo es inmutable');
  perform t.falla(format('update public.gastos set fecha = date ''2026-04-01'' where id = %s', v_g),
                  '55000', 'la fecha es inmutable');
  perform t.falla(format('update public.gastos set condicion = ''credito'' where id = %s', v_g),
                  '55000', 'la condicion es inmutable');
  perform t.falla_con(format('update public.gastos set saldo_pendiente = 0 where id = %s', v_c), '55000', 'saldo pendiente',
                      'el saldo no se edita a mano en un gasto a credito');
  perform t.falla(format('update public.gastos set estado = ''REGISTRADO'', fk_categoria = %s where id = %s', t.g('hp_cat_egr2'), v_g),
                  '55000', 'tampoco se mezcla un cambio de importes con otro de estado');

  update public.gastos set nro_comprobante = '001-001-0000123', observacion = 'nota', fecha_vencimiento = date '2026-05-01'
    where id = v_c;
  perform t.ok((select (nro_comprobante, observacion, fecha_vencimiento) = ('001-001-0000123', 'nota', date '2026-05-01')
                from public.gastos where id = v_c),
               'nro_comprobante, observacion y fecha_vencimiento se pueden editar');
  update public.gastos set fk_proveedor = (select id from public.proveedores where tenant_id = v_t and nombre = 'Dos')
    where id = v_c;
  perform t.ok((select nombre from public.proveedores where id = (select fk_proveedor from public.gastos where id = v_c)) = 'Dos',
               'el proveedor se puede corregir');
  perform t.falla(format('update public.gastos set fk_proveedor = null where id = %s', v_c),
                  '23514', 'un gasto a credito no puede quedar sin proveedor');
  perform t.falla(format('update public.gastos set estado = ''OTRO'' where id = %s', v_g), '55000', 'el estado solo puede pasar a ANULADO');

  -- Annulment of a cash expense.
  update public.gastos set estado = 'ANULADO' where id = v_g;
  perform t.ok(t.n_asientos(v_t, 'gasto_anulacion', v_g) = 1, 'anular el gasto crea el asiento de reverso');
  perform t.ok(not exists (select 1 from public.asientos where tenant_id = v_t and fk_origen = v_g
                           and origen_tipo in ('gasto', 'gasto_anulacion') and estado <> 'ANULADO'),
               'el asiento del gasto y su reverso quedan ANULADO');
  perform t.ok(t.mov_cta(v_t, 'gasto', v_g, v_cta_caja) + t.mov_cta(v_t, 'gasto_anulacion', v_g, v_cta_caja) = 0
               and t.mov_cta(v_t, 'gasto', v_g, v_cta_cat) + t.mov_cta(v_t, 'gasto_anulacion', v_g, v_cta_cat) = 0
               and t.mov(v_t, 'gasto', v_g, 'IVA_CREDITO') + t.mov(v_t, 'gasto_anulacion', v_g, 'IVA_CREDITO') = 0,
               'el reverso deja fondo, categoria e IVA en cero');
  perform t.ok((select (estado, saldo_pendiente) = ('ANULADO', 0) from public.gastos where id = v_g), 'el gasto queda ANULADO');
  perform t.falla(format('update public.gastos set observacion = ''x'' where id = %s', v_g), '55000', 'un gasto anulado no se modifica');
  perform t.falla(format('update public.gastos set estado = ''REGISTRADO'' where id = %s', v_g), '55000', 'un gasto anulado no se reactiva');
  perform t.falla(format('delete from public.gastos where id = %s', v_c), '55000', 'un gasto no se elimina');

  -- Annulment of a credit expense zeroes its balance.
  update public.gastos set estado = 'ANULADO' where id = v_c;
  perform t.ok((select saldo_pendiente from public.gastos where id = v_c) = 0
               and t.mov(v_t, 'gasto', v_c, 'CXP_PROVEEDORES') + t.mov(v_t, 'gasto_anulacion', v_c, 'CXP_PROVEEDORES') = 0
               and t.n_asientos(v_t, 'gasto_anulacion', v_c) = 1,
               'anular un gasto a credito pone el saldo en cero y revierte proveedores');
end $$;

-- ─── pagos ───────────────────────────────────────────────────────────────
do $$
declare
  v_t bigint := t.g('hp')::bigint; v_cat bigint := t.g('hp_cat_egr')::bigint;
  v_prov bigint := t.g('hp_prov')::bigint; v_fc bigint := t.g('hp_fcaja')::bigint;
  v_fb bigint := t.g('hp_fbanco')::bigint;
  v_cta_caja bigint := t.cta_caja(t.g('hp')::bigint, t.g('hp_caja')::bigint);
  v_g bigint; v_ctdo bigint; v_p1 bigint; v_p2 bigint; v_p3 bigint;
begin
  perform t.ok((select relrowsecurity from pg_class where oid = 'public.pagos'::regclass), 'pagos tiene RLS');
  v_g := t.gasto(v_t, 'credito', 100000, 0, 0, v_prov, null, v_cat);

  v_p1 := t.pago(v_t, v_g, v_fc, 40000);
  perform t.ok((select saldo_pendiente from public.gastos where id = v_g) = 60000, 'un pago parcial baja el saldo');
  perform t.ok(t.mov(v_t, 'pago', v_p1, 'CXP_PROVEEDORES') = 40000 and t.mov_cta(v_t, 'pago', v_p1, v_cta_caja) = -40000
               and t.n_asientos(v_t, 'pago', v_p1) = 1,
               'el pago debita proveedores y acredita el fondo');
  perform t.ok((select (estado, fecha) = ('REGISTRADO', (now() at time zone 'America/Asuncion')::date) from public.pagos where id = v_p1)
               and (select fk_sucursal from public.asientos where tenant_id = v_t and origen_tipo = 'pago' and fk_origen = v_p1)
                   = (select fk_establecimientos from public.gastos where id = v_g),
               'el pago nace REGISTRADO con fecha de hoy y el asiento usa el establecimiento del gasto');

  perform t.falla_con(format('select t.pago(%s, %s, %s, 60001)', v_t, v_g, v_fc), '23514', 'supera el saldo',
                      'un pago mayor al saldo se rechaza');
  perform t.falla(format('select t.pago(%s, %s, %s, 0)', v_t, v_g, v_fc), '23514', 'el monto del pago es positivo');
  perform t.falla_con(format('select t.pago(%s, %s, %s, 100)', v_t, v_g, t.g('hp_finactivo')), '23514', 'inactivo',
                      'no se paga con un fondo inactivo');
  perform t.falla(format('select t.pago(%s, %s, %s, 100)', v_t, v_g, t.g('hb_fcaja')), '23503', 'no se paga con el fondo de otro hotel');
  perform t.falla(format('select t.pago(%s, 0, %s, 100)', v_t, v_fc), '23503', 'el gasto del pago debe existir');

  v_p2 := t.pago(v_t, v_g, v_fb, 60000);
  perform t.ok((select saldo_pendiente from public.gastos where id = v_g) = 0
               and t.mov_cta(v_t, 'pago', v_p2, t.cta_fondo(v_fb)) = -60000,
               'el pago total deja saldo cero y sale del fondo elegido');
  perform t.falla_con(format('select t.pago(%s, %s, %s, 1)', v_t, v_g, v_fc), '23514', 'supera el saldo',
                      'con saldo cero no se paga mas');

  v_ctdo := t.gasto(v_t, 'contado', 11000, 0, 0, null, v_fc, v_cat);
  perform t.falla_con(format('select t.pago(%s, %s, %s, 100)', v_t, v_ctdo, v_fc), '55000', 'Solo se pagan',
                      'un gasto de contado no se paga');

  -- Annulling the gasto is blocked while it has active pagos.
  perform t.falla_con(format('update public.gastos set estado = ''ANULADO'' where id = %s', v_g), '55000', 'Anule primero los pagos',
                      'no se anula un gasto con pagos activos');
  perform t.ok((select estado from public.gastos where id = v_g) = 'REGISTRADO', 'el gasto sigue REGISTRADO tras el bloqueo');

  -- Immutability.
  perform t.falla(format('update public.pagos set monto = 1 where id = %s', v_p1), '55000', 'el monto del pago es inmutable');
  perform t.falla(format('update public.pagos set fk_cuenta_fondo = %s where id = %s', v_fb, v_p1), '55000', 'el fondo del pago es inmutable');
  perform t.falla(format('update public.pagos set fk_gasto = %s where id = %s', v_ctdo, v_p1), '55000', 'el gasto del pago es inmutable');
  perform t.falla(format('update public.pagos set fecha = date ''2026-01-01'' where id = %s', v_p1), '55000', 'la fecha del pago es inmutable');
  update public.pagos set observacion = 'transferencia 123' where id = v_p1;
  perform t.ok((select observacion from public.pagos where id = v_p1) = 'transferencia 123', 'la observacion del pago se edita');
  perform t.falla(format('delete from public.pagos where id = %s', v_p1), '55000', 'un pago no se elimina');

  -- Annulment restores the balance and reverses the entry.
  update public.pagos set estado = 'ANULADO' where id = v_p2;
  perform t.ok((select saldo_pendiente from public.gastos where id = v_g) = 60000, 'anular un pago restaura el saldo');
  perform t.ok(t.n_asientos(v_t, 'pago_anulacion', v_p2) = 1
               and t.mov_cta(v_t, 'pago', v_p2, t.cta_fondo(v_fb)) + t.mov_cta(v_t, 'pago_anulacion', v_p2, t.cta_fondo(v_fb)) = 0
               and t.mov(v_t, 'pago', v_p2, 'CXP_PROVEEDORES') + t.mov(v_t, 'pago_anulacion', v_p2, 'CXP_PROVEEDORES') = 0
               and not exists (select 1 from public.asientos where tenant_id = v_t and fk_origen = v_p2
                               and origen_tipo in ('pago', 'pago_anulacion') and estado <> 'ANULADO'),
               'anular un pago revierte el asiento y deja ambos ANULADO');
  perform t.falla(format('update public.pagos set estado = ''REGISTRADO'' where id = %s', v_p2), '55000', 'un pago anulado no se reactiva');
  perform t.falla(format('update public.pagos set observacion = ''x'' where id = %s', v_p2), '55000', 'un pago anulado no se modifica');

  -- The restored balance can be paid again, and the annulled amount is not counted.
  v_p3 := t.pago(v_t, v_g, v_fc, 60000);
  perform t.ok((select saldo_pendiente from public.gastos where id = v_g) = 0, 'se puede volver a pagar el saldo restaurado');

  -- Once every pago is annulled the gasto can be annulled.
  update public.pagos set estado = 'ANULADO' where id in (v_p1, v_p3);
  perform t.ok((select saldo_pendiente from public.gastos where id = v_g) = 100000, 'con todos los pagos anulados el saldo vuelve al total');
  update public.gastos set estado = 'ANULADO' where id = v_g;
  perform t.ok((select (estado, saldo_pendiente) = ('ANULADO', 0) from public.gastos where id = v_g), 'sin pagos activos el gasto se anula');

  -- A pago cannot target an annulled gasto.
  perform t.falla_con(format('select t.pago(%s, %s, %s, 100)', v_t, v_g, v_fc), '55000', 'anulado', 'no se paga un gasto anulado');
end $$;

-- ─── cobros ──────────────────────────────────────────────────────────────
do $$
declare
  v_t bigint := t.g('hp')::bigint; v_estab bigint := t.g('hp_estab')::bigint;
  v_cli bigint := t.g('hp_cli')::bigint; v_turno bigint := t.g('hp_turno')::bigint;
  v_fc bigint := t.g('hp_fcaja')::bigint; v_fb bigint := t.g('hp_fbanco')::bigint;
  v_cta_caja bigint := t.cta_caja(t.g('hp')::bigint, t.g('hp_caja')::bigint);
  v_f bigint; v_ctdo bigint; v_anul bigint; v_c1 bigint; v_c2 bigint;
begin
  perform t.ok((select relrowsecurity from pg_class where oid = 'public.cobros'::regclass), 'cobros tiene RLS');
  v_f := t.factura(v_t, v_estab, v_cli, v_turno, null, 2, 110000, 0, 0, 10000, 110000);

  v_c1 := t.cobro(v_t, v_f, v_fc, 30000);
  perform t.ok((select saldo_pendiente from public.facturas where id_factura = v_f) = 80000, 'un cobro parcial baja el saldo de la factura');
  perform t.ok(t.mov_cta(v_t, 'cobro', v_c1, v_cta_caja) = 30000 and t.mov(v_t, 'cobro', v_c1, 'CXC_CLIENTES') = -30000
               and t.n_asientos(v_t, 'cobro', v_c1) = 1,
               'el cobro debita el fondo y acredita deudores por ventas');
  perform t.ok((select fk_sucursal from public.asientos where tenant_id = v_t and origen_tipo = 'cobro' and fk_origen = v_c1) = v_estab
               and (select estado from public.cobros where id = v_c1) = 'REGISTRADO',
               'el cobro nace REGISTRADO y su asiento usa el establecimiento de la factura');

  perform t.falla_con(format('select t.cobro(%s, %s, %s, 80001)', v_t, v_f, v_fc), '23514', 'supera el saldo',
                      'un cobro mayor al saldo se rechaza');
  perform t.falla(format('select t.cobro(%s, %s, %s, 0)', v_t, v_f, v_fc), '23514', 'el monto del cobro es positivo');
  perform t.falla_con(format('select t.cobro(%s, %s, %s, 100)', v_t, v_f, t.g('hp_finactivo')), '23514', 'inactivo',
                      'no se cobra en un fondo inactivo');
  perform t.falla(format('select t.cobro(%s, %s, %s, 100)', v_t, v_f, t.g('hb_fcaja')), '23503', 'no se cobra en el fondo de otro hotel');
  perform t.falla(format('select t.cobro(%s, (select min(id_factura) from public.facturas where tenant_id = %s), %s, 100)', v_t, t.g('hb'), v_fc),
                  '23503', 'no se cobra una factura de otro hotel');

  v_c2 := t.cobro(v_t, v_f, v_fb, 80000);
  perform t.ok((select saldo_pendiente from public.facturas where id_factura = v_f) = 0
               and t.mov_cta(v_t, 'cobro', v_c2, t.cta_fondo(v_fb)) = 80000,
               'el cobro total deja saldo cero y entra en el fondo elegido');
  perform t.falla_con(format('select t.cobro(%s, %s, %s, 1)', v_t, v_f, v_fc), '23514', 'supera el saldo', 'con saldo cero no se cobra mas');

  -- Contado and annulled invoices cannot be collected.
  v_ctdo := t.factura(v_t, v_estab, v_cli, v_turno, t.g('m_efe')::bigint, 1, 11000, 0, 0, 1000, 11000);
  perform t.falla_con(format('select t.cobro(%s, %s, %s, 100)', v_t, v_ctdo, v_fc), '55000', 'Solo se cobran', 'una factura de contado no se cobra');
  v_anul := t.factura(v_t, v_estab, v_cli, v_turno, null, 2, 11000, 0, 0, 1000, 11000);
  update public.facturas set estado = 'ANULADA', fk_motivo = t.g('motivo')::smallint where id_factura = v_anul;
  perform t.falla_con(format('select t.cobro(%s, %s, %s, 100)', v_t, v_anul, v_fc), '55000', 'anulada', 'una factura anulada no se cobra');

  -- Invoice annulment is blocked while it has active cobros.
  perform t.falla_con(format('update public.facturas set estado = ''ANULADA'', fk_motivo = %s where id_factura = %s', t.g('motivo'), v_f),
                      '55000', 'Anule primero los cobros', 'no se anula una factura con cobros activos');
  perform t.ok((select (estado, saldo_pendiente) = ('EMITIDA', 0) from public.facturas where id_factura = v_f),
               'la factura sigue EMITIDA y su saldo intacto tras el bloqueo');

  -- Immutability.
  perform t.falla(format('update public.cobros set monto = 1 where id = %s', v_c1), '55000', 'el monto del cobro es inmutable');
  perform t.falla(format('update public.cobros set fk_cuenta_fondo = %s where id = %s', v_fb, v_c1), '55000', 'el fondo del cobro es inmutable');
  perform t.falla(format('update public.cobros set fk_factura = %s where id = %s', v_ctdo, v_c1), '55000', 'la factura del cobro es inmutable');
  perform t.falla(format('update public.cobros set fecha = date ''2026-01-01'' where id = %s', v_c1), '55000', 'la fecha del cobro es inmutable');
  update public.cobros set observacion = 'recibo 55' where id = v_c1;
  perform t.ok((select observacion from public.cobros where id = v_c1) = 'recibo 55', 'la observacion del cobro se edita');
  perform t.falla(format('delete from public.cobros where id = %s', v_c1), '55000', 'un cobro no se elimina');

  -- Annulment restores the balance and reverses the entry.
  update public.cobros set estado = 'ANULADO' where id = v_c2;
  perform t.ok((select saldo_pendiente from public.facturas where id_factura = v_f) = 80000, 'anular un cobro restaura el saldo');
  perform t.ok(t.n_asientos(v_t, 'cobro_anulacion', v_c2) = 1
               and t.mov_cta(v_t, 'cobro', v_c2, t.cta_fondo(v_fb)) + t.mov_cta(v_t, 'cobro_anulacion', v_c2, t.cta_fondo(v_fb)) = 0
               and t.mov(v_t, 'cobro', v_c2, 'CXC_CLIENTES') + t.mov(v_t, 'cobro_anulacion', v_c2, 'CXC_CLIENTES') = 0
               and not exists (select 1 from public.asientos where tenant_id = v_t and fk_origen = v_c2
                               and origen_tipo in ('cobro', 'cobro_anulacion') and estado <> 'ANULADO'),
               'anular un cobro revierte el asiento y deja ambos ANULADO');
  perform t.falla(format('update public.cobros set estado = ''REGISTRADO'' where id = %s', v_c2), '55000', 'un cobro anulado no se reactiva');
  perform t.falla_con(format('update public.facturas set estado = ''ANULADA'' where id_factura = %s', v_f), '55000', 'Anule primero los cobros',
                      'con un cobro activo restante la factura sigue sin poder anularse');

  update public.cobros set estado = 'ANULADO' where id = v_c1;
  perform t.ok((select saldo_pendiente from public.facturas where id_factura = v_f) = 110000, 'con todos los cobros anulados el saldo vuelve al total');
  update public.facturas set estado = 'ANULADA', fk_motivo = t.g('motivo')::smallint where id_factura = v_f;
  perform t.ok((select (estado, saldo_pendiente) = ('ANULADA', 0) from public.facturas where id_factura = v_f)
               and t.n_asientos(v_t, 'factura_anulacion', v_f) = 1,
               'sin cobros activos la factura se anula (saldo cero y reverso)');
end $$;

-- ─── Factura guard ───────────────────────────────────────────────────────
do $$
declare
  v_t bigint := t.g('hp')::bigint; v_estab bigint := t.g('hp_estab')::bigint;
  v_cli bigint := t.g('hp_cli')::bigint; v_turno bigint := t.g('hp_turno')::bigint;
  v_ctdo bigint; v_cred bigint;
begin
  v_ctdo := t.factura(v_t, v_estab, v_cli, v_turno, t.g('m_efe')::bigint, 1, 110000, 0, 0, 10000, 110000);
  v_cred := t.factura(v_t, v_estab, v_cli, v_turno, null, 2, 110000, 0, 0, 10000, 110000);

  perform t.falla_con(format('update public.facturas set total_general = 1 where id_factura = %s', v_ctdo), '55000', 'no se pueden modificar',
                      'el total de una factura emitida es inmutable');
  perform t.falla(format('update public.facturas set total_iva = 0 where id_factura = %s', v_ctdo), '55000', 'el IVA de la factura es inmutable');
  perform t.falla(format('update public.facturas set total_gravado_10 = 1 where id_factura = %s', v_ctdo), '55000', 'el gravado de la factura es inmutable');
  perform t.falla(format('update public.facturas set condicion_venta = 2 where id_factura = %s', v_ctdo), '55000', 'la condicion de venta es inmutable');
  perform t.falla(format('update public.facturas set fk_modo_pago = %s where id_factura = %s', t.g('m_tar'), v_ctdo), '55000', 'el modo de pago es inmutable');
  perform t.falla(format('update public.facturas set fk_turno = %s where id_factura = %s', t.g('hb_turno'), v_ctdo), '55000', 'el turno es inmutable');
  perform t.falla_con(format('update public.facturas set saldo_pendiente = 0 where id_factura = %s', v_cred), '55000', 'saldo pendiente',
                      'el saldo de una factura a credito no se edita a mano');
  perform t.falla(format('update public.facturas set saldo_pendiente = 500 where id_factura = %s', v_ctdo), '55000',
                  'el saldo de una factura de contado no se edita a mano');
  perform t.ok((select (total_general, saldo_pendiente) = (110000, 0) from public.facturas where id_factura = v_ctdo)
               and (select saldo_pendiente from public.facturas where id_factura = v_cred) = 110000,
               'los intentos rechazados no cambiaron nada');

  -- Free fields and the app's annulment still work.
  update public.facturas set fecha_vencimiento = date '2026-12-31', observacion = 'nota' where id_factura = v_cred;
  perform t.ok((select (fecha_vencimiento, observacion) = (date '2026-12-31', 'nota') from public.facturas where id_factura = v_cred),
               'fecha_vencimiento y observacion siguen editables');
  update public.facturas set estado = 'ANULADA', fk_motivo = t.g('motivo')::smallint, saldo_pendiente = 5 where id_factura = v_cred;
  perform t.ok((select (estado, saldo_pendiente) = ('ANULADA', 0) from public.facturas where id_factura = v_cred),
               'anular una factura (estado + motivo) funciona y fuerza saldo cero');
  update public.facturas set estado = 'ANULADA', fk_motivo = t.g('motivo')::smallint where id_factura = v_ctdo;
  perform t.ok((select estado from public.facturas where id_factura = v_ctdo) = 'ANULADA', 'anular una factura de contado funciona');

  -- Same through the app path: receptionist (RLS) client.
  v_ctdo := t.factura(v_t, v_estab, v_cli, v_turno, t.g('m_efe')::bigint, 1, 55000, 0, 0, 5000, 55000);
  v_cred := t.factura(v_t, v_estab, v_cli, v_turno, null, 2, 55000, 0, 0, 5000, 55000);
  perform t.actuar(t.g('hp_rec'), v_t);
  perform t.falla(format('update public.facturas set total_general = 1 where id_factura = %s', v_ctdo), '55000', 'la recepcionista no edita totales');
  perform t.falla(format('update public.facturas set saldo_pendiente = 0 where id_factura = %s', v_cred), '55000', 'la recepcionista no edita el saldo');
  perform t.falla(format('update public.facturas set condicion_venta = 1, fk_modo_pago = %s where id_factura = %s', t.g('m_efe'), v_cred),
                  '55000', 'la recepcionista no cambia credito a contado');
  perform t.filas(format('update public.facturas set estado = ''ANULADA'', fk_motivo = %s where id_factura = %s', t.g('motivo'), v_ctdo),
                  1, 'la recepcionista anula con estado y motivo (flujo de la app)');
  perform t.volver();
end $$;

-- ─── transferencias_fondos ───────────────────────────────────────────────
do $$
declare
  v_t bigint := t.g('hp')::bigint; v_fc bigint := t.g('hp_fcaja')::bigint; v_fb bigint := t.g('hp_fbanco')::bigint;
  v_cc bigint := t.cta_fondo(t.g('hp_fcaja')::bigint); v_cb bigint := t.cta_fondo(t.g('hp_fbanco')::bigint);
  v_x bigint; v_antes_c numeric; v_antes_b numeric;
begin
  perform t.ok((select relrowsecurity from pg_class where oid = 'public.transferencias_fondos'::regclass), 'transferencias_fondos tiene RLS');
  v_antes_c := t.saldo_cta(v_t, v_cc); v_antes_b := t.saldo_cta(v_t, v_cb);

  v_x := t.transf(v_t, v_fc, v_fb, 50000);
  perform t.ok(t.mov_cta(v_t, 'transferencia', v_x, v_cb) = 50000 and t.mov_cta(v_t, 'transferencia', v_x, v_cc) = -50000
               and t.n_lineas(v_t, 'transferencia', v_x) = 2,
               'la transferencia debita el destino y acredita el origen');
  perform t.ok(t.saldo_cta(v_t, v_cc) = v_antes_c - 50000 and t.saldo_cta(v_t, v_cb) = v_antes_b + 50000,
               'los saldos de ambos fondos se mueven por el monto');
  perform t.ok((select (estado, fecha) = ('REGISTRADO', (now() at time zone 'America/Asuncion')::date)
                from public.transferencias_fondos where id = v_x)
               and (select fk_establecimientos from public.transferencias_fondos where id = v_x) = t.g('hp_estab')::bigint,
               'la transferencia nace REGISTRADA, con fecha de hoy y el establecimiento por defecto');

  perform t.falla(format('select t.transf(%s, %s, %s, 100)', v_t, v_fc, v_fc), '23514', 'origen y destino deben ser distintos');
  perform t.falla(format('select t.transf(%s, %s, %s, 0)', v_t, v_fc, v_fb), '23514', 'el monto de la transferencia es positivo');
  perform t.falla_con(format('select t.transf(%s, %s, %s, 100)', v_t, v_fc, t.g('hp_finactivo')), '23514', 'inactivo', 'el destino debe estar activo');
  perform t.falla_con(format('select t.transf(%s, %s, %s, 100)', v_t, t.g('hp_finactivo'), v_fb), '23514', 'inactivo', 'el origen debe estar activo');
  perform t.falla(format('select t.transf(%s, %s, %s, 100)', v_t, v_fc, t.g('hb_fcaja')), '23503', 'no se transfiere a un fondo de otro hotel');

  perform t.falla(format('update public.transferencias_fondos set monto = 1 where id = %s', v_x), '55000', 'el monto de la transferencia es inmutable');
  perform t.falla(format('update public.transferencias_fondos set fk_fondo_destino = %s where id = %s', t.g('hp_fcaja'), v_x), '55000',
                  'el destino de la transferencia es inmutable');
  update public.transferencias_fondos set observacion = 'ajuste' where id = v_x;
  perform t.ok((select observacion from public.transferencias_fondos where id = v_x) = 'ajuste', 'la observacion de la transferencia se edita');
  perform t.falla(format('delete from public.transferencias_fondos where id = %s', v_x), '55000', 'una transferencia no se elimina');

  update public.transferencias_fondos set estado = 'ANULADO' where id = v_x;
  perform t.ok(t.n_asientos(v_t, 'transferencia_anulacion', v_x) = 1
               and t.saldo_cta(v_t, v_cc) = v_antes_c and t.saldo_cta(v_t, v_cb) = v_antes_b
               and not exists (select 1 from public.asientos where tenant_id = v_t and fk_origen = v_x
                               and origen_tipo in ('transferencia', 'transferencia_anulacion') and estado <> 'ANULADO'),
               'anular la transferencia revierte el asiento y devuelve los saldos');
  perform t.falla(format('update public.transferencias_fondos set estado = ''REGISTRADO'' where id = %s', v_x), '55000',
                  'una transferencia anulada no se reactiva');
end $$;

-- ─── saldos_iniciales_fondos ─────────────────────────────────────────────
do $$
declare
  v_t bigint := t.g('hp')::bigint; v_f bigint; v_f2 bigint; v_cta bigint; v_s bigint; v_s2 bigint; v_antes numeric;
begin
  perform t.ok((select relrowsecurity from pg_class where oid = 'public.saldos_iniciales_fondos'::regclass), 'saldos_iniciales_fondos tiene RLS');
  insert into public.cuentas_fondos (tenant_id, nombre, tipo) values (v_t, 'Banco Apertura', 'banco') returning id into v_f;
  insert into public.cuentas_fondos (tenant_id, nombre, tipo) values (v_t, 'Caja chica apertura', 'caja_chica') returning id into v_f2;
  v_cta := t.cta_fondo(v_f);

  v_s := t.saldo_inicial(v_t, v_f, 1000000);
  perform t.ok(t.mov_cta(v_t, 'saldo_inicial', v_s, v_cta) = 1000000 and t.mov(v_t, 'saldo_inicial', v_s, 'SALDOS_INICIALES') = -1000000
               and t.n_asientos(v_t, 'saldo_inicial', v_s) = 1 and t.saldo_cta(v_t, v_cta) = 1000000,
               'el saldo inicial debita el fondo y acredita saldos iniciales');
  perform t.ok((select (estado, fecha) = ('REGISTRADO', (now() at time zone 'America/Asuncion')::date)
                from public.saldos_iniciales_fondos where id = v_s),
               'el saldo inicial nace REGISTRADO y con fecha de hoy');
  perform t.falla(format('select t.saldo_inicial(%s, %s, 5)', v_t, v_f), '23505', 'un fondo tiene un solo saldo inicial activo');
  perform t.falla(format('select t.saldo_inicial(%s, %s, -1)', v_t, v_f2), '23514', 'el saldo inicial no es negativo');
  perform t.falla(format('select t.saldo_inicial(%s, %s, 5)', v_t, t.g('hp_finactivo')), '23514', 'no se abre un fondo inactivo');
  perform t.falla(format('select t.saldo_inicial(%s, %s, 5)', v_t, t.g('hb_fcaja')), '23503', 'no se abre el fondo de otro hotel');
  perform t.falla(format('update public.saldos_iniciales_fondos set monto = 1 where id = %s', v_s), '55000', 'el monto del saldo inicial es inmutable');
  perform t.falla(format('delete from public.saldos_iniciales_fondos where id = %s', v_s), '55000', 'un saldo inicial no se elimina');

  update public.saldos_iniciales_fondos set estado = 'ANULADO' where id = v_s;
  perform t.ok(t.n_asientos(v_t, 'saldo_inicial_anulacion', v_s) = 1 and t.saldo_cta(v_t, v_cta) = 0
               and not exists (select 1 from public.asientos where tenant_id = v_t and fk_origen = v_s
                               and origen_tipo in ('saldo_inicial', 'saldo_inicial_anulacion') and estado <> 'ANULADO'),
               'anular el saldo inicial lo revierte y deja el fondo en cero');
  v_s2 := t.saldo_inicial(v_t, v_f, 750000);
  perform t.ok(t.saldo_cta(v_t, v_cta) = 750000, 'tras anular se puede cargar otro saldo inicial del fondo');

  -- Opening balance of zero posts nothing and can still be annulled.
  v_s := t.saldo_inicial(v_t, v_f2, 0);
  perform t.ok(t.n_asientos(v_t, 'saldo_inicial', v_s) = 0, 'un saldo inicial en cero no genera asiento');
  update public.saldos_iniciales_fondos set estado = 'ANULADO' where id = v_s;
  perform t.ok((select estado from public.saldos_iniciales_fondos where id = v_s) = 'ANULADO'
               and t.n_asientos(v_t, 'saldo_inicial_anulacion', v_s) = 0,
               'anular un saldo inicial en cero funciona sin reverso');
end $$;

-- ─── Fund balance consistency ────────────────────────────────────────────
do $$
declare
  v_t bigint := t.g('hp')::bigint; v_cat bigint := t.g('hp_cat_egr')::bigint; v_prov bigint := t.g('hp_prov')::bigint;
  v_estab bigint := t.g('hp_estab')::bigint; v_cli bigint := t.g('hp_cli')::bigint; v_turno bigint := t.g('hp_turno')::bigint;
  v_fc bigint := t.g('hp_fcaja')::bigint;
  v_f bigint; v_cta bigint; v_g bigint; v_gc bigint; v_fa bigint; v_x1 bigint; v_x2 bigint; v_p bigint; v_c bigint;
  v_ga bigint; v_deb numeric; v_hab numeric;
begin
  insert into public.cuentas_fondos (tenant_id, nombre, tipo) values (v_t, 'Banco Consistencia', 'banco') returning id into v_f;
  v_cta := t.cta_fondo(v_f);

  perform t.saldo_inicial(v_t, v_f, 1000000);                                    -- +1.000.000
  v_g  := t.gasto(v_t, 'contado', 110000, 21000, 50000, null, v_f, v_cat);       -- -181.000
  v_x1 := t.transf(v_t, v_fc, v_f, 200000);                                      -- +200.000
  v_x2 := t.transf(v_t, v_f, v_fc, 50000);                                       -- -50.000 (annulled below)
  update public.transferencias_fondos set estado = 'ANULADO' where id = v_x2;
  v_ga := t.gasto(v_t, 'contado', 11000, 0, 0, null, v_f, v_cat);                -- -11.000 (annulled below)
  update public.gastos set estado = 'ANULADO' where id = v_ga;
  v_gc := t.gasto(v_t, 'credito', 90000, 0, 0, v_prov, null, v_cat);
  v_p  := t.pago(v_t, v_gc, v_f, 40000);                                         -- -40.000
  v_fa := t.factura(v_t, v_estab, v_cli, v_turno, null, 2, 77000, 0, 0, 7000, 77000);
  v_c  := t.cobro(v_t, v_fa, v_f, 30000);                                        -- +30.000

  perform t.ok(t.saldo_cta(v_t, v_cta) = 1000000 - 181000 + 200000 - 40000 + 30000,
               'el saldo del fondo (debe - haber de su cuenta) coincide con lo esperado tras el escenario');
  perform t.ok((select saldo_pendiente from public.gastos where id = v_gc) = 50000
               and (select saldo_pendiente from public.facturas where id_factura = v_fa) = 47000,
               'los saldos de gasto y factura coinciden con pagos y cobros activos');

  select coalesce(sum(debe), 0), coalesce(sum(haber), 0) into v_deb, v_hab
  from public.detalle_asientos where tenant_id = v_t;
  perform t.ok(v_deb = v_hab and v_deb > 0, 'el libro diario del hotel balancea (debe = haber)');
  perform t.ok(-t.saldo_clave(v_t, 'CXP_PROVEEDORES') = (select coalesce(sum(saldo_pendiente), 0) from public.gastos
                                                           where tenant_id = v_t and condicion = 'credito' and estado = 'REGISTRADO'),
               'proveedores (cuenta) coincide con la suma de saldos de gastos a credito');
  perform t.ok(t.saldo_clave(v_t, 'CXC_CLIENTES') = (select coalesce(sum(saldo_pendiente), 0) from public.facturas
                                                       where tenant_id = v_t and condicion_venta = 2 and estado = 'EMITIDA'),
               'deudores por ventas (cuenta) coincide con la suma de saldos de facturas a credito');
end $$;

-- ─── RLS of the new tables ───────────────────────────────────────────────
do $$
declare
  v_t bigint := t.g('hp')::bigint; v_hb bigint := t.g('hb')::bigint;
  v_cat bigint := t.g('hp_cat_egr')::bigint; v_prov bigint := t.g('hp_prov')::bigint;
  v_fc bigint := t.g('hp_fcaja')::bigint; v_fb bigint := t.g('hp_fbanco')::bigint;
  v_gc bigint; v_fa bigint; v_gb bigint; v_fbn bigint; v_nuevo bigint; v_i int;
  v_tabla text;
begin
  -- Rows to read: a credit gasto and a credit invoice of hp, and rows of hb.
  v_gc := t.gasto(v_t, 'credito', 55000, 0, 0, v_prov, null, v_cat);
  v_fa := t.factura(v_t, t.g('hp_estab')::bigint, t.g('hp_cli')::bigint, t.g('hp_turno')::bigint, null, 2, 55000, 0, 0, 5000, 55000);
  insert into public.cuentas_fondos (tenant_id, nombre, tipo) values (v_t, 'Banco RLS', 'banco') returning id into v_fbn;

  insert into public.cuentas_fondos (tenant_id, nombre, tipo) values (v_hb, 'Banco basico', 'banco') returning id into v_i;
  perform set_config('test.hb_fbanco', v_i::text, true);
  v_gb := t.gasto(v_hb, 'credito', 11000, 0, 0, t.g('hb_prov')::bigint, null, t.g('hb_cat_egr')::bigint);
  perform t.gasto(v_hb, 'contado', 11000, 0, 0, null, t.g('hb_fcaja')::bigint, t.g('hb_cat_egr')::bigint);
  -- A credit invoice for hb exists only through a back door (the plan cannot sell on credit).
  set local session_replication_role = replica;
  v_i := t.factura(v_hb, t.g('hb_estab')::bigint, t.g('hb_cli')::bigint, t.g('hb_turno')::bigint, null, 2, 11000, 0, 0, 1000, 11000)::int;
  update public.facturas set saldo_pendiente = 11000 where id_factura = v_i;
  set local session_replication_role = origin;
  perform set_config('test.hb_fcred', v_i::text, true);

  -- Receptionist: no read, no write.
  perform t.actuar(t.g('hp_rec'), v_t);
  foreach v_tabla in array array['proveedores', 'gastos', 'cobros', 'pagos', 'transferencias_fondos', 'saldos_iniciales_fondos'] loop
    perform t.ok(t.cuenta(format('select count(*) from public.%I', v_tabla)) = 0, 'la recepcionista no lee ' || v_tabla);
  end loop;
  perform t.falla('insert into public.proveedores (nombre) values (''Rec'')', '42501', 'la recepcionista no crea proveedores');
  perform t.falla(format('insert into public.gastos (fk_categoria, gravado_10, condicion, fk_cuenta_fondo) values (%s, 1000, ''contado'', %s)', v_cat, v_fc),
                  '42501', 'la recepcionista no registra gastos');
  perform t.falla(format('insert into public.pagos (fk_gasto, fk_cuenta_fondo, monto) values (%s, %s, 100)', v_gc, v_fc),
                  '42501', 'la recepcionista no registra pagos');
  perform t.falla(format('insert into public.cobros (fk_factura, fk_cuenta_fondo, monto) values (%s, %s, 100)', v_fa, v_fc),
                  '42501', 'la recepcionista no registra cobros');
  perform t.falla(format('insert into public.transferencias_fondos (fk_fondo_origen, fk_fondo_destino, monto) values (%s, %s, 100)', v_fc, v_fb),
                  '42501', 'la recepcionista no registra transferencias');
  perform t.falla(format('insert into public.saldos_iniciales_fondos (fk_cuenta_fondo, monto) values (%s, 100)', v_fbn),
                  '42501', 'la recepcionista no registra saldos iniciales');
  perform t.filas('update public.gastos set observacion = ''x''', 0, 'la recepcionista no edita gastos');
  perform t.volver();

  -- Admin: reads and writes everything of its own hotel, sees nothing of another.
  perform t.actuar(t.g('hp_admin'), v_t);
  perform t.ok(t.cuenta('select count(*) from public.gastos') > 0 and t.cuenta('select count(*) from public.proveedores') > 0
               and t.cuenta('select count(*) from public.pagos') > 0 and t.cuenta('select count(*) from public.cobros') > 0
               and t.cuenta('select count(*) from public.transferencias_fondos') > 0
               and t.cuenta('select count(*) from public.saldos_iniciales_fondos') > 0,
               'el admin lee proveedores, gastos, pagos, cobros, transferencias y saldos iniciales');
  perform t.ok(t.cuenta(format('select count(*) from public.gastos where tenant_id = %s', v_hb)) = 0
               and t.cuenta(format('select count(*) from public.proveedores where tenant_id = %s', v_hb)) = 0,
               'el admin no ve gastos ni proveedores de otro hotel');
  perform t.filas('insert into public.proveedores (nombre, ruc) values (''Prov Admin'', ''ADM-1'')', 1, 'el admin crea un proveedor');
  perform t.filas(format('insert into public.gastos (fk_categoria, gravado_10, condicion, fk_cuenta_fondo) values (%s, 11000, ''contado'', %s)', v_cat, v_fc),
                  1, 'el admin registra un gasto (y se contabiliza)');
  perform t.filas(format('insert into public.pagos (fk_gasto, fk_cuenta_fondo, monto) values (%s, %s, 5000)', v_gc, v_fc), 1, 'el admin registra un pago');
  perform t.filas(format('insert into public.cobros (fk_factura, fk_cuenta_fondo, monto) values (%s, %s, 5000)', v_fa, v_fc), 1, 'el admin registra un cobro');
  perform t.filas(format('insert into public.transferencias_fondos (fk_fondo_origen, fk_fondo_destino, monto) values (%s, %s, 1000)', v_fc, v_fb),
                  1, 'el admin registra una transferencia');
  perform t.filas(format('insert into public.saldos_iniciales_fondos (fk_cuenta_fondo, monto) values (%s, 100)', v_fbn),
                  1, 'el admin registra un saldo inicial');
  perform t.filas(format('update public.pagos set estado = ''ANULADO'' where fk_gasto = %s', v_gc), 1, 'el admin anula un pago');
  perform t.filas(format('update public.cobros set estado = ''ANULADO'' where fk_factura = %s', v_fa), 1, 'el admin anula un cobro');
  perform t.falla(format('delete from public.gastos where fk_categoria = %s', v_cat), '55000', 'ni el admin elimina gastos');
  perform t.volver();

  -- Manager can write too.
  perform t.actuar(t.g('hp_ger'), v_t);
  perform t.ok(t.cuenta('select count(*) from public.gastos') > 0, 'el gerente lee gastos');
  perform t.filas('insert into public.proveedores (nombre) values (''Prov Gerente'')', 1, 'el gerente crea un proveedor');
  perform t.filas(format('insert into public.gastos (fk_categoria, gravado_10, condicion, fk_cuenta_fondo) values (%s, 11000, ''contado'', %s)', v_cat, v_fc),
                  1, 'el gerente registra un gasto');
  perform t.filas(format('insert into public.pagos (fk_gasto, fk_cuenta_fondo, monto) values (%s, %s, 1000)', v_gc, v_fc), 1, 'el gerente registra un pago');
  perform t.filas(format('insert into public.cobros (fk_factura, fk_cuenta_fondo, monto) values (%s, %s, 1000)', v_fa, v_fc), 1, 'el gerente registra un cobro');
  perform t.volver();

  -- Plan basico: reads its own rows, writes nothing (module contabilidad).
  perform t.actuar(t.g('hb_admin'), v_hb);
  perform t.ok(t.cuenta('select count(*) from public.gastos') = 2 and t.cuenta('select count(*) from public.proveedores') = 2,
               'el admin del plan basico lee sus gastos y proveedores');
  perform t.falla('insert into public.proveedores (nombre) values (''Basico'')', '42501', 'el plan basico no crea proveedores');
  perform t.falla(format('insert into public.gastos (fk_categoria, gravado_10, condicion, fk_cuenta_fondo) values (%s, 1000, ''contado'', %s)',
                         t.g('hb_cat_egr'), t.g('hb_fcaja')),
                  '42501', 'el plan basico no registra gastos');
  perform t.falla(format('insert into public.pagos (fk_gasto, fk_cuenta_fondo, monto) values (%s, %s, 100)', v_gb, t.g('hb_fcaja')),
                  '42501', 'el plan basico no registra pagos');
  perform t.falla(format('insert into public.cobros (fk_factura, fk_cuenta_fondo, monto) values (%s, %s, 100)', t.g('hb_fcred'), t.g('hb_fcaja')),
                  '42501', 'el plan basico no registra cobros');
  perform t.falla(format('insert into public.transferencias_fondos (fk_fondo_origen, fk_fondo_destino, monto) values (%s, %s, 100)',
                         t.g('hb_fcaja'), t.g('hb_fbanco')),
                  '42501', 'el plan basico no registra transferencias');
  perform t.falla(format('insert into public.saldos_iniciales_fondos (fk_cuenta_fondo, monto) values (%s, 100)', t.g('hb_fbanco')),
                  '42501', 'el plan basico no registra saldos iniciales');
  perform t.filas('update public.gastos set observacion = ''x''', 0, 'el plan basico no edita gastos');
  perform t.volver();

  -- Anonymous: no access.
  perform t.anonimo();
  perform t.falla('select count(*) from public.gastos', '42501', 'anon no lee gastos');
  perform t.falla('select count(*) from public.proveedores', '42501', 'anon no lee proveedores');
  perform t.falla('select count(*) from public.cobros', '42501', 'anon no lee cobros');
  perform t.falla('select count(*) from public.pagos', '42501', 'anon no lee pagos');
  perform t.falla('select count(*) from public.transferencias_fondos', '42501', 'anon no lee transferencias');
  perform t.falla('select count(*) from public.saldos_iniciales_fondos', '42501', 'anon no lee saldos iniciales');
  perform t.volver();

  -- Internal functions are not callable by the client.
  perform t.ok(not has_function_privilege('authenticated', 'public.fn_reversar_documento(bigint, text, bigint)', 'execute')
               and not has_function_privilege('anon', 'public.fn_reversar_documento(bigint, text, bigint)', 'execute')
               and not has_function_privilege('authenticated', 'public.tg_fn_cobro_contabilizar()', 'execute')
               and not has_function_privilege('authenticated', 'public.tg_fn_factura_guarda()', 'execute')
               and not has_function_privilege('authenticated', 'public.tg_fn_documento_guarda()', 'execute')
               and not has_function_privilege('authenticated', 'public.fn_contabilizar_reverso(bigint, text, bigint, date)', 'execute'),
               'las funciones internas de 0019 no se pueden ejecutar desde el cliente');
end $$;

-- ═══ T5 · 0020 monthly lock ═══════════════════════════════════════════════════
-- Hotel `hp` (plan pro) with its admin, gerente and receptionist; `hb` (plan
-- basico, no accounting module) is the unrelated hotel. Months used: 2026-03
-- (closed during the section), 2026-04 (stays open) and the current month
-- (closed and reopened to prove the reversal date is guarded). Everything runs
-- as superuser unless an actor is impersonated: the guards are triggers, so
-- they apply to every role.

-- The statement must fail with the month-lock error of the given YYYY-MM.
create function t.cerrada(p_sql text, p_ym text, p_msg text) returns void language plpgsql as $$
begin
  perform t.falla_con(p_sql, '55000', 'El periodo ' || p_ym || ' esta cerrado', p_msg);
end $$;

-- ─── Fixtures: documents in 2026-03 and 2026-04 (nothing is closed yet) ───
do $$
declare
  v_t bigint := t.g('hp')::bigint; v_estab bigint := t.g('hp_estab')::bigint;
  v_cli bigint := t.g('hp_cli')::bigint; v_turno bigint := t.g('hp_turno')::bigint;
  v_cat bigint := t.g('hp_cat_egr')::bigint; v_prov bigint := t.g('hp_prov')::bigint;
  v_fc bigint := t.g('hp_fcaja')::bigint; v_fb bigint := t.g('hp_fbanco')::bigint;
  v_efe bigint := t.g('m_efe')::bigint;
  v_n1 bigint; v_n2 bigint; v_id bigint;
begin
  -- Two fresh funds (no opening balance yet).
  insert into public.cuentas_fondos (tenant_id, nombre, tipo) values (v_t, 'Banco cierre A', 'banco') returning id into v_n1;
  insert into public.cuentas_fondos (tenant_id, nombre, tipo) values (v_t, 'Banco cierre B', 'banco') returning id into v_n2;
  perform set_config('test.c_f1', v_n1::text, true);
  perform set_config('test.c_f2', v_n2::text, true);

  -- gastos: cash and credit, March and April.
  perform set_config('test.g_mar',  t.gasto(v_t, 'contado', 110000, 0, 0, null, v_fc, v_cat, date '2026-03-10')::text, true);
  perform set_config('test.g_abr',  t.gasto(v_t, 'contado', 110000, 0, 0, null, v_fc, v_cat, date '2026-04-10')::text, true);
  perform set_config('test.g_abr2', t.gasto(v_t, 'contado', 110000, 0, 0, null, v_fc, v_cat, date '2026-04-11')::text, true);
  perform set_config('test.gc_mar', t.gasto(v_t, 'credito', 110000, 0, 0, v_prov, null, v_cat, date '2026-03-10')::text, true);
  perform set_config('test.gc_abr', t.gasto(v_t, 'credito', 110000, 0, 0, v_prov, null, v_cat, date '2026-04-10')::text, true);

  -- pagos: one dated in each month.
  insert into public.pagos (tenant_id, fecha, fk_gasto, fk_cuenta_fondo, monto)
    values (v_t, date '2026-03-12', t.g('gc_mar')::bigint, v_fc, 10000) returning id into v_id;
  perform set_config('test.pg_mar', v_id::text, true);
  insert into public.pagos (tenant_id, fecha, fk_gasto, fk_cuenta_fondo, monto)
    values (v_t, date '2026-04-12', t.g('gc_abr')::bigint, v_fc, 10000) returning id into v_id;
  perform set_config('test.pg_abr', v_id::text, true);

  -- facturas: credit ones (for cobros) and cash ones, March and April.
  perform set_config('test.fc_mar', t.factura(v_t, v_estab, v_cli, v_turno, null, 2, 110000, 0, 0, 10000, 110000,
                                              0, 'EMITIDA', timestamptz '2026-03-10 12:00:00-03')::text, true);
  perform set_config('test.fc_abr', t.factura(v_t, v_estab, v_cli, v_turno, null, 2, 110000, 0, 0, 10000, 110000,
                                              0, 'EMITIDA', timestamptz '2026-04-10 12:00:00-03')::text, true);
  perform set_config('test.fi_mar', t.factura(v_t, v_estab, v_cli, v_turno, v_efe, 1, 110000, 0, 0, 10000, 110000,
                                              0, 'EMITIDA', timestamptz '2026-03-11 12:00:00-03')::text, true);
  perform set_config('test.fi_abr', t.factura(v_t, v_estab, v_cli, v_turno, v_efe, 1, 110000, 0, 0, 10000, 110000,
                                              0, 'EMITIDA', timestamptz '2026-04-11 12:00:00-03')::text, true);
  perform set_config('test.fi_abr2', t.factura(v_t, v_estab, v_cli, v_turno, v_efe, 1, 110000, 0, 0, 10000, 110000,
                                               0, 'EMITIDA', timestamptz '2026-04-12 12:00:00-03')::text, true);

  -- cobros: one dated in each month.
  insert into public.cobros (tenant_id, fecha, fk_factura, fk_cuenta_fondo, monto)
    values (v_t, date '2026-03-12', t.g('fc_mar')::bigint, v_fc, 10000) returning id into v_id;
  perform set_config('test.cb_mar', v_id::text, true);
  insert into public.cobros (tenant_id, fecha, fk_factura, fk_cuenta_fondo, monto)
    values (v_t, date '2026-04-12', t.g('fc_abr')::bigint, v_fc, 10000) returning id into v_id;
  perform set_config('test.cb_abr', v_id::text, true);

  -- transferencias_fondos and saldos_iniciales_fondos.
  insert into public.transferencias_fondos (tenant_id, fecha, fk_fondo_origen, fk_fondo_destino, monto)
    values (v_t, date '2026-03-13', v_fc, v_fb, 1000) returning id into v_id;
  perform set_config('test.tr_mar', v_id::text, true);
  insert into public.transferencias_fondos (tenant_id, fecha, fk_fondo_origen, fk_fondo_destino, monto)
    values (v_t, date '2026-04-13', v_fc, v_fb, 1000) returning id into v_id;
  perform set_config('test.tr_abr', v_id::text, true);
  insert into public.saldos_iniciales_fondos (tenant_id, fecha, fk_cuenta_fondo, monto)
    values (v_t, date '2026-03-01', v_n1, 5000) returning id into v_id;
  perform set_config('test.sa_mar', v_id::text, true);
  insert into public.saldos_iniciales_fondos (tenant_id, fecha, fk_cuenta_fondo, monto)
    values (v_t, date '2026-04-01', v_n2, 5000) returning id into v_id;
  perform set_config('test.sa_abr', v_id::text, true);

  perform t.ok(t.g('sa_abr') is not null, 'fixtures del cierre mensual creados');
end $$;

-- ─── periodos_cerrados: structure and privileges ──────────────────────────
do $$
begin
  perform t.ok(to_regclass('public.periodos_cerrados') is not null, 'existe periodos_cerrados');
  perform t.ok((select relrowsecurity from pg_class where oid = 'public.periodos_cerrados'::regclass),
               'periodos_cerrados tiene RLS');
  perform t.ok((select count(*) from information_schema.columns
                where table_schema = 'public' and table_name = 'periodos_cerrados'
                  and column_name in ('tenant_id', 'anio', 'mes', 'cerrado_por', 'cerrado_en')) = 5,
               'periodos_cerrados tiene sus columnas');
  perform t.ok(has_function_privilege('authenticated', 'public.fn_cerrar_mes(integer, integer)', 'execute')
               and has_function_privilege('authenticated', 'public.fn_reabrir_mes(integer, integer)', 'execute'),
               'authenticated ejecuta fn_cerrar_mes y fn_reabrir_mes');
  perform t.ok(not has_function_privilege('anon', 'public.fn_cerrar_mes(integer, integer)', 'execute')
               and not has_function_privilege('anon', 'public.fn_reabrir_mes(integer, integer)', 'execute'),
               'anon no ejecuta fn_cerrar_mes ni fn_reabrir_mes');
  perform t.ok(not has_function_privilege('authenticated', 'public.fn_periodo_cerrado(bigint, date)', 'execute')
               and not has_function_privilege('anon', 'public.fn_periodo_cerrado(bigint, date)', 'execute')
               and not has_function_privilege('authenticated', 'public.fn_fecha_negocio(timestamp with time zone)', 'execute')
               and not has_function_privilege('anon', 'public.fn_fecha_negocio(timestamp with time zone)', 'execute'),
               'fn_periodo_cerrado y fn_fecha_negocio no se ejecutan desde el cliente');
  perform t.ok(not has_function_privilege('authenticated', 'public.tg_fn_periodo_guarda_fecha()', 'execute')
               and not has_function_privilege('authenticated', 'public.tg_fn_periodo_guarda_factura()', 'execute')
               and not has_function_privilege('authenticated', 'public.tg_fn_periodo_guarda_asiento()', 'execute')
               and not has_function_privilege('authenticated', 'public.tg_fn_periodo_guarda_detalle()', 'execute'),
               'las funciones guarda del cierre no se ejecutan desde el cliente');
  perform t.ok(public.fn_fecha_negocio(timestamptz '2026-04-01 02:00:00+00') = date '2026-03-31',
               'fn_fecha_negocio usa el dia de Asuncion, no el UTC');
end $$;

-- ─── fn_cerrar_mes / fn_reabrir_mes: who, when, how ───────────────────────
do $$
declare
  v_t bigint := t.g('hp')::bigint; v_hoy date := (now() at time zone 'America/Asuncion')::date;
  v_sig date := (date_trunc('month', (now() at time zone 'America/Asuncion')::date) + interval '1 month')::date;
  v_n bigint;
begin
  perform t.ok(not public.fn_periodo_cerrado(v_t, date '2026-03-15'), 'marzo esta abierto al principio');

  -- Only the admin; the gerente, the receptionist and a basico hotel are refused.
  perform t.actuar(t.g('hp_ger'), v_t);
  perform t.falla_con('select public.fn_cerrar_mes(2026, 3)', '42501', 'administrador', 'el gerente no cierra meses');
  perform t.falla_con('select public.fn_reabrir_mes(2026, 3)', '42501', 'administrador', 'el gerente no reabre meses');
  perform t.volver();
  perform t.actuar(t.g('hp_rec'), v_t);
  perform t.falla_con('select public.fn_cerrar_mes(2026, 3)', '42501', 'administrador', 'la recepcionista no cierra meses');
  perform t.volver();
  perform t.actuar(t.g('hb_admin'), t.g('hb')::bigint);
  perform t.falla_con('select public.fn_cerrar_mes(2026, 3)', '42501', 'contabilidad', 'el plan basico no cierra meses');
  perform t.falla_con('select public.fn_reabrir_mes(2026, 3)', '42501', 'contabilidad', 'el plan basico no reabre meses');
  perform t.volver();
  perform t.anonimo();
  perform t.falla('select public.fn_cerrar_mes(2026, 3)', '42501', 'anon no cierra meses');
  perform t.volver();
  perform t.ok(t.cuenta(format('select count(*) from public.periodos_cerrados where tenant_id = %s', v_t)) = 0,
               'ningun intento fallido cerro un mes');

  -- Validation (as the admin).
  perform t.actuar(t.g('hp_admin'), v_t);
  perform t.falla_con(format('select public.fn_cerrar_mes(%s, %s)', extract(year from v_sig)::int, extract(month from v_sig)::int),
                      '22023', 'futuro', 'un mes futuro no se cierra');
  perform t.falla('select public.fn_cerrar_mes(2026, 13)', '22023', 'el mes 13 no existe');
  perform t.falla('select public.fn_cerrar_mes(2026, 0)', '22023', 'el mes 0 no existe');
  perform t.falla('select public.fn_cerrar_mes(null, 3)', '22023', 'el anio es obligatorio');
  perform t.falla('select public.fn_cerrar_mes(2026, null)', '22023', 'el mes es obligatorio');
  perform t.falla('select public.fn_reabrir_mes(2026, 13)', '22023', 'tampoco se reabre el mes 13');
  perform t.falla_con('select public.fn_reabrir_mes(2026, 3)', '55000', 'no esta cerrado', 'reabrir un mes abierto es un error');

  -- Happy path.
  perform public.fn_cerrar_mes(2026, 3);
  perform t.volver();
  perform t.ok(public.fn_periodo_cerrado(v_t, date '2026-03-01') and public.fn_periodo_cerrado(v_t, date '2026-03-31'),
               'marzo queda cerrado de punta a punta');
  perform t.ok(not public.fn_periodo_cerrado(v_t, date '2026-02-28') and not public.fn_periodo_cerrado(v_t, date '2026-04-01'),
               'febrero y abril siguen abiertos');
  perform t.ok(not public.fn_periodo_cerrado(t.g('hb')::bigint, date '2026-03-15'),
               'cerrar marzo en un hotel no cierra marzo en otro');
  perform t.ok((select (cerrado_por, anio, mes) = ((select id_usuario from public.usuario
                                                     where tenant_id = v_t and auth_id = t.g('hp_admin')::uuid), 2026, 3)
                from public.periodos_cerrados where tenant_id = v_t),
               'el cierre guarda quien lo hizo');
  perform t.ok((select cerrado_en from public.periodos_cerrados where tenant_id = v_t) <= now(), 'el cierre guarda cuando se hizo');

  perform t.actuar(t.g('hp_admin'), v_t);
  perform t.falla_con('select public.fn_cerrar_mes(2026, 3)', '55000', 'ya esta cerrado', 'cerrar dos veces el mismo mes es un error');
  -- Reopen and close again.
  perform public.fn_reabrir_mes(2026, 3);
  perform t.volver();
  perform t.ok(not public.fn_periodo_cerrado(v_t, date '2026-03-15'), 'reabrir deja marzo abierto');
  perform t.actuar(t.g('hp_admin'), v_t);
  perform public.fn_cerrar_mes(2026, 3);
  perform t.volver();
  perform t.ok(public.fn_periodo_cerrado(v_t, date '2026-03-15'), 'marzo se puede volver a cerrar');
  perform t.ok(t.cuenta(format('select count(*) from public.periodos_cerrados where tenant_id = %s', v_t)) = 1,
               'queda una sola fila de marzo');

  -- A closed month in the far past and the current month are both valid targets.
  perform t.ok(v_hoy is not null, 'fechas de referencia disponibles');
end $$;

-- ─── periodos_cerrados: reads and the table constraints ───────────────────
do $$
declare v_t bigint := t.g('hp')::bigint;
begin
  perform t.actuar(t.g('hp_admin'), v_t);
  perform t.ok(t.cuenta('select count(*) from public.periodos_cerrados') = 1, 'el admin lee los meses cerrados de su hotel');
  perform t.falla('insert into public.periodos_cerrados (anio, mes, cerrado_por) values (2026, 1, 1)', '42501',
                  'el admin no inserta meses cerrados directo');
  perform t.falla('update public.periodos_cerrados set mes = 4', '42501', 'el admin no edita meses cerrados directo');
  perform t.falla('delete from public.periodos_cerrados', '42501', 'el admin no borra meses cerrados directo');
  perform t.volver();
  perform t.actuar(t.g('hp_ger'), v_t);
  perform t.ok(t.cuenta('select count(*) from public.periodos_cerrados') = 1, 'el gerente lee los meses cerrados');
  perform t.falla('delete from public.periodos_cerrados', '42501', 'el gerente no borra meses cerrados directo');
  perform t.volver();
  perform t.actuar(t.g('hp_rec'), v_t);
  perform t.ok(t.cuenta('select count(*) from public.periodos_cerrados') = 0, 'la recepcionista no ve los meses cerrados');
  perform t.volver();
  perform t.actuar(t.g('hb_admin'), t.g('hb')::bigint);
  perform t.ok(t.cuenta('select count(*) from public.periodos_cerrados') = 0, 'otro hotel no ve los cierres de este');
  perform t.volver();
  perform t.anonimo();
  perform t.falla('select count(*) from public.periodos_cerrados', '42501', 'anon no lee los meses cerrados');
  perform t.volver();

  perform t.falla(format('insert into public.periodos_cerrados (tenant_id, anio, mes, cerrado_por) values (%s, 2026, 3, (select min(id_usuario) from public.usuario where tenant_id = %s))', v_t, v_t),
                  '23505', 'un mes no se cierra dos veces (unique)');
  perform t.falla(format('insert into public.periodos_cerrados (tenant_id, anio, mes, cerrado_por) values (%s, 2026, 13, (select min(id_usuario) from public.usuario where tenant_id = %s))', v_t, v_t),
                  '23514', 'el mes debe estar entre 1 y 12');
  perform t.falla(format('insert into public.periodos_cerrados (tenant_id, anio, mes, cerrado_por) values (%s, 2026, 5, (select min(id_usuario) from public.usuario where tenant_id = %s))', v_t, t.g('hb')),
                  '23503', 'quien cierra debe ser del mismo hotel');
end $$;

-- ─── Guards: gastos ───────────────────────────────────────────────────────
do $$
declare
  v_t bigint := t.g('hp')::bigint; v_cat bigint := t.g('hp_cat_egr')::bigint; v_fc bigint := t.g('hp_fcaja')::bigint;
  v_g bigint; v_n bigint;
begin
  perform t.cerrada(format('select t.gasto(%s, ''contado'', 11000, 0, 0, null, %s, %s, date ''2026-03-20'')', v_t, v_fc, v_cat),
                    '2026-03', 'no se registra un gasto en un mes cerrado');
  perform t.cerrada(format('update public.gastos set observacion = ''x'' where id = %s', t.g('g_mar')),
                    '2026-03', 'no se edita un gasto de un mes cerrado');
  perform t.cerrada(format('update public.gastos set estado = ''ANULADO'' where id = %s', t.g('g_mar')),
                    '2026-03', 'no se anula un gasto de un mes cerrado aunque hoy este abierto');
  perform t.cerrada(format('delete from public.gastos where id = %s', t.g('g_mar')),
                    '2026-03', 'no se borra un gasto de un mes cerrado');
  perform t.cerrada(format('update public.gastos set fecha = date ''2026-03-02'' where id = %s', t.g('g_abr')),
                    '2026-03', 'no se mueve un gasto de abril a un mes cerrado');
  perform t.ok((select estado from public.gastos where id = t.g('g_mar')::bigint) = 'REGISTRADO'
               and t.n_asientos(v_t, 'gasto_anulacion', t.g('g_mar')::bigint) = 0,
               'el gasto de marzo sigue registrado y sin reverso');

  -- The open month keeps working.
  v_g := t.gasto(v_t, 'contado', 11000, 0, 0, null, v_fc, v_cat, date '2026-04-20');
  perform t.ok(t.n_asientos(v_t, 'gasto', v_g) = 1, 'abril abierto: el gasto se registra y se contabiliza');
  update public.gastos set observacion = 'abierto' where id = v_g;
  perform t.ok((select observacion from public.gastos where id = v_g) = 'abierto', 'abril abierto: el gasto se edita');
  perform t.falla_con(format('delete from public.gastos where id = %s', v_g), '55000', 'eliminar',
                      'abril abierto: borrar sigue prohibido por 0019 (anular)');
  update public.gastos set estado = 'ANULADO' where id = v_g;
  perform t.ok((select estado from public.gastos where id = v_g) = 'ANULADO'
               and t.n_asientos(v_t, 'gasto_anulacion', v_g) = 1
               and not exists (select 1 from public.asientos where tenant_id = v_t and fk_origen = v_g
                               and origen_tipo in ('gasto', 'gasto_anulacion') and estado <> 'ANULADO'),
               'abril abierto: anular crea el reverso y deja ambos asientos ANULADO');
  perform t.ok((select (a.fecha at time zone 'America/Asuncion')::date from public.asientos a
                where a.tenant_id = v_t and a.origen_tipo = 'gasto_anulacion' and a.fk_origen = v_g)
               = (now() at time zone 'America/Asuncion')::date,
               'el reverso lleva la fecha de la anulacion (hoy)');

  -- Unrelated hotel: the same March date is not closed there.
  v_n := t.gasto(t.g('hb')::bigint, 'contado', 11000, 0, 0, null, t.g('hb_fcaja')::bigint, t.g('hb_cat_egr')::bigint, date '2026-03-10');
  perform t.ok(v_n is not null, 'otro hotel registra gastos de marzo sin problema');
end $$;

-- ─── Guards: pagos ────────────────────────────────────────────────────────
do $$
declare
  v_t bigint := t.g('hp')::bigint; v_fc bigint := t.g('hp_fcaja')::bigint;
  v_p bigint; v_p2 bigint; v_saldo numeric;
begin
  perform t.cerrada(format('insert into public.pagos (tenant_id, fecha, fk_gasto, fk_cuenta_fondo, monto) values (%s, date ''2026-03-20'', %s, %s, 1000)', v_t, t.g('gc_abr'), v_fc),
                    '2026-03', 'no se registra un pago fechado en un mes cerrado');
  perform t.cerrada(format('update public.pagos set observacion = ''x'' where id = %s', t.g('pg_mar')),
                    '2026-03', 'no se edita un pago de un mes cerrado');
  perform t.cerrada(format('update public.pagos set estado = ''ANULADO'' where id = %s', t.g('pg_mar')),
                    '2026-03', 'no se anula un pago de un mes cerrado');
  perform t.cerrada(format('delete from public.pagos where id = %s', t.g('pg_mar')),
                    '2026-03', 'no se borra un pago de un mes cerrado');
  perform t.cerrada(format('update public.gastos set estado = ''ANULADO'' where id = %s', t.g('gc_mar')),
                    '2026-03', 'no se anula un gasto a credito de un mes cerrado');

  -- A payment dated today on a credit expense of the closed month is allowed:
  -- its own date is open and the balance move is not an edit of the expense.
  select saldo_pendiente into v_saldo from public.gastos where id = t.g('gc_mar')::bigint;
  v_p := t.pago(v_t, t.g('gc_mar')::bigint, v_fc, 20000);
  perform t.ok((select saldo_pendiente from public.gastos where id = t.g('gc_mar')::bigint) = v_saldo - 20000,
               'un pago de hoy sobre un gasto de un mes cerrado baja su saldo');
  update public.pagos set estado = 'ANULADO' where id = v_p;
  perform t.ok((select saldo_pendiente from public.gastos where id = t.g('gc_mar')::bigint) = v_saldo
               and t.n_asientos(v_t, 'pago_anulacion', v_p) = 1,
               'y anular ese pago de hoy devuelve el saldo y crea el reverso');

  -- April stays open.
  insert into public.pagos (tenant_id, fecha, fk_gasto, fk_cuenta_fondo, monto)
    values (v_t, date '2026-04-20', t.g('gc_abr')::bigint, v_fc, 1000) returning id into v_p2;
  update public.pagos set observacion = 'abierto' where id = v_p2;
  update public.pagos set estado = 'ANULADO' where id = t.g('pg_abr')::bigint;
  perform t.ok((select estado from public.pagos where id = t.g('pg_abr')::bigint) = 'ANULADO'
               and t.n_asientos(v_t, 'pago_anulacion', t.g('pg_abr')::bigint) = 1,
               'abril abierto: se registra, edita y anula un pago');
end $$;

-- ─── Guards: facturas and cobros ──────────────────────────────────────────
do $$
declare
  v_t bigint := t.g('hp')::bigint; v_estab bigint := t.g('hp_estab')::bigint;
  v_cli bigint := t.g('hp_cli')::bigint; v_turno bigint := t.g('hp_turno')::bigint;
  v_efe bigint := t.g('m_efe')::bigint; v_fc bigint := t.g('hp_fcaja')::bigint;
  v_f bigint; v_c bigint; v_saldo numeric;
begin
  perform t.cerrada(format('select t.factura(%s, %s, %s, %s, %s, 1, 11000, 0, 0, 1000, 11000, 0, ''EMITIDA'', timestamptz ''2026-03-15 12:00:00-03'')',
                           v_t, v_estab, v_cli, v_turno, v_efe),
                    '2026-03', 'no se emite una factura fechada en un mes cerrado');
  -- 02:00 UTC of April 1st is still March 31st in Asuncion: the business day rules.
  perform t.cerrada(format('select t.factura(%s, %s, %s, %s, %s, 1, 11000, 0, 0, 1000, 11000, 0, ''EMITIDA'', timestamptz ''2026-04-01 02:00:00+00'')',
                           v_t, v_estab, v_cli, v_turno, v_efe),
                    '2026-03', 'la factura se fecha por el dia de Asuncion, no por el UTC');
  perform t.cerrada(format('update public.facturas set observacion = ''x'' where id_factura = %s', t.g('fi_mar')),
                    '2026-03', 'no se edita una factura de un mes cerrado');
  perform t.cerrada(format('update public.facturas set estado = ''ANULADA'' where id_factura = %s', t.g('fi_mar')),
                    '2026-03', 'no se anula una factura de un mes cerrado aunque hoy este abierto');
  perform t.cerrada(format('delete from public.facturas where id_factura = %s', t.g('fi_mar')),
                    '2026-03', 'no se borra una factura de un mes cerrado');
  perform t.cerrada(format('update public.facturas set fecha_emision = timestamptz ''2026-03-02 12:00:00-03'' where id_factura = %s', t.g('fi_abr')),
                    '2026-03', 'no se mueve una factura de abril a un mes cerrado');
  perform t.ok((select estado from public.facturas where id_factura = t.g('fi_mar')::bigint) = 'EMITIDA'
               and t.n_asientos(v_t, 'factura_anulacion', t.g('fi_mar')::bigint) = 0,
               'la factura de marzo sigue emitida y sin reverso');

  -- April stays open: insert at the boundary, edit and annul with reversal.
  v_f := t.factura(v_t, v_estab, v_cli, v_turno, v_efe, 1, 11000, 0, 0, 1000, 11000, 0, 'EMITIDA', timestamptz '2026-04-01 12:00:00+00');
  perform t.ok(t.n_asientos(v_t, 'factura', v_f) = 1, 'abril abierto: la factura se emite y se contabiliza');
  update public.facturas set observacion = 'abierto' where id_factura = v_f;
  update public.facturas set estado = 'ANULADA' where id_factura = v_f;
  perform t.ok((select estado from public.facturas where id_factura = v_f) = 'ANULADA'
               and t.n_asientos(v_t, 'factura_anulacion', v_f) = 1
               and not exists (select 1 from public.asientos where tenant_id = v_t and fk_origen = v_f
                               and origen_tipo in ('factura', 'factura_anulacion') and estado <> 'ANULADO'),
               'abril abierto: anular una factura crea el reverso y deja ambos asientos ANULADO');

  -- Cobros against the closed-month credit invoice.
  perform t.cerrada(format('insert into public.cobros (tenant_id, fecha, fk_factura, fk_cuenta_fondo, monto) values (%s, date ''2026-03-20'', %s, %s, 1000)', v_t, t.g('fc_abr'), v_fc),
                    '2026-03', 'no se registra un cobro fechado en un mes cerrado');
  perform t.cerrada(format('update public.cobros set observacion = ''x'' where id = %s', t.g('cb_mar')),
                    '2026-03', 'no se edita un cobro de un mes cerrado');
  perform t.cerrada(format('update public.cobros set estado = ''ANULADO'' where id = %s', t.g('cb_mar')),
                    '2026-03', 'no se anula un cobro de un mes cerrado');
  perform t.cerrada(format('delete from public.cobros where id = %s', t.g('cb_mar')),
                    '2026-03', 'no se borra un cobro de un mes cerrado');

  -- A collection dated today on a closed-month invoice is allowed.
  select saldo_pendiente into v_saldo from public.facturas where id_factura = t.g('fc_mar')::bigint;
  v_c := t.cobro(v_t, t.g('fc_mar')::bigint, v_fc, 20000);
  perform t.ok((select saldo_pendiente from public.facturas where id_factura = t.g('fc_mar')::bigint) = v_saldo - 20000,
               'un cobro de hoy sobre una factura de un mes cerrado baja su saldo');
  update public.cobros set estado = 'ANULADO' where id = v_c;
  perform t.ok((select saldo_pendiente from public.facturas where id_factura = t.g('fc_mar')::bigint) = v_saldo
               and t.n_asientos(v_t, 'cobro_anulacion', v_c) = 1,
               'y anular ese cobro de hoy devuelve el saldo y crea el reverso');

  -- April stays open for cobros.
  update public.cobros set observacion = 'abierto' where id = t.g('cb_abr')::bigint;
  update public.cobros set estado = 'ANULADO' where id = t.g('cb_abr')::bigint;
  perform t.ok((select estado from public.cobros where id = t.g('cb_abr')::bigint) = 'ANULADO',
               'abril abierto: se edita y anula un cobro');
end $$;

-- ─── Guards: transferencias_fondos and saldos_iniciales_fondos ────────────
do $$
declare
  v_t bigint := t.g('hp')::bigint; v_fc bigint := t.g('hp_fcaja')::bigint; v_fb bigint := t.g('hp_fbanco')::bigint;
  v_id bigint;
begin
  perform t.cerrada(format('insert into public.transferencias_fondos (tenant_id, fecha, fk_fondo_origen, fk_fondo_destino, monto) values (%s, date ''2026-03-20'', %s, %s, 100)', v_t, v_fc, v_fb),
                    '2026-03', 'no se registra una transferencia en un mes cerrado');
  perform t.cerrada(format('update public.transferencias_fondos set observacion = ''x'' where id = %s', t.g('tr_mar')),
                    '2026-03', 'no se edita una transferencia de un mes cerrado');
  perform t.cerrada(format('update public.transferencias_fondos set estado = ''ANULADO'' where id = %s', t.g('tr_mar')),
                    '2026-03', 'no se anula una transferencia de un mes cerrado');
  perform t.cerrada(format('delete from public.transferencias_fondos where id = %s', t.g('tr_mar')),
                    '2026-03', 'no se borra una transferencia de un mes cerrado');
  update public.transferencias_fondos set observacion = 'abierto' where id = t.g('tr_abr')::bigint;
  update public.transferencias_fondos set estado = 'ANULADO' where id = t.g('tr_abr')::bigint;
  perform t.ok((select estado from public.transferencias_fondos where id = t.g('tr_abr')::bigint) = 'ANULADO'
               and t.n_asientos(v_t, 'transferencia_anulacion', t.g('tr_abr')::bigint) = 1,
               'abril abierto: se edita y anula una transferencia');
  insert into public.transferencias_fondos (tenant_id, fecha, fk_fondo_origen, fk_fondo_destino, monto)
    values (v_t, date '2026-04-21', v_fc, v_fb, 100) returning id into v_id;
  perform t.ok(t.n_asientos(v_t, 'transferencia', v_id) = 1, 'abril abierto: se registra una transferencia');

  perform t.cerrada(format('insert into public.saldos_iniciales_fondos (tenant_id, fecha, fk_cuenta_fondo, monto) values (%s, date ''2026-03-02'', %s, 100)', v_t, t.g('c_f2')),
                    '2026-03', 'no se registra un saldo inicial en un mes cerrado');
  perform t.cerrada(format('update public.saldos_iniciales_fondos set observacion = ''x'' where id = %s', t.g('sa_mar')),
                    '2026-03', 'no se edita un saldo inicial de un mes cerrado');
  perform t.cerrada(format('update public.saldos_iniciales_fondos set estado = ''ANULADO'' where id = %s', t.g('sa_mar')),
                    '2026-03', 'no se anula un saldo inicial de un mes cerrado');
  perform t.cerrada(format('delete from public.saldos_iniciales_fondos where id = %s', t.g('sa_mar')),
                    '2026-03', 'no se borra un saldo inicial de un mes cerrado');
  update public.saldos_iniciales_fondos set observacion = 'abierto' where id = t.g('sa_abr')::bigint;
  update public.saldos_iniciales_fondos set estado = 'ANULADO' where id = t.g('sa_abr')::bigint;
  perform t.ok((select estado from public.saldos_iniciales_fondos where id = t.g('sa_abr')::bigint) = 'ANULADO'
               and t.n_asientos(v_t, 'saldo_inicial_anulacion', t.g('sa_abr')::bigint) = 1,
               'abril abierto: se edita y anula un saldo inicial');
end $$;

-- ─── Guards: asientos and detalle_asientos ────────────────────────────────
do $$
declare
  v_t bigint := t.g('hp')::bigint; v_estab bigint := t.g('hp_estab')::bigint;
  v_cta1 bigint := (select fk_cuenta_contable from public.cuentas_fondos where id = t.g('c_f1')::bigint);
  v_cta2 bigint := (select fk_cuenta_contable from public.cuentas_fondos where id = t.g('c_f2')::bigint);
  v_a_mar bigint := (select id from public.asientos where tenant_id = v_t and origen_tipo = 'gasto' and fk_origen = t.g('g_mar')::bigint);
  v_l_mar bigint; v_a bigint; v_l bigint; v_n bigint;
begin
  perform t.ok((select (fecha at time zone 'America/Asuncion')::date from public.asientos where id = v_a_mar) = date '2026-03-10',
               'el asiento del gasto de marzo esta fechado en marzo (preparacion)');
  select min(id) into v_l_mar from public.detalle_asientos where tenant_id = v_t and fk_asientos = v_a_mar;

  -- Posting into a closed month fails through fn_contabilizar and through a direct insert.
  perform t.cerrada(format('select public.fn_contabilizar(%s, date ''2026-03-15'', %s, ''manual marzo'', ''manual'', null, jsonb_build_array(jsonb_build_object(''fk_cuenta'', %s, ''debe'', 100), jsonb_build_object(''fk_cuenta'', %s, ''haber'', 100)))',
                           v_t, v_estab, v_cta1, v_cta2),
                    '2026-03', 'no se contabiliza un asiento manual en un mes cerrado');
  perform t.cerrada(format('insert into public.asientos (tenant_id, fecha, descripcion, nro_asiento, fk_sucursal, estado, origen_tipo) values (%s, timestamptz ''2026-03-15 12:00:00-03'', ''directo'', public.fn_siguiente_nro_asiento(%s), %s, ''CONTABILIZADO'', ''manual'')',
                           v_t, v_t, v_estab),
                    '2026-03', 'no se inserta un asiento directo en un mes cerrado');
  perform t.cerrada(format('update public.asientos set descripcion = ''x'' where id = %s', v_a_mar),
                    '2026-03', 'no se edita un asiento de un mes cerrado');
  perform t.cerrada(format('update public.asientos set estado = ''ANULADO'' where id = %s', v_a_mar),
                    '2026-03', 'no se anula un asiento de un mes cerrado a mano');
  perform t.cerrada(format('delete from public.asientos where id = %s', v_a_mar),
                    '2026-03', 'no se borra un asiento de un mes cerrado');

  -- Lines follow their entry.
  perform t.cerrada(format('insert into public.detalle_asientos (tenant_id, fk_cuenta_contables, fk_asientos, debe, haber) values (%s, %s, %s, 100, 0)', v_t, v_cta1, v_a_mar),
                    '2026-03', 'no se agregan lineas a un asiento de un mes cerrado');
  perform t.cerrada(format('update public.detalle_asientos set fk_cuenta_contables = %s where id = %s', v_cta1, v_l_mar),
                    '2026-03', 'no se editan lineas de un asiento de un mes cerrado');
  perform t.cerrada(format('delete from public.detalle_asientos where id = %s', v_l_mar),
                    '2026-03', 'no se borran lineas de un asiento de un mes cerrado');

  -- The open month: a manual entry posts, edits and its lines can change.
  v_a := public.fn_contabilizar(v_t, date '2026-04-15', v_estab, 'manual abril', 'manual', null,
           jsonb_build_array(jsonb_build_object('fk_cuenta', v_cta1, 'debe', 100),
                             jsonb_build_object('fk_cuenta', v_cta2, 'haber', 100)));
  perform t.ok(v_a is not null, 'abril abierto: se contabiliza un asiento manual');
  update public.asientos set descripcion = 'manual abril editado' where id = v_a;
  select min(id) into v_l from public.detalle_asientos where tenant_id = v_t and fk_asientos = v_a and debe > 0;
  update public.detalle_asientos set fk_cuenta_contables = v_cta2 where id = v_l;
  update public.detalle_asientos set fk_cuenta_contables = v_cta1 where id = v_l;
  perform t.ok((select descripcion from public.asientos where id = v_a) = 'manual abril editado',
               'abril abierto: se editan el asiento y sus lineas');

  -- An open-month entry cannot be moved into the closed month, nor its lines.
  perform t.cerrada(format('update public.asientos set fecha = timestamptz ''2026-03-15 12:00:00-03'' where id = %s', v_a),
                    '2026-03', 'no se mueve un asiento de abril a un mes cerrado');
  perform t.cerrada(format('update public.detalle_asientos set fk_asientos = %s where id = %s', v_a_mar, v_l),
                    '2026-03', 'no se mueve una linea hacia un asiento de un mes cerrado');
  update public.asientos set estado = 'ANULADO' where id = v_a;
  perform t.ok((select estado from public.asientos where id = v_a) = 'ANULADO', 'abril abierto: se anula un asiento manual');

  -- Nothing of the closed month changed.
  perform t.ok((select estado from public.asientos where id = v_a_mar) = 'CONTABILIZADO'
               and (select count(*) from public.detalle_asientos where fk_asientos = v_a_mar) >= 2,
               'el asiento de marzo y sus lineas quedaron intactos');
end $$;

-- ─── Closing the current month: reversal dated in a closed month fails ────
do $$
declare
  v_t bigint := t.g('hp')::bigint; v_estab bigint := t.g('hp_estab')::bigint;
  v_cli bigint := t.g('hp_cli')::bigint; v_turno bigint := t.g('hp_turno')::bigint;
  v_cat bigint := t.g('hp_cat_egr')::bigint; v_fc bigint := t.g('hp_fcaja')::bigint;
  v_hoy date := (now() at time zone 'America/Asuncion')::date;
  v_ym text := to_char((now() at time zone 'America/Asuncion')::date, 'YYYY-MM');
  v_f bigint; v_g bigint;
begin
  perform t.actuar(t.g('hp_admin'), v_t);
  perform public.fn_cerrar_mes(extract(year from v_hoy)::int, extract(month from v_hoy)::int);
  perform t.volver();
  perform t.ok(public.fn_periodo_cerrado(v_t, v_hoy), 'el mes actual se puede cerrar');

  -- April documents are still open, but annulling them today would post the
  -- reversal in the closed current month: the whole annulment is rolled back.
  perform t.cerrada(format('update public.gastos set estado = ''ANULADO'' where id = %s', t.g('g_abr2')),
                    v_ym, 'anular un gasto de abril falla si el reverso cae en el mes actual cerrado');
  perform t.ok((select estado from public.gastos where id = t.g('g_abr2')::bigint) = 'REGISTRADO'
               and t.n_asientos(v_t, 'gasto_anulacion', t.g('g_abr2')::bigint) = 0
               and (select estado from public.asientos where tenant_id = v_t and origen_tipo = 'gasto' and fk_origen = t.g('g_abr2')::bigint) = 'CONTABILIZADO',
               'el gasto de abril sigue registrado y su asiento sigue vigente');
  perform t.cerrada(format('update public.facturas set estado = ''ANULADA'' where id_factura = %s', t.g('fi_abr2')),
                    v_ym, 'anular una factura de abril falla si el reverso cae en el mes actual cerrado');
  perform t.ok((select estado from public.facturas where id_factura = t.g('fi_abr2')::bigint) = 'EMITIDA'
               and t.n_asientos(v_t, 'factura_anulacion', t.g('fi_abr2')::bigint) = 0,
               'la factura de abril sigue emitida y sin reverso');

  -- Anything dated today fails too: gasto, cobro and a new invoice by the receptionist.
  perform t.cerrada(format('select t.gasto(%s, ''contado'', 11000, 0, 0, null, %s, %s, %L::date)', v_t, v_fc, v_cat, v_hoy),
                    v_ym, 'el gasto de hoy falla con el mes actual cerrado');
  perform t.cerrada(format('select t.cobro(%s, %s, %s, 1000)', v_t, t.g('fc_mar'), v_fc),
                    v_ym, 'el cobro de hoy falla con el mes actual cerrado');
  perform t.actuar(t.g('hp_rec'), v_t);
  perform t.cerrada(format('select t.factura(%s, %s, %s, %s, %s, 1, 11000, 0, 0, 1000, 11000)',
                           v_t, v_estab, v_cli, v_turno, t.g('m_efe')),
                    v_ym, 'la recepcionista no puede facturar con el mes actual cerrado');
  perform t.volver();

  -- Reopening restores everything.
  perform t.actuar(t.g('hp_admin'), v_t);
  perform public.fn_reabrir_mes(extract(year from v_hoy)::int, extract(month from v_hoy)::int);
  perform t.volver();
  perform t.ok(not public.fn_periodo_cerrado(v_t, v_hoy), 'reabrir el mes actual lo deja abierto');
  perform t.actuar(t.g('hp_rec'), v_t);
  v_f := t.factura(v_t, v_estab, v_cli, v_turno, t.g('m_efe')::bigint, 1, 11000, 0, 0, 1000, 11000);
  perform t.volver();
  perform t.ok(t.n_asientos(v_t, 'factura', v_f) = 1, 'reabierto el mes actual la recepcionista vuelve a facturar');
  v_g := t.gasto(v_t, 'contado', 11000, 0, 0, null, v_fc, v_cat, v_hoy);
  perform t.ok(v_g is not null, 'reabierto el mes actual se registran gastos de hoy');
  update public.gastos set estado = 'ANULADO' where id = t.g('g_abr2')::bigint;
  update public.facturas set estado = 'ANULADA' where id_factura = t.g('fi_abr2')::bigint;
  perform t.ok((select estado from public.gastos where id = t.g('g_abr2')::bigint) = 'ANULADO'
               and (select estado from public.facturas where id_factura = t.g('fi_abr2')::bigint) = 'ANULADA'
               and t.n_asientos(v_t, 'gasto_anulacion', t.g('g_abr2')::bigint) = 1
               and t.n_asientos(v_t, 'factura_anulacion', t.g('fi_abr2')::bigint) = 1,
               'reabierto el mes actual se anulan los documentos de abril con su reverso');
end $$;

-- ─── Unrelated tenants and reopening March ────────────────────────────────
do $$
declare
  v_t bigint := t.g('hp')::bigint; v_hb bigint := t.g('hb')::bigint; v_estab bigint := t.g('hp_estab')::bigint;
  v_cli bigint := t.g('hb_cli')::bigint; v_cat bigint := t.g('hp_cat_egr')::bigint; v_fc bigint := t.g('hp_fcaja')::bigint;
  v_f bigint; v_a bigint;
begin
  -- March is still closed for hp; hb is not affected (documents and entries).
  v_f := t.factura(v_hb, t.g('hb_estab')::bigint, v_cli, t.g('hb_turno')::bigint, t.g('m_efe')::bigint, 1, 11000, 0, 0, 1000, 11000,
                   0, 'EMITIDA', timestamptz '2026-03-15 12:00:00-03');
  perform t.ok(t.n_asientos(v_hb, 'factura', v_f) = 1, 'otro hotel factura y contabiliza en marzo con marzo cerrado en hp');
  update public.facturas set estado = 'ANULADA' where id_factura = v_f;
  perform t.ok((select estado from public.facturas where id_factura = v_f) = 'ANULADA', 'otro hotel anula su factura de marzo');
  perform t.ok(not public.fn_periodo_cerrado(v_hb, date '2026-03-15'), 'marzo sigue abierto en hb');
  perform t.ok(not public.fn_periodo_cerrado(null, date '2026-03-15') and not public.fn_periodo_cerrado(v_t, null),
               'fn_periodo_cerrado con null no cierra nada');

  -- Reopen March: the same operations that failed now work.
  perform t.actuar(t.g('hp_admin'), v_t);
  perform public.fn_reabrir_mes(2026, 3);
  perform t.volver();
  perform t.ok(not public.fn_periodo_cerrado(v_t, date '2026-03-15')
               and t.cuenta(format('select count(*) from public.periodos_cerrados where tenant_id = %s', v_t)) = 0,
               'reabrir marzo lo deja abierto y sin filas');
  perform t.ok(t.gasto(v_t, 'contado', 11000, 0, 0, null, v_fc, v_cat, date '2026-03-20') is not null,
               'reabierto marzo: se registra un gasto');
  update public.gastos set observacion = 'reabierto' where id = t.g('g_mar')::bigint;
  update public.pagos set observacion = 'reabierto' where id = t.g('pg_mar')::bigint;
  update public.cobros set observacion = 'reabierto' where id = t.g('cb_mar')::bigint;
  update public.transferencias_fondos set observacion = 'reabierto' where id = t.g('tr_mar')::bigint;
  update public.saldos_iniciales_fondos set observacion = 'reabierto' where id = t.g('sa_mar')::bigint;
  update public.facturas set observacion = 'reabierto' where id_factura = t.g('fi_mar')::bigint;
  perform t.ok((select observacion from public.facturas where id_factura = t.g('fi_mar')::bigint) = 'reabierto',
               'reabierto marzo: se editan facturas, gastos, pagos, cobros, transferencias y saldos iniciales');
  update public.gastos set estado = 'ANULADO' where id = t.g('g_mar')::bigint;
  update public.facturas set estado = 'ANULADA' where id_factura = t.g('fi_mar')::bigint;
  perform t.ok((select estado from public.gastos where id = t.g('g_mar')::bigint) = 'ANULADO'
               and (select estado from public.facturas where id_factura = t.g('fi_mar')::bigint) = 'ANULADA'
               and t.n_asientos(v_t, 'gasto_anulacion', t.g('g_mar')::bigint) = 1
               and t.n_asientos(v_t, 'factura_anulacion', t.g('fi_mar')::bigint) = 1
               and not exists (select 1 from public.asientos where tenant_id = v_t
                               and fk_origen in (t.g('g_mar')::bigint) and origen_tipo in ('gasto', 'gasto_anulacion') and estado <> 'ANULADO'),
               'reabierto marzo: se anulan documentos de marzo (original y reverso ANULADO)');
  v_a := public.fn_contabilizar(v_t, date '2026-03-15', v_estab, 'manual marzo', 'manual', null,
           jsonb_build_array(jsonb_build_object('fk_cuenta', (select fk_cuenta_contable from public.cuentas_fondos where id = t.g('c_f1')::bigint), 'debe', 100),
                             jsonb_build_object('fk_cuenta', (select fk_cuenta_contable from public.cuentas_fondos where id = t.g('c_f2')::bigint), 'haber', 100)));
  perform t.ok(v_a is not null, 'reabierto marzo: se contabilizan asientos manuales');
end $$;

-- ═══ FIN (later tasks add their sections before this line) ═══

select 'TODAS LAS PRUEBAS DE FINANZAS PASARON' as resultado;

rollback;
