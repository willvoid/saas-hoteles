-- ═══════════════════════════════════════════════════════════════════════════
-- 0027 · Textos de modulos por plan (landing)
-- ═══════════════════════════════════════════════════════════════════════════
-- Solo cambia `planes.modulos`: limpieza y roles y permisos pasan al Basico,
-- se quitan la pagina publica y SIFEN de la lista, y el soporte queda en
-- "Soporte" (Basico) y "Soporte prioritario" (Pro y Business).
-- ═══════════════════════════════════════════════════════════════════════════

update public.planes set modulos =
  '["Reservas y calendario de ocupación","Habitaciones y estados en tiempo real","Módulo de limpieza","Check-in y check-out","Cargos extra y huéspedes","Roles y permisos de usuario","Soporte"]'::jsonb
where codigo = 'basico';

update public.planes set modulos =
  '["Todo lo del plan Básico","Contabilidad: plan de cuentas, cierre mensual y reportes financieros","Soporte prioritario"]'::jsonb
where codigo = 'pro';

update public.planes set modulos =
  '["Todo lo del plan Pro","Hoteles según contrato, con cambio rápido entre ellos","Usuarios y habitaciones ilimitados","Onboarding asistido y migración de datos","Acuerdo de nivel de servicio","Soporte prioritario"]'::jsonb
where codigo = 'business';

-- Business publicaba precio_anual = 0 y la landing seguia mostrando el mensual.
-- Anual = 10 mensualidades, igual que el resto de los planes.
update public.planes set precio_anual = 7900000 where codigo = 'business';
