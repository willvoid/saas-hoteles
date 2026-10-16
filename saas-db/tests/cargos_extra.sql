-- ═══════════════════════════════════════════════════════════════════════════
-- Suite de cargos extra de check-in / check-out (0022)
-- ═══════════════════════════════════════════════════════════════════════════
-- Cubre: config_horarios_establecimiento (RLS, checks), calcular_recargo_horario
-- (tolerancia, porcentaje, fijo por hora, early check-in, defaults), las RPC
-- atomicas checkout_con_recargo / checkin_con_recargo (cargo + historial +
-- estado en una transaccion, exoneracion, motivo obligatorio), los conceptos
-- sembrados y el aislamiento entre tenants.
--
-- Reloj determinista: calcular_recargo_horario recibe `p_momento`, asi que los
-- casos de calculo pasan instantes fijos (hora local de Paraguay). Las RPC usan
-- now(); sus casos usan reservas con fechas muy pasadas (la salida/entrada ya
-- vencio por mucho: el porcentaje no depende del exceso) o muy futuras (dentro
-- de la tolerancia: sugerido 0).
--
-- Requisitos: migraciones 0001-0022 y supabase/seed.sql aplicados.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f tests/cargos_extra.sql
--
-- Corre dentro de una transaccion y la revierte al final.
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

-- Impersona a un usuario autenticado de un tenant.
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

-- La sentencia debe fallar con el SQLSTATE indicado.
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

-- La sentencia DML debe afectar exactamente p_esperadas filas.
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

-- Instante fijo a partir de una hora local de Paraguay ('2031-06-11 13:00').
create function t.mom(p_local text) returns timestamptz language sql as $$
  select p_local::timestamp at time zone 'America/Asuncion'
$$;

-- Reserva de A con una habitacion a p_precio la noche (subtotal = precio x
-- noches, minimo 1). Se crea como superusuario: el estado inicial es el pedido.
create function t.reserva(p_estado text, p_entrada date, p_salida date, p_precio numeric, p_con_hab boolean default true)
returns bigint language plpgsql as $$
declare v_id bigint;
begin
  insert into public.reservas
    (tenant_id, fecha_entrada, fecha_salida, estado, fk_cliente, fk_usuario, origen)
  values
    (t.g('ta')::bigint, p_entrada, p_salida, p_estado, t.g('a_cli')::bigint, t.g('a_admin_id')::bigint, 'TEST')
  returning id_reserva into v_id;

  if p_con_hab then
    insert into public.detalle_reservas
      (tenant_id, fk_reserva, fk_habitacion, fk_tarifa, precio_unitario, subtotal)
    values
      (t.g('ta')::bigint, v_id, t.g('a_hab')::bigint, t.g('a_tarifa')::bigint, p_precio,
       p_precio * greatest(p_salida - p_entrada, 1));
  end if;
  return v_id;
end $$;

-- Folio abierto de una reserva con un total ya acumulado.
create function t.folio(p_reserva bigint, p_total numeric) returns bigint language plpgsql as $$
declare v_id bigint;
begin
  insert into public.folios (tenant_id, fk_reserva, estado, total_acumulado)
  values (t.g('ta')::bigint, p_reserva, 'abierto', p_total)
  returning id_folio into v_id;
  return v_id;
end $$;

-- ─── Fixtures ────────────────────────────────────────────────────────────────
-- Dos hoteles (A y B) dados de alta con fn_provision_tenant mas personal de A.
do $$
declare
  c_ger bigint; c_rec bigint; c_lim bigint;
  v_contrib bigint := (select min(id_tipo_contribuyente) from public.tipo_contribuyente);
  v_regimen bigint := (select min(id_regimen) from public.tipo_regimen);
  v_res jsonb;
  v_ta bigint; v_tb bigint;
  v_estab_a bigint; v_estab_b bigint;
  v_edif bigint; v_piso bigint; v_th bigint; v_hab bigint; v_tarifa bigint; v_cli bigint;
  v_a_admin uuid := gen_random_uuid(); v_b_admin uuid := gen_random_uuid();
  v_a_ger uuid := gen_random_uuid(); v_a_rec uuid := gen_random_uuid(); v_a_lim uuid := gen_random_uuid();
begin
  select id_cargo into c_ger from public.cargo where lower(cargo) = 'gerente' limit 1;
  select id_cargo into c_rec from public.cargo where lower(cargo) = 'recepcionista' limit 1;
  select id_cargo into c_lim from public.cargo where lower(cargo) in ('limpiador', 'limpiadora') limit 1;

  insert into auth.users (id, email) values
    (v_a_admin, 'admin@cx-a.test'), (v_b_admin, 'admin@cx-b.test');

  v_res := public.fn_provision_tenant(jsonb_build_object(
    'tenant', jsonb_build_object('nombre', 'Hotel CX A', 'slug', 'hotel-cx-a'),
    'admin', jsonb_build_object('auth_id', v_a_admin, 'nombre', 'Admin A', 'documento', '1', 'fk_tipo_doc', 1),
    'empresa', jsonb_build_object('ruc', '80100001-1', 'razon_social', 'Hotel CX A SA',
                                  'fk_contribuyente', v_contrib, 'fk_regimen', v_regimen),
    'establecimiento', jsonb_build_object('direccion', 'Calle 1', 'fk_barrio', 1)));
  v_ta := (v_res ->> 'tenant_id')::bigint;
  v_estab_a := (v_res ->> 'id_establecimiento')::bigint;

  v_res := public.fn_provision_tenant(jsonb_build_object(
    'tenant', jsonb_build_object('nombre', 'Hotel CX B', 'slug', 'hotel-cx-b'),
    'admin', jsonb_build_object('auth_id', v_b_admin, 'nombre', 'Admin B', 'documento', '2', 'fk_tipo_doc', 1),
    'empresa', jsonb_build_object('ruc', '80100002-2', 'razon_social', 'Hotel CX B SA',
                                  'fk_contribuyente', v_contrib, 'fk_regimen', v_regimen),
    'establecimiento', jsonb_build_object('direccion', 'Calle 2', 'fk_barrio', 1)));
  v_tb := (v_res ->> 'tenant_id')::bigint;
  v_estab_b := (v_res ->> 'id_establecimiento')::bigint;

  insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
    (v_a_ger, 'ger@cx-a.test', jsonb_build_object('tenant_id', v_ta, 'fk_cargo', c_ger),
       jsonb_build_object('nombre', 'Gerente A', 'documento', '11', 'fk_tipo_doc', 1)),
    (v_a_rec, 'rec@cx-a.test', jsonb_build_object('tenant_id', v_ta, 'fk_cargo', c_rec),
       jsonb_build_object('nombre', 'Recepcion A', 'documento', '12', 'fk_tipo_doc', 1)),
    (v_a_lim, 'lim@cx-a.test', jsonb_build_object('tenant_id', v_ta, 'fk_cargo', c_lim),
       jsonb_build_object('nombre', 'Limpieza A', 'documento', '13', 'fk_tipo_doc', 1));

  -- Planta fisica y tarifa de A (el establecimiento de una reserva se resuelve
  -- por habitacion -> piso -> edificio).
  insert into public.edificios (tenant_id, nombre, estado, fk_sucursal)
    values (v_ta, 'Edificio A', 'Activo', v_estab_a) returning id into v_edif;
  insert into public.pisos (tenant_id, numero, estado, fk_edificio)
    values (v_ta, 1, 'Activo', v_edif) returning id into v_piso;
  insert into public.tipo_habitacion (tenant_id, nombre, descripcion, capacidad)
    values (v_ta, 'Doble', 'Habitacion doble', 2) returning id into v_th;
  insert into public.habitaciones (tenant_id, numero_habitacion, fk_tipo_habitacion, fk_piso)
    values (v_ta, 101, v_th, v_piso) returning id into v_hab;
  insert into public.tarifas (tenant_id, nombre, precio_base, estado, fk_tipo_habitacion, fecha_inicio)
    values (v_ta, 'Base', 300000, 'Activa', v_th, date '2020-01-01') returning id into v_tarifa;
  insert into public.clientes (tenant_id, razon_social, documento, celular, es_proveedor_del_estado)
    values (v_ta, 'Cliente CX', 'CI-CX', '0981', false) returning id_cliente into v_cli;

  perform set_config('test.ta', v_ta::text, true);
  perform set_config('test.tb', v_tb::text, true);
  perform set_config('test.a_estab', v_estab_a::text, true);
  perform set_config('test.b_estab', v_estab_b::text, true);
  perform set_config('test.a_hab', v_hab::text, true);
  perform set_config('test.a_tarifa', v_tarifa::text, true);
  perform set_config('test.a_cli', v_cli::text, true);
  perform set_config('test.a_admin', v_a_admin::text, true);
  perform set_config('test.b_admin', v_b_admin::text, true);
  perform set_config('test.a_ger', v_a_ger::text, true);
  perform set_config('test.a_rec', v_a_rec::text, true);
  perform set_config('test.a_lim', v_a_lim::text, true);
  perform set_config('test.a_admin_id',
    (select id_usuario from public.usuario where auth_id = v_a_admin)::text, true);
  perform set_config('test.a_rec_id',
    (select id_usuario from public.usuario where auth_id = v_a_rec)::text, true);

  perform t.ok(v_ta <> v_tb, 'provisioning crea dos tenants distintos');
end $$;

-- ─── Conceptos sembrados ─────────────────────────────────────────────────────
do $$
declare v_iva10 bigint := (select min(id_iva) from public.iva where valor = 10);
begin
  perform t.ok((select count(*) from public.conceptos
                where tenant_id = t.g('ta')::bigint and nombre in ('Late check-out', 'Early check-in')) = 2,
               'el alta de un hotel siembra Late check-out y Early check-in (A)');
  perform t.ok((select count(*) from public.conceptos
                where tenant_id = t.g('tb')::bigint and nombre in ('Late check-out', 'Early check-in')) = 2,
               'el alta de un hotel siembra Late check-out y Early check-in (B)');
  perform t.ok((select count(*) from public.conceptos
                where nombre in ('Late check-out', 'Early check-in')
                  and fk_iva = v_iva10 and arancel = 0 and upper(estado) = 'ACTIVO') >= 4,
               'los conceptos de recargo llevan IVA 10 %, arancel 0 y estan activos');
  perform t.ok(not exists (
                 select tenant_id, lower(nombre) from public.conceptos
                 where nombre in ('Late check-out', 'Early check-in')
                 group by 1, 2 having count(*) > 1),
               'la siembra es idempotente: un concepto por nombre y tenant');
  -- La siembra de los tenants existentes tambien debe poder repetirse.
  perform public.fn_seed_conceptos_horarios(t.g('ta')::bigint);
  perform t.ok((select count(*) from public.conceptos
                where tenant_id = t.g('ta')::bigint and nombre in ('Late check-out', 'Early check-in')) = 2,
               'volver a sembrar no duplica los conceptos');
end $$;

-- ─── Privilegios de las funciones ────────────────────────────────────────────
do $$
begin
  perform t.ok(has_function_privilege('authenticated', 'public.calcular_recargo_horario(bigint,text,timestamptz)', 'execute'),
               'authenticated ejecuta calcular_recargo_horario');
  perform t.ok(has_function_privilege('authenticated', 'public.checkout_con_recargo(bigint,numeric,text,boolean)', 'execute'),
               'authenticated ejecuta checkout_con_recargo');
  perform t.ok(has_function_privilege('authenticated', 'public.checkin_con_recargo(bigint,numeric,text,boolean)', 'execute'),
               'authenticated ejecuta checkin_con_recargo');
  perform t.ok(not has_function_privilege('anon', 'public.calcular_recargo_horario(bigint,text,timestamptz)', 'execute')
               and not has_function_privilege('anon', 'public.checkout_con_recargo(bigint,numeric,text,boolean)', 'execute')
               and not has_function_privilege('anon', 'public.checkin_con_recargo(bigint,numeric,text,boolean)', 'execute'),
               'anon no ejecuta ninguna de las funciones de recargo');
  perform t.ok(not has_function_privilege('authenticated', 'public.fn_seed_conceptos_horarios(bigint)', 'execute'),
               'authenticated no puede sembrar conceptos');
end $$;

-- ─── Configuracion: quien escribe y que valida ───────────────────────────────
do $$
begin
  -- Recepcionista y limpiador leen pero no escriben.
  perform t.actuar(t.g('a_rec'), t.g('ta')::bigint);
  perform t.falla(format(
    'insert into public.config_horarios_establecimiento (fk_establecimiento) values (%s)', t.g('a_estab')),
    '42501', 'la recepcionista no crea la configuracion de horarios');
  perform t.volver();

  perform t.actuar(t.g('a_lim'), t.g('ta')::bigint);
  perform t.falla(format(
    'insert into public.config_horarios_establecimiento (fk_establecimiento) values (%s)', t.g('a_estab')),
    '42501', 'el limpiador no crea la configuracion de horarios');
  perform t.volver();

  -- El gerente crea la fila con valores explicitos: 11:00, 30 min, 25 %.
  perform t.actuar(t.g('a_ger'), t.g('ta')::bigint);
  insert into public.config_horarios_establecimiento
    (fk_establecimiento, hora_checkin, hora_checkout, tolerancia_min, metodo_recargo, valor_recargo)
  values (t.g('a_estab')::bigint, '14:00', '11:00', 30, 'PORCENTAJE', 25);
  perform t.ok(t.cuenta('select count(*) from public.config_horarios_establecimiento') = 1,
               'el gerente crea la configuracion de su establecimiento');
  perform t.ok((select tenant_id from public.config_horarios_establecimiento) = t.g('ta')::bigint,
               'la configuracion toma el tenant del JWT');
  perform t.volver();

  perform t.actuar(t.g('a_rec'), t.g('ta')::bigint);
  perform t.ok(t.cuenta('select count(*) from public.config_horarios_establecimiento') = 1,
               'la recepcionista puede leer la configuracion');
  perform t.filas('update public.config_horarios_establecimiento set tolerancia_min = 999', 0,
                  'la recepcionista no modifica la configuracion');
  perform t.filas('delete from public.config_horarios_establecimiento', 0,
                  'la recepcionista no borra la configuracion');
  perform t.volver();

  perform t.actuar(t.g('a_admin'), t.g('ta')::bigint);
  perform t.filas('update public.config_horarios_establecimiento set tolerancia_min = 30', 1,
                  'el administrador modifica la configuracion');
  perform t.falla(format(
    'insert into public.config_horarios_establecimiento (fk_establecimiento) values (%s)', t.g('a_estab')),
    '23505', 'una sola configuracion por establecimiento');
  perform t.falla('update public.config_horarios_establecimiento set tolerancia_min = -1',
    '23514', 'la tolerancia no puede ser negativa');
  perform t.falla('update public.config_horarios_establecimiento set metodo_recargo = ''OTRO''',
    '23514', 'el metodo de recargo es PORCENTAJE o FIJO_HORA');
  perform t.falla('update public.config_horarios_establecimiento set valor_recargo = 150',
    '23514', 'un porcentaje no puede superar 100');
  perform t.falla('update public.config_horarios_establecimiento set valor_recargo = -5',
    '23514', 'el valor del recargo no puede ser negativo');
  perform t.volver();

  -- Defaults de columna.
  perform t.actuar(t.g('b_admin'), t.g('tb')::bigint);
  insert into public.config_horarios_establecimiento (fk_establecimiento) values (t.g('b_estab')::bigint);
  perform t.ok((select hora_checkin = time '14:00' and hora_checkout = time '11:00' and tolerancia_min = 30
                       and metodo_recargo = 'PORCENTAJE' and valor_recargo = 25
                from public.config_horarios_establecimiento),
               'los valores por defecto son 14:00, 11:00, 30 min y 25 %');
  perform t.volver();
end $$;

-- ─── calcular_recargo_horario: late check-out, porcentaje ────────────────────
-- Salida 2031-06-11, hora 11:00, tolerancia 30, 25 % de Gs 300.000.
do $$
declare
  v_r bigint; v record;
begin
  perform set_config('test.r_calc', t.reserva('Check-in', date '2031-06-10', date '2031-06-11', 300000)::text, true);
  v_r := t.g('r_calc')::bigint;

  perform t.actuar(t.g('a_rec'), t.g('ta')::bigint);

  select * into v from public.calcular_recargo_horario(v_r, 'LATE_CHECKOUT', t.mom('2031-06-11 13:00'));
  perform t.ok(v.monto_sugerido = 75000 and v.minutos_exceso = 120,
               'checkout a las 13:00 (hora 11:00, tolerancia 30): 25 % de 300.000 = 75.000');
  perform t.ok(v.metodo = 'PORCENTAJE' and v.tolerancia_min = 30 and v.valor_recargo = 25 and v.tarifa_noche = 300000,
               'el resultado informa metodo, tolerancia, valor y tarifa usados');
  perform t.ok(v.concepto_id = (select id_concepto from public.conceptos
                                where tenant_id = t.g('ta')::bigint and nombre = 'Late check-out'),
               'el recargo apunta al concepto Late check-out del tenant');

  select * into v from public.calcular_recargo_horario(v_r, 'LATE_CHECKOUT', t.mom('2031-06-11 11:30'));
  perform t.ok(v.monto_sugerido = 0 and v.minutos_exceso = 30,
               'checkout 11:30 (justo en la tolerancia): sin recargo');

  select * into v from public.calcular_recargo_horario(v_r, 'LATE_CHECKOUT', t.mom('2031-06-11 11:31'));
  perform t.ok(v.monto_sugerido = 75000 and v.minutos_exceso = 31,
               'checkout 11:31 (un minuto sobre la tolerancia): recargo completo');

  select * into v from public.calcular_recargo_horario(v_r, 'LATE_CHECKOUT', t.mom('2031-06-11 09:00'));
  perform t.ok(v.monto_sugerido = 0 and v.minutos_exceso = 0,
               'checkout antes de la hora: sin recargo y exceso 0 (no negativo)');

  select * into v from public.calcular_recargo_horario(v_r, 'LATE_CHECKOUT', t.mom('2031-06-10 22:00'));
  perform t.ok(v.monto_sugerido = 0 and v.minutos_exceso = 0,
               'checkout el dia anterior a la salida: sin recargo');

  -- La hora se lee en Paraguay, no en UTC: el instante 16:00 UTC no son las
  -- 16:00 locales (Paraguay no esta en UTC), asi que el exceso no puede ser 300.
  select * into v from public.calcular_recargo_horario(v_r, 'LATE_CHECKOUT',
                      timestamptz '2031-06-11 16:00:00+00');
  perform t.ok(v.minutos_exceso = floor(extract(epoch from
                 ((timestamptz '2031-06-11 16:00:00+00' at time zone 'America/Asuncion')
                  - timestamp '2031-06-11 11:00')) / 60)
               and v.minutos_exceso <> 300,
               'el exceso se mide con la hora local de America/Asuncion, no con UTC');

  -- Tipo invalido y reserva inexistente.
  perform t.falla(format('select * from public.calcular_recargo_horario(%s, ''NADA'')', v_r),
                  '22023', 'un tipo de recargo desconocido se rechaza');
  perform t.falla('select * from public.calcular_recargo_horario(-1, ''LATE_CHECKOUT'')',
                  'P0002', 'una reserva inexistente se rechaza');
  perform t.volver();
end $$;

-- ─── calcular_recargo_horario: importe fijo por hora ─────────────────────────
do $$
declare
  v_r bigint := t.g('r_calc')::bigint; v record;
begin
  perform t.actuar(t.g('a_admin'), t.g('ta')::bigint);
  update public.config_horarios_establecimiento
  set metodo_recargo = 'FIJO_HORA', valor_recargo = 20000;
  perform t.volver();

  perform t.actuar(t.g('a_rec'), t.g('ta')::bigint);

  select * into v from public.calcular_recargo_horario(v_r, 'LATE_CHECKOUT', t.mom('2031-06-11 11:31'));
  perform t.ok(v.monto_sugerido = 20000 and v.metodo = 'FIJO_HORA',
               'FIJO_HORA: 31 minutos de exceso se cobran como 1 hora');

  select * into v from public.calcular_recargo_horario(v_r, 'LATE_CHECKOUT', t.mom('2031-06-11 12:00'));
  perform t.ok(v.monto_sugerido = 20000 and v.minutos_exceso = 60,
               'FIJO_HORA: exactamente 60 minutos son 1 hora');

  select * into v from public.calcular_recargo_horario(v_r, 'LATE_CHECKOUT', t.mom('2031-06-11 12:01'));
  perform t.ok(v.monto_sugerido = 40000,
               'FIJO_HORA: 61 minutos se redondean hacia arriba a 2 horas');

  select * into v from public.calcular_recargo_horario(v_r, 'LATE_CHECKOUT', t.mom('2031-06-11 14:10'));
  perform t.ok(v.monto_sugerido = 80000 and v.minutos_exceso = 190,
               'FIJO_HORA: 190 minutos son 4 horas (se cuenta desde la hora pactada)');

  select * into v from public.calcular_recargo_horario(v_r, 'LATE_CHECKOUT', t.mom('2031-06-11 11:20'));
  perform t.ok(v.monto_sugerido = 0,
               'FIJO_HORA: dentro de la tolerancia no se cobra');
  perform t.volver();

  -- Un fijo con decimales se redondea a guaranies enteros.
  perform t.actuar(t.g('a_admin'), t.g('ta')::bigint);
  update public.config_horarios_establecimiento set valor_recargo = 15000.5;
  perform t.volver();
  perform t.actuar(t.g('a_rec'), t.g('ta')::bigint);
  select * into v from public.calcular_recargo_horario(v_r, 'LATE_CHECKOUT', t.mom('2031-06-11 12:30'));
  perform t.ok(v.monto_sugerido = round(v.monto_sugerido) and v.monto_sugerido = 30001,
               'el monto sugerido se redondea a guaranies enteros');
  perform t.volver();
end $$;

-- ─── calcular_recargo_horario: early check-in ────────────────────────────────
-- Entrada 2031-07-10, hora 14:00.
do $$
declare
  v_r bigint; v record;
begin
  perform t.actuar(t.g('a_admin'), t.g('ta')::bigint);
  update public.config_horarios_establecimiento
  set metodo_recargo = 'PORCENTAJE', valor_recargo = 25;
  perform t.volver();

  perform set_config('test.r_early', t.reserva('Confirmada', date '2031-07-10', date '2031-07-12', 300000)::text, true);
  v_r := t.g('r_early')::bigint;

  perform t.actuar(t.g('a_rec'), t.g('ta')::bigint);

  select * into v from public.calcular_recargo_horario(v_r, 'EARLY_CHECKIN', t.mom('2031-07-10 10:00'));
  perform t.ok(v.monto_sugerido = 75000 and v.minutos_exceso = 240,
               'early check-in a las 10:00 (hora 14:00): 25 % de la tarifa por noche');
  perform t.ok(v.concepto_id = (select id_concepto from public.conceptos
                                where tenant_id = t.g('ta')::bigint and nombre = 'Early check-in'),
               'el early check-in apunta al concepto Early check-in');

  select * into v from public.calcular_recargo_horario(v_r, 'EARLY_CHECKIN', t.mom('2031-07-10 13:30'));
  perform t.ok(v.monto_sugerido = 0 and v.minutos_exceso = 30,
               'early check-in 30 minutos antes (en la tolerancia): sin recargo');

  select * into v from public.calcular_recargo_horario(v_r, 'EARLY_CHECKIN', t.mom('2031-07-10 13:29'));
  perform t.ok(v.monto_sugerido = 75000,
               'early check-in 31 minutos antes: recargo');

  select * into v from public.calcular_recargo_horario(v_r, 'EARLY_CHECKIN', t.mom('2031-07-10 15:00'));
  perform t.ok(v.monto_sugerido = 0 and v.minutos_exceso = 0,
               'check-in despues de la hora pactada: sin recargo');

  select * into v from public.calcular_recargo_horario(v_r, 'EARLY_CHECKIN', t.mom('2031-07-11 01:00'));
  perform t.ok(v.monto_sugerido = 0,
               'check-in un dia despues de la entrada: sin recargo');
  perform t.volver();
end $$;

-- ─── calcular_recargo_horario: sin configuracion usa los defaults ────────────
do $$
declare
  v_r bigint := t.g('r_calc')::bigint; v record;
begin
  perform t.actuar(t.g('a_admin'), t.g('ta')::bigint);
  perform t.filas('delete from public.config_horarios_establecimiento', 1,
                  'se elimina la configuracion de A para probar los defaults');
  perform t.volver();

  perform t.actuar(t.g('a_rec'), t.g('ta')::bigint);
  select * into v from public.calcular_recargo_horario(v_r, 'LATE_CHECKOUT', t.mom('2031-06-11 13:00'));
  perform t.ok(v.monto_sugerido = 75000 and v.metodo = 'PORCENTAJE'
               and v.tolerancia_min = 30 and v.valor_recargo = 25,
               'sin fila de configuracion: 11:00, 30 min y 25 % por defecto, sin error');
  select * into v from public.calcular_recargo_horario(v_r, 'LATE_CHECKOUT', t.mom('2031-06-11 11:30'));
  perform t.ok(v.monto_sugerido = 0, 'sin configuracion: la tolerancia por defecto es 30 min');
  select * into v from public.calcular_recargo_horario(t.g('r_early')::bigint, 'EARLY_CHECKIN', t.mom('2031-07-10 10:00'));
  perform t.ok(v.monto_sugerido = 75000, 'sin configuracion: el check-in por defecto es 14:00');
  perform t.volver();

  -- Una reserva sin habitaciones tampoco tiene establecimiento: defaults y tarifa 0.
  perform set_config('test.r_sinhab',
    t.reserva('Check-in', date '2031-06-10', date '2031-06-11', 0, false)::text, true);
  perform t.actuar(t.g('a_rec'), t.g('ta')::bigint);
  select * into v from public.calcular_recargo_horario(t.g('r_sinhab')::bigint, 'LATE_CHECKOUT', t.mom('2031-06-11 13:00'));
  perform t.ok(v.monto_sugerido = 0 and v.tarifa_noche = 0,
               'una reserva sin habitaciones no genera error ni recargo');
  perform t.volver();

  -- Se restaura la configuracion para las pruebas siguientes.
  perform t.actuar(t.g('a_admin'), t.g('ta')::bigint);
  insert into public.config_horarios_establecimiento
    (fk_establecimiento, hora_checkin, hora_checkout, tolerancia_min, metodo_recargo, valor_recargo)
  values (t.g('a_estab')::bigint, '14:00', '11:00', 30, 'PORCENTAJE', 25);
  perform t.volver();
end $$;

-- La tarifa de la noche es la mas alta de las habitaciones activas.
do $$
declare
  v_r bigint; v record;
begin
  v_r := t.reserva('Check-in', date '2031-08-01', date '2031-08-02', 300000);
  insert into public.detalle_reservas
    (tenant_id, fk_reserva, fk_habitacion, fk_tarifa, precio_unitario, subtotal)
  values (t.g('ta')::bigint, v_r, t.g('a_hab')::bigint, t.g('a_tarifa')::bigint, 500000, 500000);
  insert into public.detalle_reservas
    (tenant_id, fk_reserva, fk_habitacion, fk_tarifa, precio_unitario, subtotal, estado)
  values (t.g('ta')::bigint, v_r, t.g('a_hab')::bigint, t.g('a_tarifa')::bigint, 900000, 900000, 'Inactivo');

  perform t.actuar(t.g('a_rec'), t.g('ta')::bigint);
  select * into v from public.calcular_recargo_horario(v_r, 'LATE_CHECKOUT', t.mom('2031-08-02 13:00'));
  perform t.ok(v.tarifa_noche = 500000 and v.monto_sugerido = 125000,
               'PORCENTAJE usa la tarifa de noche mas alta de las habitaciones activas (la inactiva no cuenta)');
  perform t.volver();
end $$;

-- ─── Horas reales de check-in / check-out ────────────────────────────────────
do $$
declare v_r bigint;
begin
  v_r := t.reserva('Confirmada', date '2031-09-01', date '2031-09-02', 300000);
  perform t.ok((select checkin_real_at is null and checkout_real_at is null from public.reservas where id_reserva = v_r),
               'una reserva nueva no tiene horas reales');
  update public.reservas set estado = 'Check-in' where id_reserva = v_r;
  perform t.ok((select checkin_real_at is not null and checkout_real_at is null from public.reservas where id_reserva = v_r),
               'al pasar a Check-in se registra checkin_real_at');
  update public.reservas set estado = 'Check-out' where id_reserva = v_r;
  perform t.ok((select checkin_real_at is not null and checkout_real_at is not null from public.reservas where id_reserva = v_r),
               'al pasar a Check-out se registra checkout_real_at');
  perform t.ok((select count(*) from public.historial_estancia
                where fk_reserva = v_r and tipo_movimiento = 'CAMBIO_ESTADO') = 2,
               'los triggers de 0005 siguen registrando el historial de estados');
end $$;

-- ─── checkout_con_recargo ────────────────────────────────────────────────────
-- Salida muy pasada (2020): el exceso supera cualquier tolerancia y el 25 % de
-- 300.000 da siempre 75.000.
do $$
declare
  v_r bigint; v_f bigint; v jsonb;
begin
  v_r := t.reserva('Check-in', date '2020-01-01', date '2020-01-02', 300000);
  v_f := t.folio(v_r, 300000);
  perform set_config('test.rc1', v_r::text, true);
  perform set_config('test.rc1_folio', v_f::text, true);

  perform t.actuar(t.g('a_rec'), t.g('ta')::bigint);
  v := public.checkout_con_recargo(v_r);
  perform t.volver();

  perform t.ok(v ->> 'accion' = 'APLICADO' and (v ->> 'monto_sugerido')::numeric = 75000
               and (v ->> 'monto_final')::numeric = 75000 and v ->> 'estado' = 'Check-out',
               'checkout aceptando la sugerencia: recargo APLICADO de 75.000');
  perform t.ok((select estado from public.reservas where id_reserva = v_r) = 'Check-out',
               'el RPC deja la reserva en Check-out');
  perform t.ok((select checkout_real_at is not null from public.reservas where id_reserva = v_r),
               'el RPC registra checkout_real_at');
  perform t.ok((select count(*) from public.cargos_folio c
                join public.conceptos k on k.id_concepto = c.fk_concepto and k.tenant_id = c.tenant_id
                where c.fk_folio = v_f and k.nombre = 'Late check-out'
                  and c.monto_total = 75000 and c.cantidad = 1 and c.fk_usuario = t.g('a_rec_id')::bigint
                  and upper(c.estado) = 'ACTIVO') = 1,
               'el recargo queda como cargo ACTIVO del folio, a nombre de quien opero');
  perform t.ok((select total_acumulado from public.folios where id_folio = v_f) = 375000,
               'el total del folio incluye el recargo');
  perform t.ok((select lower(estado) from public.folios where id_folio = v_f) = 'cerrado',
               'el folio queda cerrado despues del check-out (el cargo entro antes)');
  perform t.ok((select count(*) from public.historial_estancia
                where fk_reserva = v_r and tipo_movimiento = 'RECARGO_APLICADO'
                  and fk_usuario = t.g('a_rec_id')::bigint
                  and descripcion like '%sugerido 75000 Gs, final 75000 Gs%') = 1,
               'historial RECARGO_APLICADO con actor, sugerido y final');
  perform t.ok((select count(*) from public.historial_estancia
                where fk_reserva = v_r and tipo_movimiento = 'CAMBIO_ESTADO') = 1,
               'ademas se registra el CAMBIO_ESTADO normal');
end $$;

-- Exoneracion: exige motivo; con motivo no hay cargo y queda constancia.
do $$
declare
  v_r bigint; v_f bigint; v jsonb;
begin
  v_r := t.reserva('Check-in', date '2020-01-01', date '2020-01-02', 300000);
  v_f := t.folio(v_r, 300000);

  perform t.actuar(t.g('a_rec'), t.g('ta')::bigint);
  perform t.falla(format('select public.checkout_con_recargo(%s, null, null, true)', v_r),
                  '22023', 'exonerar sin motivo falla');
  perform t.falla(format('select public.checkout_con_recargo(%s, null, ''   '', true)', v_r),
                  '22023', 'un motivo en blanco no vale para exonerar');
  perform t.ok((select estado from public.reservas where id_reserva = v_r) = 'Check-in'
               and not exists (select 1 from public.cargos_folio where fk_folio = v_f)
               and not exists (select 1 from public.historial_estancia where fk_reserva = v_r),
               'tras la exoneracion rechazada no cambio nada');

  v := public.checkout_con_recargo(v_r, null, 'Cliente frecuente, autorizado por gerencia', true);
  perform t.volver();

  perform t.ok(v ->> 'accion' = 'EXONERADO' and (v ->> 'monto_final')::numeric = 0
               and (v ->> 'monto_sugerido')::numeric = 75000,
               'exonerar con motivo: accion EXONERADO, final 0, sugerido 75.000');
  perform t.ok((select estado from public.reservas where id_reserva = v_r) = 'Check-out'
               and not exists (select 1 from public.cargos_folio where fk_folio = v_f),
               'exonerado: check-out hecho y sin cargo en el folio');
  perform t.ok((select total_acumulado from public.folios where id_folio = v_f) = 300000
               and (select lower(estado) from public.folios where id_folio = v_f) = 'cerrado',
               'exonerado: el folio no cambia de total y se cierra');
  perform t.ok((select count(*) from public.historial_estancia
                where fk_reserva = v_r and tipo_movimiento = 'RECARGO_EXONERADO'
                  and fk_usuario = t.g('a_rec_id')::bigint
                  and descripcion like '%sugerido 75000 Gs, final 0 Gs%'
                  and descripcion like '%Cliente frecuente, autorizado por gerencia%') = 1,
               'historial RECARGO_EXONERADO con actor, montos y motivo');

  -- Un monto 0 explicito (con motivo) tambien es una exoneracion.
  v_r := t.reserva('Check-in', date '2020-01-01', date '2020-01-02', 300000);
  perform t.folio(v_r, 0);
  perform t.actuar(t.g('a_rec'), t.g('ta')::bigint);
  v := public.checkout_con_recargo(v_r, 0, 'Falla del ascensor');
  perform t.volver();
  perform t.ok(v ->> 'accion' = 'EXONERADO'
               and exists (select 1 from public.historial_estancia
                           where fk_reserva = v_r and tipo_movimiento = 'RECARGO_EXONERADO'),
               'p_monto = 0 con motivo se registra como exoneracion');
end $$;

-- Monto editado: exige motivo; con motivo se cobra el monto editado.
do $$
declare
  v_r bigint; v_f bigint; v jsonb;
begin
  v_r := t.reserva('Check-in', date '2020-01-01', date '2020-01-02', 300000);
  v_f := t.folio(v_r, 300000);

  perform t.actuar(t.g('a_rec'), t.g('ta')::bigint);
  perform t.falla(format('select public.checkout_con_recargo(%s, 50000, null, false)', v_r),
                  '22023', 'editar el monto sin motivo falla');
  perform t.falla(format('select public.checkout_con_recargo(%s, -1, ''x'', false)', v_r),
                  '22023', 'un monto negativo se rechaza');
  perform t.ok((select estado from public.reservas where id_reserva = v_r) = 'Check-in'
               and not exists (select 1 from public.cargos_folio where fk_folio = v_f),
               'tras la edicion rechazada no cambio nada');

  v := public.checkout_con_recargo(v_r, 50000, 'Acuerdo con el huesped');
  perform t.volver();

  perform t.ok(v ->> 'accion' = 'MODIFICADO' and (v ->> 'monto_final')::numeric = 50000,
               'editar con motivo: accion MODIFICADO con el monto editado');
  perform t.ok((select count(*) from public.cargos_folio
                where fk_folio = v_f and monto_total = 50000) = 1
               and (select total_acumulado from public.folios where id_folio = v_f) = 350000,
               'se cobra el monto editado y el total del folio lo refleja');
  perform t.ok((select count(*) from public.historial_estancia
                where fk_reserva = v_r and tipo_movimiento = 'RECARGO_MODIFICADO'
                  and fk_usuario = t.g('a_rec_id')::bigint
                  and descripcion like '%sugerido 75000 Gs, final 50000 Gs%'
                  and descripcion like '%Acuerdo con el huesped%') = 1,
               'historial RECARGO_MODIFICADO con actor, sugerido, final y motivo');
end $$;

-- Dentro de la tolerancia (salida en 2099): el RPC funciona con monto 0.
do $$
declare
  v_r bigint; v_f bigint; v jsonb;
begin
  v_r := t.reserva('Check-in', date '2099-01-01', date '2099-01-02', 300000);
  v_f := t.folio(v_r, 300000);

  perform t.actuar(t.g('a_rec'), t.g('ta')::bigint);
  perform t.falla(format('select public.checkout_con_recargo(%s, 10000, null, false)', v_r),
                  '22023', 'cobrar de mas dentro de la tolerancia tambien exige motivo');
  v := public.checkout_con_recargo(v_r);
  perform t.volver();

  perform t.ok(v ->> 'accion' = 'NINGUNO' and (v ->> 'monto_final')::numeric = 0
               and (v ->> 'monto_sugerido')::numeric = 0 and v -> 'id_cargo' = 'null'::jsonb,
               'dentro de la tolerancia: check-out sin recargo, accion NINGUNO');
  perform t.ok((select estado from public.reservas where id_reserva = v_r) = 'Check-out'
               and not exists (select 1 from public.cargos_folio where fk_folio = v_f)
               and (select lower(estado) from public.folios where id_folio = v_f) = 'cerrado',
               'sin recargo igual se hace el check-out y se cierra el folio');
  perform t.ok(not exists (select 1 from public.historial_estancia
                           where fk_reserva = v_r and tipo_movimiento like 'RECARGO\_%'),
               'sin recargo no se escribe historial de recargo');

  -- Cobrar algo dentro de la tolerancia, con motivo, es una modificacion.
  v_r := t.reserva('Check-in', date '2099-01-01', date '2099-01-02', 300000);
  perform t.folio(v_r, 0);
  perform t.actuar(t.g('a_rec'), t.g('ta')::bigint);
  v := public.checkout_con_recargo(v_r, 10000, 'Consumo de la sala de reuniones');
  perform t.volver();
  perform t.ok(v ->> 'accion' = 'MODIFICADO' and (v ->> 'monto_final')::numeric = 10000,
               'cobrar dentro de la tolerancia con motivo se registra como MODIFICADO');
end $$;

-- Check-out sin folio previo: el recargo crea el folio y queda cerrado.
do $$
declare
  v_r bigint; v jsonb;
begin
  v_r := t.reserva('Check-in', date '2020-01-01', date '2020-01-02', 300000);
  perform t.actuar(t.g('a_rec'), t.g('ta')::bigint);
  v := public.checkout_con_recargo(v_r);
  perform t.volver();
  perform t.ok((v ->> 'folio_creado')::boolean
               and (select count(*) from public.folios where fk_reserva = v_r and lower(estado) = 'cerrado') = 1
               and (select total_acumulado from public.folios where fk_reserva = v_r) = 75000,
               'un check-out con recargo y sin folio crea el folio, lo carga y lo cierra');
end $$;

-- Estados invalidos y permisos.
do $$
declare
  v_conf bigint; v_out bigint;
begin
  v_conf := t.reserva('Confirmada', date '2020-01-01', date '2020-01-02', 300000);
  v_out  := t.reserva('Check-out', date '2020-01-01', date '2020-01-02', 300000);
  perform set_config('test.r_conf', v_conf::text, true);

  perform t.actuar(t.g('a_rec'), t.g('ta')::bigint);
  perform t.falla(format('select public.checkout_con_recargo(%s)', v_conf),
                  '55000', 'no se hace check-out de una reserva Confirmada');
  perform t.falla(format('select public.checkout_con_recargo(%s)', v_out),
                  '55000', 'no se repite el check-out de una reserva ya cerrada');
  perform t.falla(format('select public.checkin_con_recargo(%s)', v_out),
                  '55000', 'no se hace check-in de una reserva en Check-out');
  perform t.falla('select public.checkout_con_recargo(-1)', 'P0002', 'reserva inexistente');
  perform t.volver();

  perform t.actuar(t.g('a_lim'), t.g('ta')::bigint);
  perform t.falla(format('select public.checkout_con_recargo(%s)', t.g('rc1')),
                  '42501', 'el limpiador no puede operar el check-out');
  perform t.falla(format('select public.checkin_con_recargo(%s)', v_conf),
                  '42501', 'el limpiador no puede operar el check-in');
  perform t.volver();
end $$;

-- Atomicidad: si falla el ultimo paso (el cambio de estado), no queda ni el
-- cargo, ni el historial, ni el total del folio. Un trigger de prueba hace
-- fallar el UPDATE de estado de una reserva puntual.
do $$
declare
  v_r bigint; v_f bigint;
begin
  v_r := t.reserva('Check-in', date '2020-01-01', date '2020-01-02', 300000);
  v_f := t.folio(v_r, 300000);

  execute format(
    'create function t.boom() returns trigger language plpgsql as $b$ '
    'begin if new.id_reserva = %s then raise exception ''boom'' using errcode = ''P0001''; end if; '
    'return new; end $b$', v_r);
  create trigger t_boom before update of estado on public.reservas
    for each row execute function t.boom();

  perform t.actuar(t.g('a_rec'), t.g('ta')::bigint);
  perform t.falla(format('select public.checkout_con_recargo(%s)', v_r),
                  'P0001', 'un fallo en el cambio de estado aborta el check-out');
  perform t.volver();

  perform t.ok((select estado from public.reservas where id_reserva = v_r) = 'Check-in'
               and not exists (select 1 from public.cargos_folio where fk_folio = v_f)
               and not exists (select 1 from public.historial_estancia where fk_reserva = v_r)
               and (select total_acumulado from public.folios where id_folio = v_f) = 300000
               and (select lower(estado) from public.folios where id_folio = v_f) = 'abierto',
               'atomicidad: sin cargo, sin historial, folio intacto y abierto tras el fallo');

  drop trigger t_boom on public.reservas;
  drop function t.boom();

  perform t.actuar(t.g('a_rec'), t.g('ta')::bigint);
  perform public.checkout_con_recargo(v_r);
  perform t.volver();
  perform t.ok((select estado from public.reservas where id_reserva = v_r) = 'Check-out'
               and (select count(*) from public.cargos_folio where fk_folio = v_f and monto_total = 75000) = 1,
               'sin el fallo, el mismo check-out se completa con su cargo');
end $$;

-- ─── checkin_con_recargo ─────────────────────────────────────────────────────
-- Entrada en 2099: ahora falta muchisimo para la hora de ingreso -> 75.000.
do $$
declare
  v_r bigint; v jsonb; v_f bigint;
begin
  v_r := t.reserva('Confirmada', date '2099-01-01', date '2099-01-03', 300000);

  perform t.actuar(t.g('a_rec'), t.g('ta')::bigint);
  perform t.falla(format('select public.checkin_con_recargo(%s, 40000, null)', v_r),
                  '22023', 'editar el monto del early check-in sin motivo falla');
  v := public.checkin_con_recargo(v_r);
  perform t.volver();
  v_f := (v ->> 'id_folio')::bigint;

  perform t.ok(v ->> 'accion' = 'APLICADO' and (v ->> 'monto_final')::numeric = 75000
               and v ->> 'estado' = 'Check-in' and (v ->> 'folio_creado')::boolean,
               'check-in con recargo: APLICADO 75.000 y folio creado');
  perform t.ok((select estado from public.reservas where id_reserva = v_r) = 'Check-in'
               and (select checkin_real_at is not null from public.reservas where id_reserva = v_r),
               'el RPC deja la reserva en Check-in con checkin_real_at');
  perform t.ok((select lower(estado) from public.folios where id_folio = v_f) = 'abierto'
               and (select count(*) from public.folios where fk_reserva = v_r) = 1,
               'el folio nace abierto y es unico');
  perform t.ok((select count(*) from public.cargos_folio c
                join public.conceptos k on k.id_concepto = c.fk_concepto and k.tenant_id = c.tenant_id
                where c.fk_folio = v_f and k.nombre = 'Alojamiento'
                  and c.monto_total = 600000 and c.cantidad = 2) = 1,
               'el RPC carga el Alojamiento automatico (2 noches, 600.000)');
  perform t.ok((select count(*) from public.cargos_folio c
                join public.conceptos k on k.id_concepto = c.fk_concepto and k.tenant_id = c.tenant_id
                where c.fk_folio = v_f and k.nombre = 'Early check-in' and c.monto_total = 75000) = 1,
               'el early check-in queda como cargo del folio');
  perform t.ok((select total_acumulado from public.folios where id_folio = v_f) = 675000,
               'el total del folio suma alojamiento y recargo');
  perform t.ok((select count(*) from public.historial_estancia
                where fk_reserva = v_r and tipo_movimiento = 'RECARGO_APLICADO'
                  and fk_usuario = t.g('a_rec_id')::bigint
                  and descripcion like 'Early check-in:%') = 1,
               'historial RECARGO_APLICADO del early check-in con actor');
end $$;

-- Check-in exonerado y check-in sin recargo (entrada ya vencida).
do $$
declare
  v_r bigint; v jsonb;
begin
  v_r := t.reserva('Pendiente', date '2099-02-01', date '2099-02-02', 300000);
  perform t.actuar(t.g('a_rec'), t.g('ta')::bigint);
  perform t.falla(format('select public.checkin_con_recargo(%s, null, null, true)', v_r),
                  '22023', 'exonerar el early check-in sin motivo falla');
  v := public.checkin_con_recargo(v_r, null, 'Habitacion lista desde la noche anterior', true);
  perform t.volver();
  perform t.ok(v ->> 'accion' = 'EXONERADO' and (v ->> 'monto_final')::numeric = 0,
               'early check-in exonerado con motivo');
  perform t.ok((select count(*) from public.cargos_folio c
                join public.conceptos k on k.id_concepto = c.fk_concepto and k.tenant_id = c.tenant_id
                where c.fk_folio = (v ->> 'id_folio')::bigint and k.nombre = 'Early check-in') = 0
               and (select count(*) from public.historial_estancia
                    where fk_reserva = v_r and tipo_movimiento = 'RECARGO_EXONERADO'
                      and descripcion like '%Habitacion lista desde la noche anterior%') = 1,
               'exonerado: sin cargo de early check-in y con constancia en el historial');

  v_r := t.reserva('Confirmada', date '2020-03-01', date '2020-03-02', 300000);
  perform t.actuar(t.g('a_rec'), t.g('ta')::bigint);
  v := public.checkin_con_recargo(v_r);
  perform t.volver();
  perform t.ok(v ->> 'accion' = 'NINGUNO' and (v ->> 'folio_creado')::boolean
               and (select total_acumulado from public.folios where id_folio = (v ->> 'id_folio')::bigint) = 300000,
               'check-in despues de la hora: sin recargo, folio con solo el alojamiento');

  -- Si ya hay un folio (el check-in se reintenta), no se duplica ni se recarga.
  v_r := t.reserva('Confirmada', date '2020-03-01', date '2020-03-02', 300000);
  perform t.folio(v_r, 300000);
  perform t.actuar(t.g('a_rec'), t.g('ta')::bigint);
  v := public.checkin_con_recargo(v_r);
  perform t.volver();
  perform t.ok(not (v ->> 'folio_creado')::boolean
               and (select count(*) from public.folios where fk_reserva = v_r) = 1
               and not exists (select 1 from public.cargos_folio c
                               join public.folios f on f.id_folio = c.fk_folio and f.tenant_id = c.tenant_id
                               where f.fk_reserva = v_r),
               'con un folio existente no se crea otro ni se repite el alojamiento');

  -- Sin habitaciones no hay check-in.
  v_r := t.reserva('Confirmada', date '2020-03-01', date '2020-03-02', 0, false);
  perform t.actuar(t.g('a_rec'), t.g('ta')::bigint);
  perform t.falla(format('select public.checkin_con_recargo(%s)', v_r),
                  '55000', 'no se hace check-in sin habitaciones');
  perform t.falla(format('select public.checkin_con_recargo(%s)', t.g('rc1')),
                  '55000', 'no se hace check-in de una reserva ya en Check-out');
  perform t.volver();
end $$;

-- ─── Aislamiento entre tenants ───────────────────────────────────────────────
do $$
begin
  perform t.actuar(t.g('b_admin'), t.g('tb')::bigint);

  perform t.ok(t.cuenta('select count(*) from public.config_horarios_establecimiento') = 1
               and (select fk_establecimiento from public.config_horarios_establecimiento) = t.g('b_estab')::bigint,
               'B solo ve la configuracion de su propio establecimiento');
  perform t.filas('update public.config_horarios_establecimiento set tolerancia_min = 1 where tenant_id = ' || t.g('ta'), 0,
                  'B no modifica la configuracion de A');
  perform t.filas('delete from public.config_horarios_establecimiento where tenant_id = ' || t.g('ta'), 0,
                  'B no borra la configuracion de A');
  perform t.falla(format(
    'insert into public.config_horarios_establecimiento (fk_establecimiento) values (%s)', t.g('a_estab')),
    '23503', 'B no puede crear configuracion colgada de un establecimiento de A');
  perform t.falla(format(
    'insert into public.config_horarios_establecimiento (tenant_id, fk_establecimiento) values (%s, %s)',
    t.g('ta'), t.g('a_estab')),
    '42501', 'B no puede insertar configuracion con el tenant de A');

  perform t.falla(format('select * from public.calcular_recargo_horario(%s, ''LATE_CHECKOUT'')', t.g('r_calc')),
                  'P0002', 'B no calcula recargos sobre reservas de A');
  perform t.falla(format('select public.checkout_con_recargo(%s)', t.g('r_calc')),
                  'P0002', 'B no hace check-out de una reserva de A');
  perform t.falla(format('select public.checkin_con_recargo(%s)', t.g('r_conf')),
                  'P0002', 'B no hace check-in de una reserva de A');

  perform t.ok(t.cuenta('select count(*) from public.conceptos where nombre in (''Late check-out'', ''Early check-in'')') = 2,
               'B solo ve sus propios conceptos de recargo');
  perform t.ok((select estado from public.reservas where id_reserva = t.g('r_conf')::bigint) is null,
               'B no ve las reservas de A');
  perform t.volver();

  perform t.ok((select estado from public.reservas where id_reserva = t.g('r_conf')::bigint) = 'Confirmada',
               'la reserva de A sigue intacta tras los intentos de B');
end $$;

-- Un tenant nuevo recibe los conceptos por el trigger de alta, sin pasar por
-- fn_provision_tenant.
do $$
declare v_n bigint;
begin
  insert into public.tenants (nombre, slug, estado, plan)
  values ('Hotel CX C', 'hotel-cx-c', 'trial', 'trial')
  returning id into v_n;
  perform t.ok((select count(*) from public.conceptos
                where tenant_id = v_n and nombre in ('Late check-out', 'Early check-in')) = 2,
               'cualquier tenant nuevo recibe los conceptos de recargo por trigger');
end $$;

select 'TODAS LAS PRUEBAS DE CARGOS EXTRA PASARON' as resultado;

rollback;
