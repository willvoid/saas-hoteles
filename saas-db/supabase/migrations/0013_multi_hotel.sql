-- ═══════════════════════════════════════════════════════════════════════════
-- 0013 · Una cuenta, varios hoteles
-- ═══════════════════════════════════════════════════════════════════════════
-- Hasta 0012 una cuenta de Auth tenia un unico perfil (`usuario.auth_id` unico)
-- y por lo tanto un unico hotel. Esta migracion permite un perfil por hotel:
--
--   * `usuario` pasa a ser unico por (auth_id, tenant_id), y el correo por
--     (tenant_id, correo). Auth sigue exigiendo correo unico global.
--   * El hotel activo sigue siendo `app_metadata.tenant_id` del JWT: lo cambia
--     la edge function `switch-hotel` (o fn_provision_tenant al crear un hotel).
--     Todas las policies y helpers siguen leyendo current_tenant_id().
--   * current_user_role() deja de mirar un perfil cualquiera de la cuenta: solo
--     el del hotel activo. Sin esto, una cuenta con dos perfiles podria heredar
--     el cargo de un hotel en el otro.
--   * fn_mis_hoteles() lista los hoteles de la cuenta para el selector.
--   * Los catalogos globales tambien se leen sin un hotel activo valido (por
--     ejemplo con el hotel activo suspendido), para poder elegir o crear otro.
--
-- Toda funcion redefinida aqui vuelve a recibir su GRANT: CREATE OR REPLACE
-- dispara la guarda de 0012, que revoca EXECUTE.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── usuario: un perfil por (cuenta, hotel) ──────────────────────────────────
-- La constraint inline de 0003 se llama usuario_auth_id_key; se busca por
-- columnas para no depender del nombre.
do $$
declare
  v_con text;
begin
  select c.conname into v_con
  from pg_constraint c
  where c.conrelid = 'public.usuario'::regclass
    and c.contype = 'u'
    and c.conkey = array[(
      select a.attnum from pg_attribute a
      where a.attrelid = 'public.usuario'::regclass and a.attname = 'auth_id'
    )];

  if v_con is not null then
    execute format('alter table public.usuario drop constraint %I', v_con);
  end if;
end;
$$;

alter table public.usuario
  add constraint usuario_auth_id_tenant_id_key unique (auth_id, tenant_id);

drop index public.usuario_correo_key;
create unique index usuario_correo_key on public.usuario (tenant_id, lower(correo));

-- ─── Helpers de identidad ────────────────────────────────────────────────────
-- Cargo del usuario en el hotel ACTIVO (el del JWT), o null si esta inactivo.
create or replace function public.current_user_role()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select lower(trim(c.cargo))
  from public.usuario u
  join public.cargo c on c.id_cargo = u.fk_cargo
  where u.auth_id = auth.uid()
    and u.tenant_id = public.current_tenant_id()
    and public.current_usuario_activo()
  limit 1;
$$;

-- La cuenta tiene un perfil activo en algun hotel que no este suspendido,
-- sea o no el hotel activo del JWT.
create or replace function public.current_es_miembro()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.usuario u
    join public.tenants t on t.id = u.tenant_id
    where u.auth_id = auth.uid()
      and lower(trim(u.estado)) = 'activo'
      and t.estado in ('trial', 'activo')
      and t.plan <> 'plantilla'
  );
$$;

-- Hoteles de la cuenta autenticada (uno por perfil activo). Incluye los
-- suspendidos para que el selector los muestre; la plantilla nunca se lista.
create or replace function public.fn_mis_hoteles()
returns table (
  tenant_id  bigint,
  nombre     text,
  slug       text,
  estado     text,
  trial_fin  date,
  id_usuario bigint,
  cargo      text,
  es_activo  boolean
)
language sql
security definer
set search_path = public
stable
as $$
  select t.id, t.nombre, t.slug, t.estado, t.trial_fin, u.id_usuario,
         trim(c.cargo),
         t.id = public.current_tenant_id()
  from public.usuario u
  join public.tenants t on t.id = u.tenant_id
  join public.cargo c on c.id_cargo = u.fk_cargo
  where u.auth_id = auth.uid()
    and lower(trim(u.estado)) = 'activo'
    and t.plan <> 'plantilla'
  order by lower(t.nombre), t.id;
$$;

-- ─── Perfil desde Auth: idempotente por hotel ────────────────────────────────
-- Igual que 0005, salvo la comprobacion de existencia: ahora es por
-- (auth_id, tenant_id), asi una cuenta con perfil en otro hotel no se ignora.
create or replace function public.fn_crear_perfil_desde_auth(p_user auth.users)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant  bigint := nullif(p_user.raw_app_meta_data ->> 'tenant_id', '')::bigint;
  v_cargo   bigint := nullif(p_user.raw_app_meta_data ->> 'fk_cargo', '')::bigint;
  v_tipodoc bigint := nullif(p_user.raw_user_meta_data ->> 'fk_tipo_doc', '')::bigint;
  v_usuario text;
begin
  if v_tenant is null or v_cargo is null then
    return;
  end if;

  if exists (
    select 1 from public.usuario u
    where u.auth_id = p_user.id and u.tenant_id = v_tenant
  ) then
    return;
  end if;

  if v_tipodoc is null then
    raise exception 'Falta user_metadata.fk_tipo_doc para crear el perfil de %.', p_user.email;
  end if;

  v_usuario := coalesce(nullif(trim(p_user.raw_user_meta_data ->> 'usuario'), ''),
                        split_part(p_user.email, '@', 1));

  -- El handle por defecto (parte local del correo) puede chocar dentro del tenant.
  if exists (
    select 1 from public.usuario u
    where u.tenant_id = v_tenant and lower(u.usuario) = lower(v_usuario)
  ) then
    v_usuario := v_usuario || '-' || substr(md5(p_user.id::text), 1, 4);
  end if;

  insert into public.usuario (
    tenant_id, auth_id, correo, nombre, documento, telefono, usuario,
    fk_tipo_doc, fk_cargo, estado
  )
  values (
    v_tenant,
    p_user.id,
    p_user.email,
    coalesce(p_user.raw_user_meta_data ->> 'nombre', ''),
    coalesce(p_user.raw_user_meta_data ->> 'documento', ''),
    nullif(p_user.raw_user_meta_data ->> 'telefono', ''),
    v_usuario,
    v_tipodoc,
    v_cargo,
    'Activo'
  );
end;
$$;

-- ─── Policies ────────────────────────────────────────────────────────────────
-- usuario: la propia fila del hotel activo (aunque este inactiva, ver 0006) o,
-- si esta activo, el resto del personal de ese hotel. Los demas hoteles de la
-- cuenta se listan con fn_mis_hoteles().
drop policy usuario_select on public.usuario;
create policy usuario_select on public.usuario
  for select to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and (
      auth_id = (select auth.uid())
      or (select public.current_usuario_activo())
    )
  );

-- Catalogos globales: legibles para quien tenga un perfil activo en el hotel
-- activo o en cualquier hotel no suspendido de su cuenta.
do $$
declare
  t text;
begin
  foreach t in array array[
    'paises', 'departamentos', 'distritos', 'ciudades', 'barrios', 'iva',
    'monedas', 'tipo_factura', 'modo_pago', 'tipo_operacion', 'tipo_documento',
    'tipo_contribuyente', 'tipo_regimen', 'unidades_medida',
    'tipo_cuenta_contable', 'motivos_emision', 'actividad_economica', 'cargo'
  ] loop
    execute format('drop policy %I on public.%I', t || '_select', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using ((select public.current_usuario_activo()) or (select public.current_es_miembro()))',
      t || '_select', t);
  end loop;
end;
$$;

-- ─── Privilegios ─────────────────────────────────────────────────────────────
grant execute on function public.current_user_role()  to authenticated;
grant execute on function public.current_es_miembro() to authenticated;
grant execute on function public.fn_mis_hoteles()     to authenticated;
-- fn_crear_perfil_desde_auth la llama handle_new_user (definer): sin concesion.
