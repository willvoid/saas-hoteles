-- ═══════════════════════════════════════════════════════════════════════════
-- 0001 · Tenants y claim de tenant
-- ═══════════════════════════════════════════════════════════════════════════
-- Un tenant es la cuenta que contrata el SaaS (un hotel o un grupo hotelero).
-- Agrupa N empresas (RUC), y cada empresa N establecimientos.
--
-- El tenant del usuario viaja en el JWT como `app_metadata.tenant_id`. Ese
-- bloque solo lo puede escribir el servidor (service_role / admin API), nunca
-- el cliente, a diferencia de `user_metadata`.
-- ═══════════════════════════════════════════════════════════════════════════

create table public.tenants (
  id             bigint generated always as identity primary key,
  created_at     timestamptz not null default now(),
  nombre         text not null check (length(trim(nombre)) > 0),
  slug           text not null check (slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'),
  estado         text not null default 'trial'
                 check (estado in ('trial', 'activo', 'suspendido')),
  plan           text not null default 'trial',
  trial_fin      date,
  fk_usuario_web bigint
);

create unique index tenants_slug_key on public.tenants (slug);

comment on table public.tenants is
  'Cuenta cliente del SaaS. Un tenant suspendido pierde el acceso de todos sus usuarios (ver current_usuario_activo).';
comment on column public.tenants.fk_usuario_web is
  'Usuario al que se atribuyen las reservas de origen web (landing publica). Se completa en el provisioning.';

alter table public.tenants enable row level security;

-- Tenant del llamador, leido del JWT. No consulta tablas: es barata y se puede
-- usar en defaults, policies y triggers sin riesgo de recursion de RLS.
create or replace function public.current_tenant_id()
returns bigint
language sql
stable
set search_path = ''
as $$
  select nullif(auth.jwt() -> 'app_metadata' ->> 'tenant_id', '')::bigint;
$$;
