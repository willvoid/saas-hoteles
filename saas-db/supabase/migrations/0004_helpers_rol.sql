-- ═══════════════════════════════════════════════════════════════════════════
-- 0004 · Helpers de identidad y rol
-- ═══════════════════════════════════════════════════════════════════════════
-- Son SECURITY DEFINER para poder leer `usuario`, `cargo` y `tenants` sin
-- disparar recursivamente las policies que se definen en terminos de ellos.
--
-- Todos exigen que el perfil pertenezca al tenant que declara el JWT: un token
-- cuyo `app_metadata.tenant_id` no coincide con `usuario.tenant_id` no resuelve
-- ninguna identidad.
-- ═══════════════════════════════════════════════════════════════════════════

-- Perfil del usuario autenticado (sin mirar su estado).
create or replace function public.current_usuario_id()
returns bigint
language sql
security definer
set search_path = public
stable
as $$
  select u.id_usuario
  from public.usuario u
  where u.auth_id = auth.uid()
    and u.tenant_id = public.current_tenant_id()
  limit 1;
$$;

-- Usuario activo dentro de un tenant activo. Es el unico lugar donde se decide
-- que un tenant suspendido deja sin acceso a todo su personal.
create or replace function public.current_usuario_activo()
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
      and u.tenant_id = public.current_tenant_id()
      and lower(trim(u.estado)) = 'activo'
      and t.estado in ('trial', 'activo')
  );
$$;

-- Cargo normalizado del usuario autenticado, o null si esta inactivo.
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
    and public.current_usuario_activo()
  limit 1;
$$;

create or replace function public.current_es_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(public.current_user_role() in ('admin', 'administrador'), false);
$$;

create or replace function public.current_es_admin_o_gerente()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(public.current_user_role() in ('admin', 'administrador', 'gerente'), false);
$$;

-- Lista cerrada de cargos que operan los modulos de negocio. Un cargo nuevo o
-- no reconocido NO opera: hay que sumarlo aqui de forma explicita (y en
-- src/utils/permissions.ts). Como `cargo` es un catalogo global que solo
-- modifica la plataforma, cada cargo agregado se revisa a conciencia.
create or replace function public.current_puede_operar()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    public.current_user_role() in ('admin', 'administrador', 'gerente', 'recepcionista'),
    false);
$$;
