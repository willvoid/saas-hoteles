-- ═══════════════════════════════════════════════════════════════════════════
-- Suite de super admin de plataforma (0024)
-- ═══════════════════════════════════════════════════════════════════════════
-- Comprueba que platform_admins y platform_audit no son accesibles para
-- authenticated, que las funciones del operador solo las ejecuta service_role y
-- que el resumen de tenants cuenta bien. Corre en una transaccion que se
-- revierte al final: no deja nada en la base.
--
-- Requisitos: migraciones 0001-0024 y supabase/seed.sql aplicados.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f tests/platform_admins.sql
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

-- ─── Datos de prueba ─────────────────────────────────────────────────────────
insert into auth.users (id, email)
values ('00000000-0000-0000-0000-0000000000a1', 'operador@plataforma.test');

insert into public.tenants (nombre, slug)
values ('Hotel Prueba Operador', 'hotel-prueba-operador');

-- ─── authenticated no toca las tablas ni las funciones ──────────────────────
do $$
begin
  perform t.actuar('00000000-0000-0000-0000-0000000000a1', null);
  perform t.falla('select count(*) from public.platform_admins', '42501',
                  'authenticated no lee platform_admins');
  perform t.falla('select count(*) from public.platform_audit', '42501',
                  'authenticated no lee platform_audit');
  perform t.falla('insert into public.platform_admins (auth_id) values (''00000000-0000-0000-0000-0000000000a1'')',
                  '42501', 'authenticated no se auto-promueve a operador');
  perform t.falla('select public.fn_es_platform_admin(''00000000-0000-0000-0000-0000000000a1'')',
                  '42501', 'authenticated no ejecuta fn_es_platform_admin');
  perform t.falla('select * from public.fn_admin_tenants_resumen()', '42501',
                  'authenticated no ejecuta fn_admin_tenants_resumen');
  perform t.volver();
end $$;

-- ─── anon tampoco ───────────────────────────────────────────────────────────
do $$
begin
  execute 'set local role anon';
  perform t.falla('select count(*) from public.platform_admins', '42501', 'anon no lee platform_admins');
  perform t.falla('select * from public.fn_admin_tenants_resumen()', '42501',
                  'anon no ejecuta fn_admin_tenants_resumen');
  perform t.volver();
end $$;

-- ─── service_role: la funcion de guard ──────────────────────────────────────
do $$
begin
  execute 'set local role service_role';
  perform t.ok(public.fn_es_platform_admin('00000000-0000-0000-0000-0000000000a1') is false,
               'un usuario comun no es operador');
  perform t.volver();

  insert into public.platform_admins (auth_id) values ('00000000-0000-0000-0000-0000000000a1');

  execute 'set local role service_role';
  perform t.ok(public.fn_es_platform_admin('00000000-0000-0000-0000-0000000000a1') is true,
               'un usuario cargado en platform_admins es operador');
  perform t.ok(public.fn_es_platform_admin(null) is false, 'uid nulo no es operador');
  perform t.volver();
end $$;

-- ─── service_role: el resumen cuenta bien ───────────────────────────────────
do $$
declare
  r record;
begin
  execute 'set local role service_role';
  select * into r from public.fn_admin_tenants_resumen() where slug = 'hotel-prueba-operador';
  perform t.ok(found, 'el resumen incluye el tenant nuevo');
  perform t.ok(r.estado = 'trial' and r.plan = 'trial', 'el resumen devuelve estado y plan');
  perform t.ok(r.usuarios = 0 and r.establecimientos = 0 and r.habitaciones = 0,
               'un tenant sin datos cuenta cero usuarios, establecimientos y habitaciones');
  perform t.volver();
end $$;

-- ─── service_role: la auditoria acepta filas ────────────────────────────────
do $$
begin
  execute 'set local role service_role';
  insert into public.platform_audit (actor, action, payload)
  values ('00000000-0000-0000-0000-0000000000a1', 'set_estado', '{"estado":"suspendido"}');
  perform t.ok((select count(*) from public.platform_audit) = 1, 'service_role escribe y lee platform_audit');
  perform t.volver();
end $$;

select 'TODAS LAS PRUEBAS DE PLATFORM_ADMINS PASARON' as resultado;

rollback;
