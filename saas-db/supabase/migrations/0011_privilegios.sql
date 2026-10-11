-- ═══════════════════════════════════════════════════════════════════════════
-- 0011 · Privilegios minimos
-- ═══════════════════════════════════════════════════════════════════════════
-- RLS decide que filas ve cada rol, pero no cubre TRUNCATE ni el EXECUTE de
-- funciones. Este archivo cierra esos dos frentes y deja por escrito que puede
-- llamar cada funcion.
--
-- Convencion para funciones nuevas: Postgres concede EXECUTE a PUBLIC por
-- defecto, y Supabase lo concede ademas a anon y authenticated. Toda funcion
-- nueva debe terminar con
--   revoke execute on function ... from public, anon, authenticated;
--   grant execute on function ... to <quien corresponda>;
-- (el Security Advisor de Supabase avisa de las que lo olviden).
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Tablas ──────────────────────────────────────────────────────────────────
revoke all on all tables in schema public from anon;
revoke truncate, references, trigger on all tables in schema public from authenticated;

-- Catalogos y tenants: el cliente solo lee. Las policies ya no dan escritura;
-- esto lo refuerza a nivel de privilegio.
do $$
declare
  t text;
begin
  foreach t in array array[
    'tenants', 'paises', 'departamentos', 'distritos', 'ciudades', 'barrios',
    'iva', 'monedas', 'tipo_factura', 'modo_pago', 'tipo_operacion',
    'tipo_documento', 'tipo_contribuyente', 'tipo_regimen', 'unidades_medida',
    'tipo_cuenta_contable', 'motivos_emision', 'actividad_economica', 'cargo'
  ] loop
    execute format('revoke insert, update, delete on public.%I from authenticated', t);
  end loop;
end;
$$;

-- `usuario` y `notificacion` no se insertan ni borran desde el cliente.
revoke insert, delete on public.usuario from authenticated;
revoke insert, update, delete on public.notificacion from authenticated;

-- La numeracion de facturas solo la mueve next_nro_secuencial (definer).
revoke insert, update, delete on public.factura_secuencia from authenticated;

-- Las secuencias de identidad no se tocan desde el cliente.
revoke all on all sequences in schema public from anon;

-- Valores por defecto para objetos futuros. Postgres concede ademas EXECUTE a
-- PUBLIC en toda funcion nueva: eso no se revoca aqui sino en el event trigger
-- de 0012, que tambien habilita RLS en cada tabla nueva.
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke truncate, references, trigger on tables from authenticated;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke execute on functions from anon, authenticated;

-- ─── Funciones ───────────────────────────────────────────────────────────────
revoke execute on all functions in schema public from public, anon, authenticated;

-- Usadas por las policies, los defaults de tenant_id y el frontend.
grant execute on function public.current_tenant_id()          to authenticated;
grant execute on function public.current_usuario_id()         to authenticated;
grant execute on function public.current_usuario_activo()     to authenticated;
grant execute on function public.current_user_role()          to authenticated;
grant execute on function public.current_es_admin()           to authenticated;
grant execute on function public.current_es_admin_o_gerente() to authenticated;
grant execute on function public.current_puede_operar()       to authenticated;

-- RPC del frontend autenticado.
grant execute on function public.incrementar_total_folio(bigint, numeric)  to authenticated;
grant execute on function public.next_nro_secuencial(bigint, bigint)       to authenticated;
grant execute on function public.marcar_notificacion_leida(bigint)         to authenticated;
grant execute on function public.marcar_todas_notificaciones_leidas()      to authenticated;

-- Landing publica: unica entrada de anon.
grant execute on function public.fn_landing_catalogo(text)                       to anon, authenticated;
grant execute on function public.fn_landing_ocupacion(text, date, date)          to anon, authenticated;
grant execute on function public.fn_registrar_reserva_landing(text, jsonb)       to anon, authenticated;

-- Alta de tenants: solo service_role (o un operador con el rol postgres).
grant execute on function public.fn_provision_tenant(jsonb)           to service_role;
grant execute on function public.fn_seed_tenant_desde_plantilla(bigint) to service_role;

-- Sin concesiones a proposito:
--   fn_landing_tenant            la usan otras funciones definer, no el cliente.
--   fn_actualizar_estado_tarifas la ejecuta pg_cron como postgres.
--   funciones de trigger         no requieren EXECUTE para dispararse.
