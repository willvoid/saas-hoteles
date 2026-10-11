-- ═══════════════════════════════════════════════════════════════════════════
-- Suite de aislamiento entre tenants
-- ═══════════════════════════════════════════════════════════════════════════
-- Crea dos hoteles (A y B) con personal de cada cargo y comprueba que uno no
-- puede ver, modificar ni enlazar datos del otro. Corre dentro de una
-- transaccion y la revierte al final: no deja nada en la base.
--
-- Requisitos: migraciones 0001-0011 y supabase/seed.sql aplicados.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f tests/aislamiento.sql
--
-- Cada prueba imprime "ok  - ..."; la primera que falla aborta con
-- "FALLO: ...". El script impersona usuarios fijando request.jwt.claims y
-- cambiando de rol, igual que lo hace PostgREST.
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

-- ─── Fixtures ────────────────────────────────────────────────────────────────
-- Dos hoteles dados de alta con fn_provision_tenant, mas personal creado por la
-- via del trigger handle_new_user (app_metadata del servidor).
do $$
declare
  c_ger bigint; c_rec bigint; c_lim bigint; c_adm bigint;
  v_contrib bigint := (select min(id_tipo_contribuyente) from public.tipo_contribuyente);
  v_regimen bigint := (select min(id_regimen) from public.tipo_regimen);
  v_res jsonb;
  v_ta bigint; v_tb bigint;
  v_estab_a bigint; v_estab_b bigint;
  v_edif bigint; v_piso bigint; v_th bigint; v_hab bigint;
  v_a_admin uuid := gen_random_uuid(); v_b_admin uuid := gen_random_uuid();
  v_a_ger uuid := gen_random_uuid(); v_a_rec uuid := gen_random_uuid(); v_a_lim uuid := gen_random_uuid();
  v_b_lim uuid := gen_random_uuid();
begin
  select id_cargo into c_adm from public.cargo where lower(cargo) in ('admin', 'administrador') limit 1;
  select id_cargo into c_ger from public.cargo where lower(cargo) = 'gerente' limit 1;
  select id_cargo into c_rec from public.cargo where lower(cargo) = 'recepcionista' limit 1;
  select id_cargo into c_lim from public.cargo where lower(cargo) in ('limpiador', 'limpiadora') limit 1;

  insert into auth.users (id, email) values
    (v_a_admin, 'admin@a.test'), (v_b_admin, 'admin@b.test');

  v_res := public.fn_provision_tenant(jsonb_build_object(
    'tenant', jsonb_build_object('nombre', 'Hotel A', 'slug', 'hotel-a'),
    'admin', jsonb_build_object('auth_id', v_a_admin, 'nombre', 'Admin A', 'documento', '1', 'fk_tipo_doc', 1),
    'empresa', jsonb_build_object('ruc', '80000001-1', 'razon_social', 'Hotel A SA',
                                  'fk_contribuyente', v_contrib, 'fk_regimen', v_regimen),
    'establecimiento', jsonb_build_object('direccion', 'Calle 1', 'fk_barrio', 1)));
  v_ta := (v_res ->> 'tenant_id')::bigint;
  v_estab_a := (v_res ->> 'id_establecimiento')::bigint;

  v_res := public.fn_provision_tenant(jsonb_build_object(
    'tenant', jsonb_build_object('nombre', 'Hotel B', 'slug', 'hotel-b'),
    'admin', jsonb_build_object('auth_id', v_b_admin, 'nombre', 'Admin B', 'documento', '2', 'fk_tipo_doc', 1),
    'empresa', jsonb_build_object('ruc', '80000002-2', 'razon_social', 'Hotel B SA',
                                  'fk_contribuyente', v_contrib, 'fk_regimen', v_regimen),
    'establecimiento', jsonb_build_object('direccion', 'Calle 2', 'fk_barrio', 1)));
  v_tb := (v_res ->> 'tenant_id')::bigint;
  v_estab_b := (v_res ->> 'id_establecimiento')::bigint;

  insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
    (v_a_ger, 'ger@a.test', jsonb_build_object('tenant_id', v_ta, 'fk_cargo', c_ger),
       jsonb_build_object('nombre', 'Gerente A', 'documento', '11', 'fk_tipo_doc', 1)),
    (v_a_rec, 'rec@a.test', jsonb_build_object('tenant_id', v_ta, 'fk_cargo', c_rec),
       jsonb_build_object('nombre', 'Recepcion A', 'documento', '12', 'fk_tipo_doc', 1)),
    (v_a_lim, 'lim@a.test', jsonb_build_object('tenant_id', v_ta, 'fk_cargo', c_lim),
       jsonb_build_object('nombre', 'Limpieza A', 'documento', '13', 'fk_tipo_doc', 1)),
    (v_b_lim, 'lim@b.test', jsonb_build_object('tenant_id', v_tb, 'fk_cargo', c_lim),
       jsonb_build_object('nombre', 'Limpieza B', 'documento', '21', 'fk_tipo_doc', 1));

  -- Planta fisica y tarifa de A.
  insert into public.edificios (tenant_id, nombre, estado, fk_sucursal)
    values (v_ta, 'Edificio A', 'Activo', v_estab_a) returning id into v_edif;
  insert into public.pisos (tenant_id, numero, estado, fk_edificio)
    values (v_ta, 1, 'Activo', v_edif) returning id into v_piso;
  insert into public.tipo_habitacion (tenant_id, nombre, descripcion, capacidad)
    values (v_ta, 'Doble', 'Habitacion doble', 2) returning id into v_th;
  insert into public.habitaciones (tenant_id, numero_habitacion, fk_tipo_habitacion, fk_piso)
    values (v_ta, 101, v_th, v_piso) returning id into v_hab;
  insert into public.tarifas (tenant_id, nombre, precio_base, estado, fk_tipo_habitacion, fecha_inicio)
    values (v_ta, 'Base', 100000, 'Activa', v_th, current_date - 30);

  perform set_config('test.ta', v_ta::text, true);
  perform set_config('test.tb', v_tb::text, true);
  perform set_config('test.a_estab', v_estab_a::text, true);
  perform set_config('test.b_estab', v_estab_b::text, true);
  perform set_config('test.a_th', v_th::text, true);
  perform set_config('test.a_hab', v_hab::text, true);
  perform set_config('test.a_admin', v_a_admin::text, true);
  perform set_config('test.b_admin', v_b_admin::text, true);
  perform set_config('test.a_ger', v_a_ger::text, true);
  perform set_config('test.a_rec', v_a_rec::text, true);
  perform set_config('test.a_lim', v_a_lim::text, true);
  perform set_config('test.c_adm', c_adm::text, true);

  perform t.ok(v_ta <> v_tb, 'provisioning crea dos tenants distintos');
  perform t.ok((select count(*) from public.usuario where tenant_id = v_ta) = 4,
               'handle_new_user creo el perfil del personal de A via app_metadata');
end $$;

-- ─── Aislamiento de datos entre A y B ────────────────────────────────────────
do $$
begin
  perform t.actuar(t.g('a_admin'), t.g('ta')::bigint);
  insert into public.clientes (razon_social, documento, celular, es_proveedor_del_estado)
    values ('Cliente A', 'CI-A', '0981', false);
  perform t.ok((select tenant_id from public.clientes where documento = 'CI-A') = t.g('ta')::bigint,
               'el insert toma el tenant del JWT sin que el cliente lo mande');
  perform t.volver();

  perform t.actuar(t.g('b_admin'), t.g('tb')::bigint);
  insert into public.clientes (razon_social, documento, celular, es_proveedor_del_estado)
    values ('Cliente B', 'CI-B', '0982', false);
  perform t.ok(t.cuenta('select count(*) from public.clientes where documento = ''CI-A''') = 0,
               'B no ve los clientes de A');
  perform t.filas('update public.clientes set celular = ''x'' where documento = ''CI-A''', 0,
                  'B no puede modificar clientes de A');
  perform t.filas('delete from public.clientes where documento = ''CI-A''', 0,
                  'B no puede borrar clientes de A');
  perform t.falla(format(
    'insert into public.clientes (tenant_id, razon_social, documento, celular, es_proveedor_del_estado) values (%s, ''Intruso'', ''X'', ''0'', false)',
    t.g('ta')), '42501', 'B no puede insertar filas con el tenant de A');
  perform t.falla(format(
    'update public.clientes set tenant_id = %s where documento = ''CI-B''', t.g('ta')),
    '42501', 'B no puede mover sus filas al tenant de A');
  perform t.volver();
end $$;

-- ─── Integridad entre tenants (FK compuestas) ────────────────────────────────
do $$
begin
  -- Como superusuario (RLS no aplica): una reserva de A no puede apuntar al
  -- cliente de B.
  perform t.falla(format(
    'insert into public.reservas (tenant_id, fecha_entrada, fecha_salida, fk_cliente, fk_usuario, origen)
     select %s, current_date, current_date + 1,
            (select id_cliente from public.clientes where documento = ''CI-B''),
            (select id_usuario from public.usuario where tenant_id = %s limit 1),
            ''TEST''', t.g('ta'), t.g('ta')),
    '23503', 'una reserva de A no puede referenciar un cliente de B');
end $$;

-- ─── anon ────────────────────────────────────────────────────────────────────
do $$
begin
  perform t.anonimo();
  perform t.falla('select count(*) from public.clientes', '42501', 'anon no lee tablas de tenant');
  perform t.falla('select count(*) from public.tenants', '42501', 'anon no lee tenants');
  perform t.falla('select public.fn_provision_tenant(''{}''::jsonb)', '42501', 'anon no puede dar de alta tenants');
  perform t.falla('select public.fn_landing_tenant(''hotel-a'')', '42501', 'anon no llama al resolvedor interno de slug');
  perform t.ok(public.fn_landing_catalogo('hotel-a') is not null, 'la landing resuelve el catalogo por slug');
  perform t.ok(public.fn_landing_catalogo('plantilla-base') is null, 'un tenant suspendido no se publica');
  perform t.ok(public.fn_landing_catalogo('no-existe') is null, 'un slug desconocido devuelve null');
  perform t.volver();
end $$;

-- ─── Roles dentro del tenant ─────────────────────────────────────────────────
do $$
begin
  perform t.actuar(t.g('a_lim'), t.g('ta')::bigint);
  perform t.ok(t.cuenta('select count(*) from public.clientes') >= 1, 'el limpiador puede leer');
  perform t.falla(
    'insert into public.clientes (razon_social, documento, celular, es_proveedor_del_estado) values (''L'', ''L1'', ''0'', false)',
    '42501', 'el limpiador no puede escribir en modulos operativos');
  perform t.volver();

  perform t.actuar(t.g('a_rec'), t.g('ta')::bigint);
  insert into public.clientes (razon_social, documento, celular, es_proveedor_del_estado)
    values ('Cliente Rec', 'CI-REC', '0983', false);
  perform t.ok(true, 'la recepcionista escribe en modulos operativos');
  perform t.falla(
    format('insert into public.datos_empresa (ruc, razon_social, nombre_fantasia, fk_contribuyente, fk_regimen, estado) values (''1'', ''X'', ''X'', 1, 1, ''Activo'')'),
    '42501', 'la recepcionista no inserta en datos_empresa (solo lo hace admin/gerente)');
  perform t.volver();
end $$;

-- Con RLS un UPDATE sobre filas que no se pueden tocar afecta 0 filas en vez de
-- fallar; por eso esta comprobacion cuenta filas.
do $$
begin
  perform t.actuar(t.g('a_rec'), t.g('ta')::bigint);
  perform t.filas(format('update public.datos_empresa set nombre_fantasia = ''X'' where tenant_id = %s', t.g('ta')), 0,
                  'la recepcionista no modifica datos_empresa');
  perform t.volver();

  perform t.actuar(t.g('a_ger'), t.g('ta')::bigint);
  perform t.filas(format('update public.datos_empresa set nombre_fantasia = ''Hotel A'' where tenant_id = %s', t.g('ta')), 1,
                  'el gerente si modifica datos_empresa');
  perform t.volver();
end $$;

-- ─── usuario: visibilidad y escalada de privilegios ──────────────────────────
do $$
begin
  perform t.actuar(t.g('a_admin'), t.g('ta')::bigint);
  perform t.ok(t.cuenta('select count(*) from public.usuario') = 4, 'el admin de A ve solo al personal de A');
  perform t.volver();

  perform t.actuar(t.g('a_ger'), t.g('ta')::bigint);
  perform t.falla(format(
    'update public.usuario set fk_cargo = %s where auth_id = ''%s''', t.g('c_adm'), t.g('a_ger')),
    '42501', 'un gerente no puede promoverse a administrador');
  perform t.falla(format(
    'update public.usuario set nombre = ''X'' where auth_id = ''%s''', t.g('a_admin')),
    '42501', 'un gerente no puede modificar una cuenta de administrador');
  perform t.falla('insert into public.usuario (documento, nombre, correo, usuario, fk_cargo, fk_tipo_doc) values (''9'', ''N'', ''n@a.test'', ''n'', 1, 1)',
    '42501', 'el cliente no puede insertar perfiles de usuario');
  perform t.volver();

  perform t.actuar(t.g('a_admin'), t.g('ta')::bigint);
  perform t.filas(format('update public.usuario set telefono = ''0990'' where auth_id = ''%s''', t.g('a_rec')), 1,
                  'el admin si edita al personal de su tenant');
  perform t.falla(format('update public.usuario set auth_id = gen_random_uuid() where auth_id = ''%s''', t.g('a_rec')),
    '42501', 'nadie reasigna la cuenta de acceso de un perfil');
  perform t.volver();
end $$;

-- Una cuenta creada con signUp y metadata de cliente no obtiene perfil.
do $$
declare v_id uuid := gen_random_uuid();
begin
  insert into auth.users (id, email, raw_user_meta_data)
  values (v_id, 'intruso@x.test',
          jsonb_build_object('nombre', 'Intruso', 'documento', '0', 'fk_tipo_doc', 1,
                             'fk_cargo', t.g('c_adm')::bigint, 'tenant_id', t.g('ta')::bigint));
  perform t.ok(not exists (select 1 from public.usuario where auth_id = v_id),
               'metadata del cliente (user_metadata) no crea perfil ni otorga cargo o tenant');
end $$;

-- Un JWT cuyo tenant no coincide con el del perfil no resuelve identidad.
do $$
begin
  perform t.actuar(t.g('a_admin'), t.g('tb')::bigint);
  perform t.ok(t.cuenta('select count(*) from public.clientes') = 0,
               'un token con el tenant equivocado no lee nada');
  perform t.volver();
end $$;

-- ─── Notificaciones: sin fuga entre tenants ──────────────────────────────────
do $$
begin
  perform t.actuar(t.g('a_rec'), t.g('ta')::bigint);
  insert into public.estado_limpieza (fk_habitacion, estado) values (t.g('a_hab')::bigint, 'Sucia');
  perform t.volver();

  perform t.ok((select count(*) from public.notificacion
                where tenant_id = t.g('ta')::bigint
                  and fk_usuario = (select id_usuario from public.usuario where auth_id = t.g('a_lim')::uuid)) = 1,
               'la limpiadora de A recibe la notificacion');
  perform t.ok((select count(*) from public.notificacion where tenant_id = t.g('tb')::bigint) = 0,
               'el personal de B no recibe notificaciones de A');
end $$;

-- ─── Numeracion de facturas ──────────────────────────────────────────────────
do $$
begin
  perform t.actuar(t.g('a_admin'), t.g('ta')::bigint);
  perform t.ok(public.next_nro_secuencial(t.g('a_estab')::bigint, (select min(id_tipo_factura) from public.tipo_factura)) = 1,
               'primer numero de factura = 1');
  perform t.ok(public.next_nro_secuencial(t.g('a_estab')::bigint, (select min(id_tipo_factura) from public.tipo_factura)) = 2,
               'la secuencia avanza');
  perform t.falla(format('select public.next_nro_secuencial(%s, 1)', t.g('b_estab')),
    '42501', 'A no puede consumir la numeracion de un establecimiento de B');
  perform t.volver();
end $$;

-- ─── Folios ──────────────────────────────────────────────────────────────────
do $$
declare v_folio bigint; v_reserva bigint;
begin
  perform t.actuar(t.g('a_rec'), t.g('ta')::bigint);
  insert into public.reservas (fecha_entrada, fecha_salida, fk_cliente, fk_usuario, origen)
    values (current_date + 40, current_date + 42,
            (select id_cliente from public.clientes where documento = 'CI-A'),
            (select id_usuario from public.usuario where auth_id = t.g('a_rec')::uuid), 'TEST')
    returning id_reserva into v_reserva;
  perform t.ok((select codigo_reserva from public.reservas where id_reserva = v_reserva) like 'RES-%',
               'el trigger genera el codigo de reserva');
  insert into public.folios (fk_reserva) values (v_reserva) returning id_folio into v_folio;
  perform t.ok((select estado from public.folios where id_folio = v_folio) = 'abierto', 'el folio nace abierto');
  perform public.incrementar_total_folio(v_folio, 150000);
  perform public.incrementar_total_folio(v_folio, -50000);
  perform t.ok((select total_acumulado from public.folios where id_folio = v_folio) = 100000,
               'incrementar_total_folio suma y resta de forma atomica');
  perform t.volver();

  perform t.actuar(t.g('b_admin'), t.g('tb')::bigint);
  perform public.incrementar_total_folio(v_folio, 999);
  perform t.volver();
  perform t.ok((select total_acumulado from public.folios where id_folio = v_folio) = 100000,
               'B no puede modificar el folio de A');

  -- Check-out: el trigger cierra los folios abiertos de la reserva.
  update public.reservas set estado = 'Check-out' where id_reserva = v_reserva;
  perform t.ok((select estado from public.folios where id_folio = v_folio) = 'cerrado',
               'el check-out cierra el folio');
  perform t.ok((select count(*) from public.historial_estancia where fk_reserva = v_reserva) >= 1,
               'el cambio de estado queda en el historial');

  -- Reapertura: la recepcionista no puede, el gerente si.
  perform t.actuar(t.g('a_rec'), t.g('ta')::bigint);
  perform t.filas(format('update public.folios set estado = ''abierto'' where id_folio = %s', v_folio), 0,
                  'la recepcionista no reabre un folio cerrado');
  perform t.volver();
  perform t.actuar(t.g('a_ger'), t.g('ta')::bigint);
  perform t.filas(format('update public.folios set estado = ''abierto'' where id_folio = %s', v_folio), 1,
                  'el gerente si reabre un folio cerrado');
  perform t.volver();
end $$;

-- ─── Landing publica ─────────────────────────────────────────────────────────
do $$
declare v_res jsonb; v_payload jsonb;
begin
  v_payload := jsonb_build_object(
    'fecha_entrada', (current_date + 10)::text,
    'fecha_salida', (current_date + 12)::text,
    'cliente', jsonb_build_object('razon_social', 'Visitante', 'documento', 'WEB-1', 'celular', '0981',
                                  'fk_tipo_documento', 1),
    'detalles', jsonb_build_array(jsonb_build_object(
      'fk_tipo_habitacion', t.g('a_th')::bigint, 'cantidad_adultos', 2,
      'huespedes', jsonb_build_array(jsonb_build_object(
        'nombre_completo', 'Visitante', 'documento', 'WEB-1', 'fk_tipo_documento', 1, 'es_titular', true)))));

  perform t.anonimo();
  v_res := public.fn_registrar_reserva_landing('hotel-a', v_payload);
  perform t.ok((v_res ->> 'success')::boolean, 'la landing registra una reserva web');
  perform t.ok((v_res ->> 'total_estimado')::numeric = 200000, 'el total sale de la tarifa del servidor (2 noches x 100000)');
  perform t.ok((v_res ->> 'codigo_reserva') like 'RES-%', 'la reserva web recibe codigo');

  v_res := public.fn_registrar_reserva_landing('hotel-a', v_payload);
  perform t.ok(not (v_res ->> 'success')::boolean and (v_res ->> 'error_message') like 'Sobrecupo%',
               'sin unidades libres se rechaza el sobrecupo');

  v_res := public.fn_registrar_reserva_landing('hotel-b', v_payload);
  perform t.ok(not (v_res ->> 'success')::boolean, 'B no tiene tarifas ni habitaciones de A: la reserva falla');

  v_res := public.fn_registrar_reserva_landing('no-existe', v_payload);
  perform t.ok(not (v_res ->> 'success')::boolean and (v_res ->> 'error_code') = 'tenant_no_disponible',
               'un slug desconocido se rechaza');

  perform t.ok((select count(*) from public.fn_landing_ocupacion('hotel-a', current_date + 10, current_date + 12)) = 1,
               'la ocupacion publica refleja la reserva web');
  perform t.ok((select count(*) from public.fn_landing_ocupacion('hotel-b', current_date + 10, current_date + 12)) = 0,
               'la ocupacion de B no ve nada de A');
  perform t.volver();

  perform t.ok((select tenant_id from public.reservas where origen = 'WEB') = t.g('ta')::bigint,
               'la reserva web quedo en el tenant A');
  perform t.ok((select count(*) from public.reservas where origen = 'WEB' and tenant_id = t.g('tb')::bigint) = 0,
               'ninguna reserva web cayo en B');
end $$;

-- ─── Tenant suspendido ───────────────────────────────────────────────────────
do $$
begin
  update public.tenants set estado = 'suspendido' where id = t.g('ta')::bigint;

  perform t.actuar(t.g('a_admin'), t.g('ta')::bigint);
  perform t.ok(t.cuenta('select count(*) from public.clientes') = 0, 'un tenant suspendido no lee sus datos');
  perform t.falla(
    'insert into public.clientes (razon_social, documento, celular, es_proveedor_del_estado) values (''S'', ''S1'', ''0'', false)',
    '42501', 'un tenant suspendido no escribe');
  perform t.ok(t.cuenta('select count(*) from public.tenants') = 1, 'el tenant suspendido igual puede leer su propio estado');
  perform t.volver();

  perform t.anonimo();
  perform t.ok(public.fn_landing_catalogo('hotel-a') is null, 'un tenant suspendido sale de la landing');
  perform t.volver();

  update public.tenants set estado = 'trial' where id = t.g('ta')::bigint;
  perform t.actuar(t.g('a_admin'), t.g('ta')::bigint);
  perform t.ok(t.cuenta('select count(*) from public.clientes') >= 1, 'al reactivar el tenant vuelve el acceso');
  perform t.volver();
end $$;

-- ─── Alta de tenants ─────────────────────────────────────────────────────────
do $$
declare v_id uuid := gen_random_uuid();
begin
  insert into auth.users (id, email) values (v_id, 'dup@x.test');
  perform t.falla(format(
    $f$select public.fn_provision_tenant(jsonb_build_object(
        'tenant', jsonb_build_object('nombre', 'Otro', 'slug', 'hotel-a'),
        'admin', jsonb_build_object('auth_id', '%s', 'nombre', 'N', 'documento', '3', 'fk_tipo_doc', 1),
        'empresa', jsonb_build_object('ruc', '80000003-3', 'razon_social', 'X',
                                      'fk_contribuyente', 1, 'fk_regimen', 1),
        'establecimiento', jsonb_build_object('direccion', 'D', 'fk_barrio', 1)))$f$, v_id),
    '23505', 'no se puede reutilizar un slug');
  perform t.falla(
    $f$select public.fn_provision_tenant(jsonb_build_object('tenant', jsonb_build_object('nombre', 'X', 'slug', 'Mal Slug!')))$f$,
    'P0001', 'el alta valida los datos obligatorios');
end $$;

-- ─── Cargos: lista cerrada ───────────────────────────────────────────────────
do $$
declare v_id uuid := gen_random_uuid(); v_cargo bigint;
begin
  insert into public.cargo (cargo, descripcion_cargo) values ('Cocina', 'Cocina') returning id_cargo into v_cargo;
  insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
    (v_id, 'cocina@a.test', jsonb_build_object('tenant_id', t.g('ta')::bigint, 'fk_cargo', v_cargo),
     jsonb_build_object('nombre', 'Cocina A', 'documento', '14', 'fk_tipo_doc', 1));

  perform t.actuar(v_id::text, t.g('ta')::bigint);
  perform t.ok(t.cuenta('select count(*) from public.clientes') >= 1, 'un cargo desconocido puede leer');
  perform t.falla(
    'insert into public.clientes (razon_social, documento, celular, es_proveedor_del_estado) values (''K'', ''K1'', ''0'', false)',
    '42501', 'un cargo no reconocido no opera (lista cerrada de cargos)');
  perform t.volver();
end $$;

-- ─── Numeracion de facturas: solo por la funcion ─────────────────────────────
do $$
begin
  perform t.actuar(t.g('a_rec'), t.g('ta')::bigint);
  perform t.falla('update public.factura_secuencia set ultimo = 0', '42501',
                  'nadie reinicia la numeracion de facturas escribiendo la tabla');
  perform t.falla('insert into public.factura_secuencia (fk_establecimientos, fk_tipo_factura, ultimo) values (1, 1, 0)',
                  '42501', 'tampoco se inserta directamente');
  perform t.volver();

  perform t.actuar(t.g('a_lim'), t.g('ta')::bigint);
  perform t.falla(format('select public.next_nro_secuencial(%s, 1)', t.g('a_estab')), '42501',
                  'el limpiador no emite numeracion');
  perform t.volver();

  perform t.ok((select count(*) from pg_indexes where indexname = 'facturas_numero_key') = 1,
               'existe la unicidad del numero de factura');
end $$;

-- ─── estado_limpieza: una fila por habitacion ────────────────────────────────
do $$
begin
  perform t.falla(format(
    'insert into public.estado_limpieza (tenant_id, fk_habitacion, estado) values (%s, %s, ''Limpia'')',
    t.g('ta'), t.g('a_hab')), '23505', 'una habitacion no tiene dos filas de estado de limpieza');
end $$;

-- ─── Plantilla de siembra ────────────────────────────────────────────────────
do $$
declare
  v_plantilla bigint := (select id from public.tenants where slug = 'plantilla-base');
  v_c uuid := gen_random_uuid();
  v_res jsonb;
  v_tc bigint;
begin
  perform t.ok(v_plantilla is not null, 'la plantilla nace en la migracion, no en el seed');
  perform t.falla(
    $f$insert into public.tenants (nombre, slug, estado, plan) values ('Intruso', 'plantilla-base', 'trial', 'trial')$f$,
    '23505', 'nadie puede registrar el slug de la plantilla');
  perform t.falla(
    $f$select public.fn_provision_tenant(jsonb_build_object('tenant', jsonb_build_object('nombre', 'X', 'slug', 'admin')))$f$,
    '23505', 'los slugs reservados no se pueden usar');

  insert into public.conceptos (tenant_id, nombre, arancel, descripcion, fk_iva, fk_unidad_medida, estado)
  values (v_plantilla, 'Desayuno', 50000, 'Desayuno buffet',
          (select min(id_iva) from public.iva), (select min(id_unidades) from public.unidades_medida), 'ACTIVO');

  insert into auth.users (id, email) values (v_c, 'admin@c.test');
  v_res := public.fn_provision_tenant(jsonb_build_object(
    'tenant', jsonb_build_object('nombre', 'Hotel C', 'slug', 'hotel-c'),
    'admin', jsonb_build_object('auth_id', v_c, 'nombre', 'Admin C', 'documento', '3', 'fk_tipo_doc', 1),
    'empresa', jsonb_build_object('ruc', '80000003-3', 'razon_social', 'Hotel C SA',
                                  'fk_contribuyente', (select min(id_tipo_contribuyente) from public.tipo_contribuyente),
                                  'fk_regimen', (select min(id_regimen) from public.tipo_regimen)),
    'establecimiento', jsonb_build_object('direccion', 'Calle 3', 'fk_barrio', 1)));
  v_tc := (v_res ->> 'tenant_id')::bigint;

  perform t.ok((select count(*) from public.conceptos where tenant_id = v_tc and nombre = 'Alojamiento') = 1,
               'el alta siembra el concepto Alojamiento');
  perform t.ok((select count(*) from public.conceptos where tenant_id = v_tc and nombre = 'Desayuno') = 1,
               'el alta copia los conceptos de la plantilla');
  perform t.ok((select raw_app_meta_data ->> 'tenant_id' from auth.users where id = v_c)::bigint = v_tc,
               'el alta deja el tenant en app_metadata de la cuenta');
end $$;

-- ─── Perfiles y cuentas de Auth ──────────────────────────────────────────────
do $$
declare
  v_id uuid := gen_random_uuid();
  v_id2 uuid := gen_random_uuid();
  v_id3 uuid := gen_random_uuid();
  c_rec bigint := (select id_cargo from public.cargo where lower(cargo) = 'recepcionista' limit 1);
  v_app jsonb := jsonb_build_object('tenant_id', t.g('ta')::bigint, 'fk_cargo', c_rec);
  v_meta jsonb := jsonb_build_object('nombre', 'Late', 'documento', '15', 'fk_tipo_doc', 1);
begin
  -- GoTrue puede aplicar app_metadata en un UPDATE posterior al INSERT.
  insert into auth.users (id, email, raw_user_meta_data) values (v_id, 'late@a.test', v_meta);
  perform t.ok(not exists (select 1 from public.usuario where auth_id = v_id),
               'sin app_metadata todavia no hay perfil');
  update auth.users set raw_app_meta_data = v_app where id = v_id;
  perform t.ok(exists (select 1 from public.usuario where auth_id = v_id),
               'el perfil se crea cuando app_metadata llega en un UPDATE');

  -- Mismo handle por defecto dentro del tenant: no debe fallar.
  insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
  values (v_id2, 'late@a2.test', v_app, v_meta);
  perform t.ok((select count(*) from public.usuario
                where tenant_id = t.g('ta')::bigint and lower(usuario) like 'late%') = 2,
               'el handle por defecto repetido recibe un sufijo en vez de fallar');

  -- Falta de datos: error claro, no un 23502 opaco.
  perform t.falla(format(
    'insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values (''%s'', ''x@a.test'', ''%s'', ''{}'')',
    gen_random_uuid(), v_app::text), 'P0001', 'sin fk_tipo_doc el alta falla con un mensaje claro');

  -- Baja y reingreso de la misma persona.
  delete from auth.users where id = v_id;
  perform t.ok((select estado from public.usuario where nombre = 'Late' and correo like 'eliminado-%') = 'Inactivo',
               'al borrar la cuenta de Auth el perfil queda inactivo y libera el correo');
  insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
  values (v_id3, 'late@a.test', v_app, v_meta);
  perform t.ok(exists (select 1 from public.usuario where auth_id = v_id3),
               'la misma persona se puede volver a dar de alta');
end $$;

-- El correo del perfil no se edita desde la API.
do $$
begin
  perform t.actuar(t.g('a_admin'), t.g('ta')::bigint);
  perform t.falla(format('update public.usuario set correo = ''otro@a.test'' where auth_id = ''%s''', t.g('a_rec')),
                  '42501', 'el correo de un perfil no se modifica desde el cliente');
  perform t.volver();
end $$;

-- ─── Landing: limites y datos de clientes existentes ─────────────────────────
do $$
declare
  v_res jsonb;
  v_base jsonb;
  v_det jsonb := jsonb_build_array(jsonb_build_object(
    'fk_tipo_habitacion', t.g('a_th')::bigint, 'cantidad_adultos', 1));
begin
  insert into public.clientes (tenant_id, razon_social, documento, celular, email, es_proveedor_del_estado)
  values (t.g('ta')::bigint, 'Cliente Real', 'WEB-9', '0971', 'real@x.test', false);

  perform t.anonimo();

  v_base := jsonb_build_object(
    'fecha_entrada', (current_date + 20)::text, 'fecha_salida', (current_date + 22)::text,
    'cliente', jsonb_build_object('razon_social', 'Otro', 'documento', 'WEB-9', 'celular', '0999',
                                  'email', 'atacante@x.zz', 'fk_tipo_documento', 1),
    'detalles', v_det);

  v_res := public.fn_registrar_reserva_landing('hotel-a', v_base);
  perform t.ok((v_res ->> 'success')::boolean, 'un cliente existente puede reservar por la landing');
  perform t.ok(not (v_res ? 'id_cliente'), 'la respuesta no revela el id del cliente');

  perform t.volver();
  perform t.ok((select email from public.clientes where documento = 'WEB-9' and tenant_id = t.g('ta')::bigint) = 'real@x.test',
               'la landing no modifica el contacto de un cliente existente');
  perform t.ok((select observaciones from public.reservas
                where id_reserva = (v_res ->> 'id_reserva')::bigint) like '%[Contacto web]%atacante@x.zz%',
               'el contacto dado en la reserva queda en las observaciones para el hotel');
  perform t.anonimo();

  v_res := public.fn_registrar_reserva_landing('hotel-a',
    v_base || jsonb_build_object('fecha_entrada', (current_date - 3)::text, 'fecha_salida', (current_date - 1)::text));
  perform t.ok(not (v_res ->> 'success')::boolean and (v_res ->> 'error_message') like 'La fecha de entrada no puede%',
               'no se aceptan fechas pasadas');

  v_res := public.fn_registrar_reserva_landing('hotel-a',
    v_base || jsonb_build_object('fecha_entrada', (current_date + 800)::text, 'fecha_salida', (current_date + 802)::text));
  perform t.ok(not (v_res ->> 'success')::boolean, 'no se aceptan reservas con mas de un año de anticipo');

  v_res := public.fn_registrar_reserva_landing('hotel-a',
    v_base || jsonb_build_object('fecha_entrada', (current_date + 40)::text, 'fecha_salida', (current_date + 42)::text,
      'detalles', jsonb_build_array(jsonb_build_object('fk_tipo_habitacion', t.g('a_th')::bigint, 'cantidad_adultos', 5))));
  perform t.ok(not (v_res ->> 'success')::boolean and (v_res ->> 'error_message') like '%capacidad%',
               'no se superan los huespedes del tipo de habitacion');

  v_res := public.fn_registrar_reserva_landing('hotel-a',
    v_base || jsonb_build_object('fecha_entrada', (current_date + 40)::text, 'fecha_salida', (current_date + 42)::text,
      'cliente', jsonb_build_object('razon_social', repeat('x', 300), 'documento', 'WEB-L', 'celular', '0')));
  perform t.ok(not (v_res ->> 'success')::boolean and (v_res ->> 'error_message') like '%largo permitido%',
               'los textos tienen largo maximo');

  v_res := public.fn_registrar_reserva_landing('hotel-a',
    v_base || jsonb_build_object('fecha_entrada', (current_date + 40)::text, 'fecha_salida', (current_date + 42)::text,
      'detalles', jsonb_build_array(jsonb_build_object(
        'fk_tipo_habitacion', t.g('a_th')::bigint, 'cantidad_adultos', 1,
        'huespedes', (select jsonb_agg(jsonb_build_object('nombre_completo', 'H' || g, 'documento', g::text))
                      from generate_series(1, 11) g)))));
  perform t.ok(not (v_res ->> 'success')::boolean, 'tope de huespedes registrados por habitacion');

  -- Tope de reservas web pendientes por cliente: ya tiene 1 (la de +20).
  perform t.ok((public.fn_registrar_reserva_landing('hotel-a',
    v_base || jsonb_build_object('fecha_entrada', (current_date + 30)::text, 'fecha_salida', (current_date + 32)::text)) ->> 'success')::boolean,
    'segunda reserva pendiente del mismo cliente');
  perform t.ok((public.fn_registrar_reserva_landing('hotel-a',
    v_base || jsonb_build_object('fecha_entrada', (current_date + 34)::text, 'fecha_salida', (current_date + 36)::text)) ->> 'success')::boolean,
    'tercera reserva pendiente del mismo cliente');
  v_res := public.fn_registrar_reserva_landing('hotel-a',
    v_base || jsonb_build_object('fecha_entrada', (current_date + 38)::text, 'fecha_salida', (current_date + 39)::text));
  perform t.ok(not (v_res ->> 'success')::boolean and (v_res ->> 'error_message') like '%pendientes%',
               'tope de reservas web pendientes por cliente');
  perform t.volver();
end $$;

-- ─── Guardas de DDL y storage ────────────────────────────────────────────────
do $$
begin
  create table public.zz_nuevo (id int);
  perform t.ok((select relrowsecurity from pg_class where oid = 'public.zz_nuevo'::regclass),
               'una tabla nueva nace con RLS habilitada');
  perform t.ok(not has_table_privilege('anon', 'public.zz_nuevo', 'select'),
               'anon no accede a una tabla nueva');
  perform t.ok(not has_table_privilege('authenticated', 'public.zz_nuevo', 'truncate'),
               'authenticated no puede truncar una tabla nueva');

  create function public.zz_funcion() returns int language sql as 'select 1';
  perform t.ok(not has_function_privilege('anon', 'public.zz_funcion()', 'execute')
               and not has_function_privilege('authenticated', 'public.zz_funcion()', 'execute'),
               'una funcion nueva nace sin EXECUTE para anon ni authenticated');

  perform t.ok((select file_size_limit from storage.buckets where id = 'habitaciones') = 5242880,
               'los buckets tienen tope de tamaño');
end $$;

select 'TODAS LAS PRUEBAS DE AISLAMIENTO PASARON' as resultado;

rollback;
