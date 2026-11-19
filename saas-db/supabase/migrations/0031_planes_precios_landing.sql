-- ═══════════════════════════════════════════════════════════════════════════
-- 0031 · Precios y textos de planes para la nueva landing
-- ═══════════════════════════════════════════════════════════════════════════
--   * Basico: 250.000/mes, nombre con tilde, SIFEN como opcional pago.
--   * Pro: 390.000/mes, hotel adicional sin cambios (180.000).
--   * Business: sin cambios de precio; suma el acompanamiento en SIFEN.
--   * Anual = 10 mensualidades (dos meses gratis), igual que antes.
--
-- Solo cambia datos de `planes` (precios, nombre y `modulos`): no toca topes,
-- columnas ni funciones. `mod_sifen` NO se modifica: es el interruptor real del
-- modulo y se activa cuando la facturacion electronica funcione con proveedor.
-- Los textos de SIFEN de `modulos` son los que promete la landing.
--
-- Los pagos de suscripcion ya registrados conservan su monto historico.
-- ═══════════════════════════════════════════════════════════════════════════

update public.planes set
  nombre = 'Básico',
  precio_mensual = 250000, precio_anual = 2500000,
  modulos = '["Reservas y calendario de ocupación","Habitaciones y estados en tiempo real","Módulo de limpieza","Check-in y check-out","Cargos extra y huéspedes","Roles y permisos de usuario","Factura electrónica SIFEN opcional (+ Gs. 70.000 / mes)","Soporte por WhatsApp"]'::jsonb
where codigo = 'basico';

update public.planes set
  precio_mensual = 390000, precio_anual = 3900000,
  modulos = '["Todo lo del plan Básico","Factura electrónica SIFEN incluida","Facturación electrónica desde el folio del huésped, sin sistemas aparte","Contabilidad: plan de cuentas, cierre mensual y reportes financieros","Soporte prioritario por WhatsApp"]'::jsonb
where codigo = 'pro';

update public.planes set
  modulos = '["Todo lo del plan Pro","Factura electrónica SIFEN incluida","Cambio rápido entre hoteles","Onboarding asistido y migración de datos","Acompañamiento en la habilitación SIFEN","Acuerdo de nivel de servicio","Soporte prioritario"]'::jsonb
where codigo = 'business';
