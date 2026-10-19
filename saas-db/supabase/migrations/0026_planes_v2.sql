-- ═══════════════════════════════════════════════════════════════════════════
-- 0026 · Planes v2: modulos detallados, hotel adicional y hoteles por contrato
-- ═══════════════════════════════════════════════════════════════════════════
--   * Basico: 1 hotel, 3 usuarios, 15 habitaciones.
--   * Pro: 1 hotel incluido, 10 usuarios, 30 habitaciones; cada hotel adicional
--     se cobra aparte (`precio_hotel_adicional`).
--   * Business: hoteles, usuarios y habitaciones segun contrato.
--   * `tenants.hoteles_contratados` es el tope por contrato: si no es null
--     reemplaza a `planes.max_hoteles` en fn_max_hoteles_cuenta(). Lo asigna la
--     plataforma al contratar hoteles adicionales (Pro) o al cerrar contrato
--     (Business). Un Business sin valor sigue ilimitado.
--   * `modulos` es la lista de textos que muestra la landing; `contacto_ventas`
--     reemplaza el boton de prueba por "Hablar con ventas".
--
-- Los hoteles que ya superan el nuevo tope de habitaciones conservan lo que
-- tienen: los triggers de 0014 solo rechazan altas nuevas.
-- Toda funcion redefinida recibe su GRANT explicito (guarda de 0012).
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.planes
  add column precio_hotel_adicional numeric check (precio_hotel_adicional >= 0),
  add column precio_hotel_adicional_anual numeric check (precio_hotel_adicional_anual >= 0),
  add column contacto_ventas boolean not null default false,
  add column modulos jsonb not null default '[]'::jsonb
    check (jsonb_typeof(modulos) = 'array');

comment on column public.planes.precio_hotel_adicional is
  'Precio mensual por hotel adicional sobre los incluidos. null = el plan no admite hoteles adicionales por lista.';
comment on column public.planes.precio_hotel_adicional_anual is
  'Precio anual por hotel adicional. null = sin precio anual.';
comment on column public.planes.contacto_ventas is
  'true: el plan se contrata con el equipo comercial; el precio publicado es "desde".';
comment on column public.planes.modulos is
  'Lista (array JSON de textos) de lo que incluye el plan, para la landing.';

alter table public.tenants
  add column hoteles_contratados integer check (hoteles_contratados > 0);

comment on column public.tenants.hoteles_contratados is
  'Tope de hoteles por contrato para la cuenta; si no es null reemplaza a planes.max_hoteles.';

-- ─── Precios, topes y modulos ────────────────────────────────────────────────
update public.planes set
  precio_mensual = 150000, precio_anual = 1500000,
  max_habitaciones = 15, max_usuarios = 3, max_hoteles = 1,
  modulos = '["Reservas y calendario de ocupación","Habitaciones y estados en tiempo real","Check-in y check-out","Cargos extra y huéspedes","Página pública del hotel","Soporte por email"]'::jsonb
where codigo = 'basico';

update public.planes set
  precio_mensual = 300000, precio_anual = 3000000,
  max_habitaciones = 30, max_usuarios = 10, max_hoteles = 1,
  precio_hotel_adicional = 180000, precio_hotel_adicional_anual = 1800000,
  modulos = '["Todo lo del plan Básico","Contabilidad: plan de cuentas, cierre mensual y reportes financieros","Facturación electrónica SIFEN","Roles y permisos de usuario","Soporte prioritario por WhatsApp"]'::jsonb
where codigo = 'pro';

update public.planes set
  precio_mensual = 790000, precio_anual = 0,
  max_habitaciones = null, max_usuarios = null, max_hoteles = null,
  contacto_ventas = true,
  modulos = '["Todo lo del plan Pro","Hoteles según contrato, con cambio rápido entre ellos","Usuarios y habitaciones ilimitados","Onboarding asistido y migración de datos","Acuerdo de nivel de servicio"]'::jsonb
where codigo = 'business';

-- El trial evalua Pro: mismos topes (un solo hotel por cuenta).
update public.planes set max_habitaciones = 30, max_usuarios = 10 where codigo = 'trial';

-- ─── Planes publicos ─────────────────────────────────────────────────────────
-- Cambia el tipo de retorno: hay que recrearla.
drop function public.fn_planes_publicos();

create function public.fn_planes_publicos()
returns table (
  codigo                       text,
  nombre                       text,
  precio_mensual               numeric,
  precio_anual                 numeric,
  moneda                       text,
  max_habitaciones             integer,
  max_usuarios                 integer,
  max_hoteles                  integer,
  mod_contabilidad             boolean,
  precio_hotel_adicional       numeric,
  precio_hotel_adicional_anual numeric,
  contacto_ventas              boolean,
  modulos                      jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select p.codigo, p.nombre, p.precio_mensual, p.precio_anual, p.moneda,
         p.max_habitaciones, p.max_usuarios, p.max_hoteles, p.mod_contabilidad,
         p.precio_hotel_adicional, p.precio_hotel_adicional_anual,
         p.contacto_ventas, p.modulos
  from public.planes p
  where p.visible
  order by p.precio_mensual asc, p.orden asc, p.codigo asc;
$$;

comment on function public.fn_planes_publicos() is
  'Planes ofrecidos (visible = true) con precios, topes y modulos; null = ilimitado. Publica: no expone planes ocultos.';

revoke execute on function public.fn_planes_publicos() from public;
grant  execute on function public.fn_planes_publicos() to anon, authenticated;

-- ─── Tope de hoteles por cuenta ──────────────────────────────────────────────
-- El tope de un hotel es `hoteles_contratados` si el contrato lo fija; si no,
-- el `max_hoteles` del plan (null = ilimitado).
create or replace function public.fn_max_hoteles_cuenta()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select case
           when count(*) = 0 then 1
           when bool_or(coalesce(t.hoteles_contratados, p.max_hoteles) is null) then null
           else max(coalesce(t.hoteles_contratados, p.max_hoteles))
         end
  from public.usuario u
  join public.tenants t on t.id = u.tenant_id
  join public.planes  p on p.codigo = t.plan
  join public.cargo   c on c.id_cargo = u.fk_cargo
  where u.auth_id = auth.uid()
    and lower(trim(u.estado)) = 'activo'
    and lower(trim(c.cargo)) in ('admin', 'administrador')
    and t.plan <> 'plantilla';
$$;

revoke execute on function public.fn_max_hoteles_cuenta() from public, anon, authenticated;
grant  execute on function public.fn_max_hoteles_cuenta() to authenticated;
