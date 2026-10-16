-- ═══════════════════════════════════════════════════════════════════════════
-- 0015 · Fecha de Paraguay en lugar de current_date
-- ═══════════════════════════════════════════════════════════════════════════
-- Supabase corre en UTC: `current_date` cambia de dia a las 21:00 de Paraguay
-- (UTC-3). Entre las 21:00 y la medianoche local la base ya veia "manana", asi
-- que una activacion registraba `desde` un dia adelantado y un trial o una
-- tarifa vencian horas antes de tiempo.
--
-- Convencion desde esta migracion: toda fecha "de hoy" en la base sale de
-- `public.hoy_py()`; no se usa `current_date` (ver README). Solo la RPC publica
-- de la landing (0009) ya usaba America/Asuncion.
--
-- Las migraciones 0001-0014 ya estan aplicadas y no se editan: aqui se
-- redefinen las funciones afectadas y se cambia el default de tarifas.
-- Las sentencias de datos de 0014 (UPDATE de trial_fin y vigente_hasta) fueron
-- de una sola vez y no se rehacen.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Fecha de hoy en Paraguay ────────────────────────────────────────────────
-- STABLE (no IMMUTABLE): depende de now(). search_path vacio: solo usa
-- pg_catalog, que siempre esta disponible.
create or replace function public.hoy_py()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'America/Asuncion')::date;
$$;

comment on function public.hoy_py() is
  'Fecha de hoy en Paraguay (America/Asuncion). Usar siempre en lugar de current_date.';

-- Se usa como default de columna y dentro de policies/funciones evaluadas con
-- el rol del llamador, por eso authenticated necesita EXECUTE.
revoke execute on function public.hoy_py() from public, anon, authenticated;
grant execute on function public.hoy_py() to authenticated;

-- ─── Vigencia de la suscripcion ──────────────────────────────────────────────
create or replace function public.fn_suscripcion_vigente(p_tenant bigint)
returns boolean
language sql
stable
set search_path = public
as $$
  select coalesce((
    select case t.estado
             when 'trial' then
               case when t.trial_fin is null
                    then t.plan = 'plantilla'
                    else t.trial_fin >= public.hoy_py()
               end
             when 'activo' then coalesce(t.vigente_hasta >= public.hoy_py(), false)
             else false
           end
    from public.tenants t
    where t.id = p_tenant
  ), false);
$$;

-- ─── Activacion manual de un plan ────────────────────────────────────────────
create or replace function public.fn_activar_plan(
  p_tenant     bigint,
  p_plan       text,
  p_ciclo      text,
  p_monto      numeric default null,
  p_referencia text    default null
)
returns date
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan    public.planes%rowtype;
  v_tenant  public.tenants%rowtype;
  v_desde   date;
  v_hasta   date;
  v_monto   numeric;
begin
  if p_ciclo is null or p_ciclo not in ('mensual', 'anual') then
    raise exception 'Ciclo de facturacion invalido: usar mensual o anual.' using errcode = '22023';
  end if;

  select * into v_plan from public.planes p where p.codigo = p_plan and p.visible;
  if not found then
    raise exception 'El plan "%" no existe o no se puede contratar.', p_plan using errcode = '22023';
  end if;

  select * into v_tenant from public.tenants t where t.id = p_tenant for update;
  if not found then
    raise exception 'No existe el hotel %.', p_tenant using errcode = '22023';
  end if;
  if v_tenant.plan = 'plantilla' then
    raise exception 'El hotel plantilla no tiene suscripcion.' using errcode = '22023';
  end if;

  v_monto := coalesce(p_monto,
                      case p_ciclo when 'mensual' then v_plan.precio_mensual else v_plan.precio_anual end);
  if v_monto < 0 then
    raise exception 'El monto no puede ser negativo.' using errcode = '22023';
  end if;

  v_desde := greatest(coalesce(v_tenant.vigente_hasta, public.hoy_py()), public.hoy_py());
  v_hasta := (v_desde + case p_ciclo when 'mensual' then interval '1 month' else interval '12 months' end)::date;

  update public.tenants
  set estado = 'activo',
      plan = v_plan.codigo,
      ciclo_facturacion = p_ciclo,
      vigente_hasta = v_hasta
  where id = p_tenant;

  insert into public.pagos_suscripcion
    (tenant_id, plan, ciclo, monto, moneda, desde, hasta, referencia)
  values
    (p_tenant, v_plan.codigo, p_ciclo, v_monto, v_plan.moneda, v_desde, v_hasta,
     nullif(trim(p_referencia), ''));

  return v_hasta;
end;
$$;

-- ─── Alta de tenants ─────────────────────────────────────────────────────────
-- Misma version de 0014; solo cambia el calculo de trial_fin.
create or replace function public.fn_provision_tenant(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nombre     text := nullif(trim(p_payload #>> '{tenant,nombre}'), '');
  v_slug       text := lower(nullif(trim(p_payload #>> '{tenant,slug}'), ''));
  v_trial_dias integer := coalesce((p_payload #>> '{tenant,trial_dias}')::integer, 30);

  v_auth_id    uuid := (p_payload #>> '{admin,auth_id}')::uuid;
  v_correo     text;
  v_adm_nombre text := nullif(trim(p_payload #>> '{admin,nombre}'), '');
  v_adm_doc    text := nullif(trim(p_payload #>> '{admin,documento}'), '');
  v_adm_tipodoc bigint := (p_payload #>> '{admin,fk_tipo_doc}')::bigint;

  v_ruc        text := nullif(trim(p_payload #>> '{empresa,ruc}'), '');
  v_razon      text := nullif(trim(p_payload #>> '{empresa,razon_social}'), '');
  v_contrib    bigint := (p_payload #>> '{empresa,fk_contribuyente}')::bigint;
  v_regimen    bigint := (p_payload #>> '{empresa,fk_regimen}')::bigint;

  v_direccion  text := nullif(trim(p_payload #>> '{establecimiento,direccion}'), '');
  v_barrio     bigint := (p_payload #>> '{establecimiento,fk_barrio}')::bigint;

  v_tenant     bigint;
  v_cargo      bigint;
  v_empresa    bigint;
  v_estab      bigint;
  v_usuario    bigint;
  v_caja       bigint;
  v_iva        bigint;
  v_unidad     bigint;
begin
  if v_nombre is null or v_slug is null then
    raise exception 'Faltan el nombre o el identificador (slug) del tenant.';
  end if;
  if v_slug in ('plantilla-base', 'admin', 'api', 'www', 'app', 'auth', 'soporte',
                'support', 'landing', 'static', 'assets', 'login', 'registro') then
    raise exception 'El identificador "%" esta reservado.', v_slug using errcode = '23505';
  end if;
  if v_auth_id is null or v_adm_nombre is null or v_adm_doc is null or v_adm_tipodoc is null then
    raise exception 'Faltan datos del administrador (auth_id, nombre, documento, fk_tipo_doc).';
  end if;
  if v_ruc is null or v_razon is null or v_contrib is null or v_regimen is null then
    raise exception 'Faltan datos de la empresa (ruc, razon_social, fk_contribuyente, fk_regimen).';
  end if;
  if v_direccion is null or v_barrio is null then
    raise exception 'Faltan datos del establecimiento (direccion, fk_barrio).';
  end if;

  select u.email into v_correo from auth.users u where u.id = v_auth_id;
  if not found then
    raise exception 'No existe la cuenta de Auth del administrador (%).', v_auth_id;
  end if;

  select c.id_cargo into v_cargo
  from public.cargo c
  where lower(trim(c.cargo)) in ('admin', 'administrador')
  order by c.id_cargo
  limit 1;
  if v_cargo is null then
    raise exception 'No existe el cargo de administrador: cargar los catalogos antes de dar de alta tenants.';
  end if;

  begin
    insert into public.tenants (nombre, slug, estado, plan, trial_fin, vigente_hasta)
    values (v_nombre, v_slug, 'trial', 'trial', public.hoy_py() + v_trial_dias, null)
    returning id into v_tenant;
  exception
    when unique_violation then
      raise exception 'El identificador "%" ya esta en uso.', v_slug using errcode = '23505';
    when check_violation then
      raise exception 'Identificador invalido: usar 3 a 40 caracteres entre a-z, 0-9 y guion.' using errcode = '23514';
  end;

  insert into public.datos_empresa
    (tenant_id, ruc, razon_social, nombre_fantasia, fk_contribuyente, fk_regimen, estado)
  values
    (v_tenant, v_ruc, v_razon,
     coalesce(nullif(trim(p_payload #>> '{empresa,nombre_fantasia}'), ''), v_razon),
     v_contrib, v_regimen, 'Activo')
  returning id_empresa into v_empresa;

  insert into public.establecimientos
    (tenant_id, codigo_establecimiento, direccion, numero_casa, complemento_direccion_1,
     complemento_direccion_2, telefono, email, denominacion, estado_establecimiento,
     fk_barrio, fk_empresa)
  values
    (v_tenant,
     coalesce(nullif(trim(p_payload #>> '{establecimiento,codigo}'), ''), '001'),
     v_direccion,
     coalesce(nullif(trim(p_payload #>> '{establecimiento,numero_casa}'), ''), 's/n'),
     coalesce(nullif(trim(p_payload #>> '{establecimiento,complemento_direccion_1}'), ''), '-'),
     nullif(trim(p_payload #>> '{establecimiento,complemento_direccion_2}'), ''),
     nullif(trim(p_payload #>> '{establecimiento,telefono}'), ''),
     nullif(trim(p_payload #>> '{establecimiento,email}'), ''),
     coalesce(nullif(trim(p_payload #>> '{establecimiento,denominacion}'), ''), v_nombre),
     'Activo', v_barrio, v_empresa)
  returning id_establecimiento into v_estab;

  insert into public.usuario
    (tenant_id, auth_id, correo, nombre, documento, telefono, usuario, fk_tipo_doc, fk_cargo, estado)
  values
    (v_tenant, v_auth_id, v_correo, v_adm_nombre, v_adm_doc,
     nullif(trim(p_payload #>> '{admin,telefono}'), ''),
     coalesce(nullif(trim(p_payload #>> '{admin,usuario}'), ''), split_part(v_correo, '@', 1)),
     v_adm_tipodoc, v_cargo, 'Activo')
  returning id_usuario into v_usuario;

  update public.tenants set fk_usuario_web = v_usuario where id = v_tenant;

  insert into public.caja (tenant_id, nro_caja, descripcion_caja, fk_establecimientos)
  values (v_tenant, 1, 'Caja principal', v_estab)
  returning id_caja into v_caja;

  -- Concepto fijo del cargo automatico de noches (lo busca por nombre
  -- folioService.getOrCrearConceptoAlojamiento). Si los catalogos aun no estan
  -- sembrados se omite y el frontend lo crea la primera vez que lo necesite.
  select i.id_iva into v_iva from public.iva i where i.valor = 10 order by i.id_iva limit 1;
  select m.id_unidades into v_unidad from public.unidades_medida m order by m.id_unidades limit 1;

  if v_iva is not null and v_unidad is not null then
    insert into public.conceptos
      (tenant_id, nombre, arancel, descripcion, fk_iva, fk_unidad_medida, estado)
    values
      (v_tenant, 'Alojamiento', 0, 'Cargo automático por noches de estadía', v_iva, v_unidad, 'ACTIVO');
  else
    raise notice 'Catalogos iva/unidades_medida sin sembrar: se omite el concepto Alojamiento.';
  end if;

  perform public.fn_seed_tenant_desde_plantilla(v_tenant);

  -- Deja el tenant en el claim de la cuenta de Auth (solo el servidor puede
  -- escribir raw_app_meta_data).
  update auth.users
  set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
                          || jsonb_build_object('tenant_id', v_tenant, 'fk_cargo', v_cargo)
  where id = v_auth_id;

  return jsonb_build_object(
    'tenant_id', v_tenant,
    'id_empresa', v_empresa,
    'id_establecimiento', v_estab,
    'id_usuario', v_usuario,
    'id_caja', v_caja
  );
end;
$$;

-- ─── Tarifas ─────────────────────────────────────────────────────────────────
alter table public.tarifas
  alter column fecha_inicio set default public.hoy_py();

-- Version de 0005 con la fecha de Paraguay.
create or replace function public.fn_actualizar_estado_tarifas()
returns void
language sql
security definer
set search_path = public
as $$
  update public.tarifas
  set estado = 'Inactiva'
  where lower(trim(estado)) = 'activa'
    and fecha_fin is not null
    and fecha_fin < public.hoy_py();
$$;

comment on function public.fn_actualizar_estado_tarifas() is
  'Desactiva las tarifas Activas cuya fecha_fin ya paso en Paraguay. No reactiva ninguna.';

-- pg_cron programa en UTC: 03:05 UTC = 00:05 en Paraguay (antes 00:05 UTC, que
-- son las 21:05 del dia anterior). Si pg_cron no esta disponible solo avisa.
do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'actualizar-estado-tarifas';
  perform cron.schedule('actualizar-estado-tarifas', '5 3 * * *', 'select public.fn_actualizar_estado_tarifas();');
exception
  when others then
    raise warning 'No se pudo reprogramar el vencimiento de tarifas con pg_cron (%). Programar fn_actualizar_estado_tarifas() a las 03:05 UTC a mano.', sqlerrm;
end;
$$;

-- ─── Privilegios ─────────────────────────────────────────────────────────────
-- CREATE OR REPLACE dispara la guarda de 0012: se repiten los grants de 0014.
-- fn_actualizar_estado_tarifas sigue sin concesiones (la ejecuta pg_cron).
revoke execute on function public.fn_suscripcion_vigente(bigint)                     from public, anon, authenticated;
revoke execute on function public.fn_activar_plan(bigint, text, text, numeric, text) from public, anon, authenticated;
revoke execute on function public.fn_provision_tenant(jsonb)                         from public, anon, authenticated;
revoke execute on function public.fn_actualizar_estado_tarifas()                     from public, anon, authenticated;

grant execute on function public.fn_suscripcion_vigente(bigint) to authenticated;
grant execute on function public.fn_activar_plan(bigint, text, text, numeric, text) to service_role;
grant execute on function public.fn_provision_tenant(jsonb)                         to service_role;
