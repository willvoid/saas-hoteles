-- ═══════════════════════════════════════════════════════════════════════════
-- 0008 · Alta de tenants
-- ═══════════════════════════════════════════════════════════════════════════
-- fn_provision_tenant crea, en una sola transaccion, todo lo que un hotel
-- necesita para operar: tenant, empresa, establecimiento, usuario admin,
-- caja, concepto "Alojamiento" y, si existe, la siembra desde la plantilla.
--
-- Solo la puede llamar service_role (la edge function de registro) o un
-- operador desde el SQL editor. Flujo esperado:
--
--   1. La edge function crea la cuenta de Auth del administrador con la admin
--      API (sin app_metadata de tenant: el trigger handle_new_user no genera
--      perfil todavia).
--   2. Llama a fn_provision_tenant con el id de esa cuenta.
--   3. Si falla, la edge function borra la cuenta de Auth creada en el paso 1.
--
-- La funcion deja `app_metadata.tenant_id` en la cuenta de Auth; el
-- administrador lo ve en su proximo login (el JWT se emite con el claim).
--
-- Payload (jsonb):
--   tenant          { nombre, slug, trial_dias? }
--   admin           { auth_id, nombre, documento, fk_tipo_doc, telefono?, usuario? }
--   empresa         { ruc, razon_social, nombre_fantasia?, fk_contribuyente, fk_regimen }
--   establecimiento { direccion, fk_barrio, codigo?, denominacion?, numero_casa?,
--                     complemento_direccion_1?, complemento_direccion_2?, telefono?, email? }
-- ═══════════════════════════════════════════════════════════════════════════

-- Copia desde el tenant 'plantilla-base' (si existe) el plan de cuentas y los
-- conceptos. La plantilla es un tenant normal, suspendido, que el operador
-- mantiene con datos de ejemplo.
create or replace function public.fn_seed_tenant_desde_plantilla(p_tenant bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plantilla bigint;
  v_mapa      jsonb := '{}'::jsonb;
  v_nuevo     bigint;
  r           record;
begin
  -- La plantilla se identifica por slug Y por sus atributos: aunque otro tenant
  -- lograra ese slug, no se copia de el.
  select t.id into v_plantilla
  from public.tenants t
  where t.slug = 'plantilla-base'
    and t.estado = 'suspendido'
    and t.plan = 'plantilla';

  if v_plantilla is null or v_plantilla = p_tenant then
    return;
  end if;

  -- Plan de cuentas: se copia por niveles para poder remapear el padre.
  for r in
    with recursive arbol as (
      select c.*, 0 as nivel
      from public.cuentas_contables c
      where c.tenant_id = v_plantilla and c.fk_cuenta_padre is null
      union all
      select c.*, a.nivel + 1
      from public.cuentas_contables c
      join arbol a on c.fk_cuenta_padre = a.id
      where c.tenant_id = v_plantilla
    )
    select * from arbol order by nivel, id
  loop
    insert into public.cuentas_contables
      (tenant_id, nombre, codigo, fk_tipo_cuenta, imputable, fk_cuenta_padre)
    values
      (p_tenant, r.nombre, r.codigo, r.fk_tipo_cuenta, r.imputable,
       (v_mapa ->> r.fk_cuenta_padre::text)::bigint)
    returning id into v_nuevo;

    v_mapa := v_mapa || jsonb_build_object(r.id::text, v_nuevo);
  end loop;

  insert into public.conceptos
    (tenant_id, nombre, arancel, descripcion, fk_iva, fk_unidad_medida, estado, fk_servicio)
  select p_tenant, c.nombre, c.arancel, c.descripcion, c.fk_iva, c.fk_unidad_medida, c.estado, c.fk_servicio
  from public.conceptos c
  where c.tenant_id = v_plantilla
    and not exists (
      select 1 from public.conceptos x
      where x.tenant_id = p_tenant and lower(trim(x.nombre)) = lower(trim(c.nombre))
    );
end;
$$;

create or replace function public.fn_provision_tenant(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nombre     text := nullif(trim(p_payload #>> '{tenant,nombre}'), '');
  v_slug       text := lower(nullif(trim(p_payload #>> '{tenant,slug}'), ''));
  v_trial_dias integer := coalesce((p_payload #>> '{tenant,trial_dias}')::integer, 14);

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
    insert into public.tenants (nombre, slug, estado, plan, trial_fin)
    values (v_nombre, v_slug, 'trial', 'trial', current_date + v_trial_dias)
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

-- Tenant plantilla: fn_seed_tenant_desde_plantilla copia de el su plan de cuentas
-- y sus conceptos a cada tenant nuevo. Nace en la migracion (no en el seed) para
-- que su slug este ocupado desde el primer dia y nadie pueda registrarlo.
-- Esta suspendido, asi que ni la landing ni los usuarios operan sobre el. El
-- operador le carga los datos de ejemplo a mano.
insert into public.tenants (nombre, slug, estado, plan)
values ('Plantilla base', 'plantilla-base', 'suspendido', 'plantilla')
on conflict (slug) do nothing;
