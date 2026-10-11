-- ═══════════════════════════════════════════════════════════════════════════
-- 0006 · Row Level Security
-- ═══════════════════════════════════════════════════════════════════════════
-- Toda tabla de `public` tiene RLS habilitada. `anon` no tiene policies en
-- ninguna: la landing publica entra solo por las RPC de 0009.
--
-- Las policies de las tablas del tenant se generan a partir de una tabla de
-- reglas (abajo), para que "quien puede escribir que" quede en un solo lugar:
--
--   operativo           escribe todo cargo salvo limpiador
--   admin_gerente       escribe admin/gerente; lee cualquier usuario activo
--   admin_gerente_total admin/gerente tambien para leer
--   todos               cualquier usuario activo (limpieza lo usan todos)
--   solo_lectura        el cliente solo lee; escribe una funcion definer
--
-- Toda policy exige ademas `tenant_id = current_tenant_id()` y usuario activo
-- de un tenant activo. Los helpers van envueltos en `(select ...)` para que
-- Postgres los evalua una vez por consulta y no por fila.
-- ═══════════════════════════════════════════════════════════════════════════

do $$
declare
  r          record;
  v_tenant   constant text := 'tenant_id = (select public.current_tenant_id())';
  v_activo   constant text := '(select public.current_usuario_activo())';
  v_operar   constant text := '(select public.current_puede_operar())';
  v_admgrt   constant text := '(select public.current_es_admin_o_gerente())';
  v_leer     text;
  v_escribir text;
begin
  for r in
    select * from (values
      ('clientes',                  'operativo'),
      ('reservas',                  'operativo'),
      ('detalle_reservas',          'operativo'),
      ('huespedes_reserva',         'operativo'),
      ('historial_estancia',        'operativo'),
      ('folios',                    'operativo'),
      ('cargos_folio',              'operativo'),
      ('facturas',                  'operativo'),
      ('detalle_factura',           'operativo'),
      ('datos_factura_sifen',       'operativo'),
      ('factura_secuencia',         'solo_lectura'),
      ('caja',                      'operativo'),
      ('apertura_cierre_caja',      'operativo'),
      ('habitaciones',              'operativo'),
      ('imagenes_habitacion',       'operativo'),
      ('bloqueos_habitacion',       'operativo'),
      ('tipo_habitacion',           'operativo'),
      ('imagenes_tipo_habitacion',  'operativo'),
      ('tarifas',                   'operativo'),
      ('conceptos',                 'operativo'),
      ('datos_empresa',             'admin_gerente'),
      ('establecimientos',          'admin_gerente'),
      ('pisos',                     'admin_gerente'),
      ('timbrados',                 'admin_gerente'),
      ('cuentas_contables',         'admin_gerente'),
      ('asientos',                  'admin_gerente'),
      ('detalle_asientos',          'admin_gerente'),
      ('saldos_mensuales',          'admin_gerente'),
      ('actividad_empresa',         'admin_gerente_total'),
      ('edificios',                 'admin_gerente_total'),
      ('estado_limpieza',           'todos')
    ) as t(tabla, regla)
  loop
    v_leer := case when r.regla = 'admin_gerente_total'
                   then v_tenant || ' and ' || v_activo || ' and ' || v_admgrt
                   else v_tenant || ' and ' || v_activo
              end;

    v_escribir := case
      when r.regla = 'operativo'
        then v_tenant || ' and ' || v_activo || ' and ' || v_operar
      when r.regla in ('admin_gerente', 'admin_gerente_total')
        then v_tenant || ' and ' || v_activo || ' and ' || v_admgrt
      else v_tenant || ' and ' || v_activo
    end;

    execute format('alter table public.%I enable row level security', r.tabla);

    execute format(
      'create policy %I on public.%I for select to authenticated using (%s)',
      r.tabla || '_select', r.tabla, v_leer);

    -- 'solo_lectura': sin policies de escritura; la tabla solo la modifican
    -- funciones SECURITY DEFINER (p. ej. next_nro_secuencial).
    if r.regla <> 'solo_lectura' then
      execute format(
        'create policy %I on public.%I for insert to authenticated with check (%s)',
        r.tabla || '_insert', r.tabla, v_escribir);
      execute format(
        'create policy %I on public.%I for update to authenticated using (%s) with check (%s)',
        r.tabla || '_update', r.tabla, v_escribir, v_escribir);
      execute format(
        'create policy %I on public.%I for delete to authenticated using (%s)',
        r.tabla || '_delete', r.tabla, v_escribir);
    end if;
  end loop;
end;
$$;

-- ─── Catalogos globales: solo lectura ────────────────────────────────────────
-- Sin policies de escritura: solo service_role (que ignora RLS) las modifica.
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
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using ((select public.current_usuario_activo()))',
      t || '_select', t);
  end loop;
end;
$$;

-- ─── tenants ─────────────────────────────────────────────────────────────────
-- Un usuario lee solo su propio tenant, aunque este suspendido (el frontend
-- necesita poder mostrar el aviso). No hay escritura desde el cliente.
create policy tenants_select on public.tenants
  for select to authenticated
  using (id = (select public.current_tenant_id()));

-- ─── usuario ─────────────────────────────────────────────────────────────────
-- SELECT: la propia fila siempre (aunque la cuenta este inactiva: el cierre de
-- sesion en caliente por Realtime evalua esta policy contra la fila nueva) y,
-- si el usuario esta activo, el resto del personal de su tenant.
-- UPDATE: admin/gerente dentro de su tenant; guard_cargo_admin (0005) impide
-- tocar cuentas admin o reasignar tenant.
-- INSERT/DELETE: ninguno desde el cliente. El alta es solo por handle_new_user,
-- fn_provision_tenant o la edge function (service_role).
alter table public.usuario enable row level security;

create policy usuario_select on public.usuario
  for select to authenticated
  using (
    auth_id = (select auth.uid())
    or (
      tenant_id = (select public.current_tenant_id())
      and (select public.current_usuario_activo())
    )
  );

create policy usuario_update on public.usuario
  for update to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and (select public.current_usuario_activo())
    and (select public.current_es_admin_o_gerente())
  )
  with check (
    tenant_id = (select public.current_tenant_id())
    and (select public.current_usuario_activo())
    and (select public.current_es_admin_o_gerente())
  );

-- ─── notificacion ────────────────────────────────────────────────────────────
-- Solo lectura de la propia bandeja. Las filas las escribe el trigger de
-- limpieza (definer) y se marcan como leidas por RPC.
alter table public.notificacion enable row level security;

create policy notificacion_select_propia on public.notificacion
  for select to authenticated
  using (
    fk_usuario = (select public.current_usuario_id())
    and (select public.current_usuario_activo())
  );

-- ─── Policies RESTRICTIVE ────────────────────────────────────────────────────
-- Se combinan con AND sobre las permissive de arriba, y solo aplican a UPDATE.

-- Solo el dueno del turno o un admin/gerente pueden cerrarlo.
create policy apertura_cierre_caja_cierre_propio_o_admin
  on public.apertura_cierre_caja
  as restrictive
  for update
  to authenticated
  using (
    fk_usuario = (select public.current_usuario_id())
    or (select public.current_es_admin_o_gerente())
  )
  with check (
    fk_usuario = (select public.current_usuario_id())
    or (select public.current_es_admin_o_gerente())
  );

-- Solo admin/gerente pueden tocar un folio que ya estaba cerrado (reabrirlo).
-- Se mira el estado ANTERIOR (USING); el WITH CHECK queda en true a proposito
-- porque cerrar un folio abierto lo deja cerrado y eso lo hace recepcion.
create policy folios_reapertura_admin_gerente
  on public.folios
  as restrictive
  for update
  to authenticated
  using (
    lower(trim(estado)) <> 'cerrado'
    or (select public.current_es_admin_o_gerente())
  )
  with check (true);

-- ─── Guarda: ninguna tabla de public puede quedar sin RLS ────────────────────
do $$
declare
  v_sin_rls text;
begin
  select string_agg(c.relname, ', ' order by c.relname)
  into v_sin_rls
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'
    and not c.relrowsecurity;

  if v_sin_rls is not null then
    raise exception 'Tablas de public sin RLS: %', v_sin_rls;
  end if;
end;
$$;
