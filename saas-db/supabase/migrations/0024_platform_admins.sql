-- ═══════════════════════════════════════════════════════════════════════════
-- 0024 · Super admin de plataforma
-- ═══════════════════════════════════════════════════════════════════════════
-- El operador de la plataforma NO pasa por las policies de los tenants. Todas
-- sus acciones van por la edge function `superadmin`, que valida el JWT, usa
-- fn_es_platform_admin() como guard y ejecuta con service_role.
--
-- Por eso nada de esto tiene acceso para anon ni authenticated: ni las tablas
-- ni las funciones. Las policies de 0006 y 0014 no se tocan.
--
-- Alta del primer operador (una sola vez, con service_role o desde el editor SQL):
--   insert into public.platform_admins (auth_id)
--   select id from auth.users where email = '<correo del operador>';
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Operadores ──────────────────────────────────────────────────────────────
create table public.platform_admins (
  auth_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

comment on table public.platform_admins is
  'Operadores de la plataforma (super admin). Sin acceso para anon ni authenticated: solo service_role.';

alter table public.platform_admins enable row level security;
revoke all on public.platform_admins from anon, authenticated;

-- ─── Auditoria ───────────────────────────────────────────────────────────────
create table public.platform_audit (
  id         bigint generated always as identity primary key,
  actor      uuid   not null,
  action     text   not null check (length(trim(action)) > 0),
  tenant_id  bigint references public.tenants (id) on delete set null,
  payload    jsonb  not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index platform_audit_tenant_idx on public.platform_audit (tenant_id, created_at desc);
create index platform_audit_created_idx on public.platform_audit (created_at desc);

comment on table public.platform_audit is
  'Registro de las acciones del super admin sobre los tenants. Sin acceso para anon ni authenticated.';

alter table public.platform_audit enable row level security;
revoke all on public.platform_audit from anon, authenticated;

-- ─── Guard ───────────────────────────────────────────────────────────────────
create or replace function public.fn_es_platform_admin(p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.platform_admins pa where pa.auth_id = p_uid);
$$;

comment on function public.fn_es_platform_admin(uuid) is
  'Guard de la edge function superadmin. Solo service_role.';

-- ─── Resumen por tenant ──────────────────────────────────────────────────────
create or replace function public.fn_admin_tenants_resumen()
returns table (
  id                 bigint,
  nombre             text,
  slug               text,
  estado             text,
  plan               text,
  trial_fin          date,
  vigente_hasta      date,
  suscripcion_vigente boolean,
  created_at         timestamptz,
  usuarios           bigint,
  establecimientos   bigint,
  habitaciones       bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select t.id,
         t.nombre,
         t.slug,
         t.estado,
         t.plan,
         t.trial_fin,
         t.vigente_hasta,
         public.fn_suscripcion_vigente(t.id),
         t.created_at,
         (select count(*) from public.usuario u         where u.tenant_id = t.id),
         (select count(*) from public.establecimientos e where e.tenant_id = t.id),
         (select count(*) from public.habitaciones h     where h.tenant_id = t.id)
  from public.tenants t
  order by t.created_at desc, t.id desc;
$$;

comment on function public.fn_admin_tenants_resumen() is
  'Listado global de tenants con sus conteos, para el panel del super admin. Solo service_role.';

-- ─── Privilegios ─────────────────────────────────────────────────────────────
revoke execute on function public.fn_es_platform_admin(uuid)    from public, anon, authenticated;
revoke execute on function public.fn_admin_tenants_resumen()    from public, anon, authenticated;

grant execute on function public.fn_es_platform_admin(uuid)     to service_role;
grant execute on function public.fn_admin_tenants_resumen()     to service_role;

grant select, insert, update, delete on public.platform_admins to service_role;
grant select, insert on public.platform_audit to service_role;
