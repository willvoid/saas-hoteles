-- ═══════════════════════════════════════════════════════════════════════════
-- 0005 · Funciones y triggers tenant-aware
-- ═══════════════════════════════════════════════════════════════════════════
-- Regla comun: toda funcion o trigger que inserta filas copia `tenant_id` de
-- NEW (o lo recibe como parametro). Nunca confia en el DEFAULT
-- current_tenant_id(): en contextos sin JWT (pg_cron, service_role, funciones
-- anonimas SECURITY DEFINER) ese default da null y el insert fallaria.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Codigo de reserva ───────────────────────────────────────────────────────
-- 8 hex son 32 bits: con reintento ante colision dentro del tenant no hay
-- fallos aleatorios por duplicado.
create or replace function public.tg_fn_generar_codigo_reserva()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.codigo_reserva is null or new.codigo_reserva = '' then
    loop
      new.codigo_reserva := 'RES-' || upper(substring(md5(random()::text || clock_timestamp()::text) from 1 for 8));
      exit when not exists (
        select 1 from public.reservas r
        where r.tenant_id = new.tenant_id
          and r.codigo_reserva = new.codigo_reserva
      );
    end loop;
  end if;

  return new;
end;
$$;

create trigger tg_reservas_autogenerar_codigo
  before insert on public.reservas
  for each row execute function public.tg_fn_generar_codigo_reserva();

-- ─── Historial de cambios de estado de una reserva ───────────────────────────
create or replace function public.log_reserva_estado_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  insert into public.historial_estancia
    (tenant_id, fk_reserva, tipo_movimiento, descripcion, fecha_movimiento, fk_usuario)
  values
    (new.tenant_id,
     new.id_reserva,
     'CAMBIO_ESTADO',
     'Estado: ' || coalesce(old.estado, '(sin estado)')
                || ' → ' || coalesce(new.estado, '(sin estado)'),
     now(),
     null);
  return new;
end;
$$;

create trigger trg_reserva_estado_change
  after update of estado on public.reservas
  for each row
  when (new.estado is distinct from old.estado)
  execute function public.log_reserva_estado_change();

-- ─── Cierre automatico de folios al hacer check-out ──────────────────────────
-- SECURITY DEFINER: el usuario que hace el check-out puede no tener permiso de
-- UPDATE sobre un folio ya cerrado (ver la policy RESTRICTIVE de 0006), asi que
-- se filtra explicitamente por tenant en vez de apoyarse en RLS.
create or replace function public.fn_cerrar_folios_checkout()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.folios
  set estado = 'cerrado'
  where fk_reserva = new.id_reserva
    and tenant_id = new.tenant_id
    and lower(trim(estado)) = 'abierto';

  return new;
end;
$$;

create trigger trg_cerrar_folios_checkout
  after update of estado on public.reservas
  for each row
  when (new.estado = 'Check-out' and old.estado is distinct from 'Check-out')
  execute function public.fn_cerrar_folios_checkout();

-- ─── Total acumulado de un folio (atomico) ───────────────────────────────────
-- Antes no existia en la base y el frontend caia a leer y escribir a mano, con
-- ventana de carrera. SECURITY INVOKER: aplican las policies de `folios`.
create or replace function public.incrementar_total_folio(p_folio_id bigint, p_monto numeric)
returns void
language sql
security invoker
set search_path = public
as $$
  update public.folios
  set total_acumulado = total_acumulado + p_monto
  where id_folio = p_folio_id;
$$;

-- ─── Numeracion de facturas ──────────────────────────────────────────────────
-- Atomica por (establecimiento, tipo de factura). `factura_secuencia` es de
-- solo lectura para el cliente (ver 0006): esta funcion es la unica via de
-- escritura, por eso es SECURITY DEFINER y comprueba ella misma que el llamador
-- este activo, pueda operar y que el establecimiento sea de su tenant.
create or replace function public.next_nro_secuencial(p_estab bigint, p_tipo bigint)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant bigint := public.current_tenant_id();
  v_next   bigint;
begin
  if not public.current_usuario_activo() or not public.current_puede_operar() then
    raise exception 'No autorizado para emitir numeracion.' using errcode = '42501';
  end if;

  if v_tenant is null
     or not exists (
       select 1 from public.establecimientos e
       where e.id_establecimiento = p_estab
         and e.tenant_id = v_tenant
     ) then
    raise exception 'Establecimiento no válido para este tenant.' using errcode = '42501';
  end if;

  insert into public.factura_secuencia (tenant_id, fk_establecimientos, fk_tipo_factura, ultimo)
  values (v_tenant, p_estab, p_tipo, 1)
  on conflict (fk_establecimientos, fk_tipo_factura)
    do update set ultimo = public.factura_secuencia.ultimo + 1
  returning ultimo into v_next;

  return v_next;
end;
$$;

-- ─── Notificaciones por cambio de estado de limpieza ─────────────────────────
-- SECURITY DEFINER: escribe filas de otros usuarios y debe saltar RLS. Los
-- destinatarios se acotan al tenant de la habitacion; sin ese filtro un evento
-- de limpieza de un hotel notificaria al personal de todos los demas.
create or replace function public.notificar_cambio_estado_limpieza()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tipo          text;
  v_destinatarios text[];
  v_numero        integer;
  v_titulo        text;
  v_cuerpo        text;
  v_actor         bigint;
  v_actor_nombre  text;
  v_por_texto     text;
begin
  if new.estado = 'Sucia' then
    v_tipo := 'HABITACION_SUCIA';
    v_destinatarios := array['limpiador', 'limpiadora'];
  elsif new.estado = 'En Limpieza' then
    v_tipo := 'HABITACION_EN_LIMPIEZA';
    v_destinatarios := array['recepcionista', 'gerente', 'admin', 'administrador'];
  elsif new.estado = 'Limpia' then
    v_tipo := 'HABITACION_LIMPIA';
    v_destinatarios := array['recepcionista', 'gerente', 'admin', 'administrador'];
  else
    -- 'Ocupada' y 'Bloqueada' no se anuncian.
    return new;
  end if;

  select h.numero_habitacion into v_numero
  from public.habitaciones h
  where h.id = new.fk_habitacion
    and h.tenant_id = new.tenant_id;

  -- Quien hizo el cambio no necesita enterarse, pero el resto sabe quien fue.
  v_actor := public.current_usuario_id();

  if v_actor is not null then
    select u.nombre into v_actor_nombre
    from public.usuario u
    where u.id_usuario = v_actor
      and u.tenant_id = new.tenant_id;
  end if;

  v_por_texto := case when v_actor_nombre is not null then ' (' || v_actor_nombre || ')' else '' end;

  if v_tipo = 'HABITACION_SUCIA' then
    v_titulo := 'Habitación #' || coalesce(v_numero::text, '?') || ' requiere limpieza';
    v_cuerpo := 'Marcada como Sucia' || v_por_texto || '. Está esperando ser limpiada.';
  elsif v_tipo = 'HABITACION_EN_LIMPIEZA' then
    v_titulo := 'Habitación #' || coalesce(v_numero::text, '?') || ' en limpieza';
    v_cuerpo := 'Puesta en limpieza' || v_por_texto || '.';
  else
    v_titulo := 'Habitación #' || coalesce(v_numero::text, '?') || ' ya está limpia';
    v_cuerpo := 'Marcada como Limpia' || v_por_texto || '. Está disponible.';
  end if;

  insert into public.notificacion (tenant_id, fk_usuario, tipo, titulo, cuerpo, fk_habitacion)
  select new.tenant_id, u.id_usuario, v_tipo, v_titulo, v_cuerpo, new.fk_habitacion
  from public.usuario u
  join public.cargo c on c.id_cargo = u.fk_cargo
  where u.tenant_id = new.tenant_id
    and lower(trim(c.cargo)) = any (v_destinatarios)
    and lower(trim(u.estado)) = 'activo'
    and (v_actor is null or u.id_usuario <> v_actor);

  return new;
end;
$$;

-- `updateEstadoLimpieza` reescribe siempre `ultima_actualizacion`: sin la
-- guarda `is distinct from`, guardar dos veces el mismo estado notificaria dos
-- veces.
create trigger trg_estado_limpieza_notificar_update
  after update of estado on public.estado_limpieza
  for each row
  when (new.estado is distinct from old.estado)
  execute function public.notificar_cambio_estado_limpieza();

-- La primera fila de estado de una habitacion tambien cuenta como transicion.
create trigger trg_estado_limpieza_notificar_insert
  after insert on public.estado_limpieza
  for each row
  execute function public.notificar_cambio_estado_limpieza();

create or replace function public.marcar_notificacion_leida(p_id bigint)
returns void
language sql
security definer
set search_path = public
as $$
  update public.notificacion
  set leida = true,
      leida_at = now()
  where id_notificacion = p_id
    and fk_usuario = public.current_usuario_id()
    and public.current_usuario_activo()
    and leida = false;
$$;

create or replace function public.marcar_todas_notificaciones_leidas()
returns void
language sql
security definer
set search_path = public
as $$
  update public.notificacion
  set leida = true,
      leida_at = now()
  where fk_usuario = public.current_usuario_id()
    and public.current_usuario_activo()
    and leida = false;
$$;

-- ─── Solo un admin administra cuentas de administrador ───────────────────────
-- `usuario_update_admin` (0006) deja que admin y gerente actualicen cualquier
-- fila de `usuario` de su tenant. Sin este trigger un gerente podria promoverse
-- a administrador con una llamada directa a la API.
--
-- Sin sesion de usuario (auth.uid() null: service_role, funciones internas) no
-- se restringe: esas rutas hacen su propia autorizacion.
create or replace function public.guard_cargo_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  rol_actor    text;
  cargo_nuevo  text;
  cargo_previo text;
begin
  if auth.uid() is null then
    return new;
  end if;

  -- El tenant, la cuenta de acceso y el correo de un perfil no se reasignan
  -- desde la API (el correo es el identificador de login en auth.users).
  if tg_op = 'UPDATE'
     and (new.tenant_id is distinct from old.tenant_id
          or new.auth_id is distinct from old.auth_id
          or new.correo is distinct from old.correo) then
    raise exception 'No se puede cambiar el tenant, el correo ni la cuenta de acceso de un usuario.'
      using errcode = '42501';
  end if;

  rol_actor := public.current_user_role();

  if rol_actor in ('admin', 'administrador') then
    return new;
  end if;

  select lower(trim(c.cargo)) into cargo_nuevo
  from public.cargo c
  where c.id_cargo = new.fk_cargo;

  if tg_op = 'UPDATE' then
    select lower(trim(c.cargo)) into cargo_previo
    from public.cargo c
    where c.id_cargo = old.fk_cargo;

    if cargo_previo in ('admin', 'administrador') then
      raise exception 'Solo un administrador puede modificar una cuenta de administrador.'
        using errcode = '42501';
    end if;
  end if;

  if cargo_nuevo in ('admin', 'administrador') then
    raise exception 'Solo un administrador puede asignar el cargo de administrador.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger usuario_guard_cargo_admin
  before insert or update on public.usuario
  for each row execute function public.guard_cargo_admin();

-- ─── Perfil asociado a una cuenta de Auth ────────────────────────────────────
-- El tenant y el cargo se leen de `raw_app_meta_data`, que solo escribe el
-- servidor (admin API / service_role). `raw_user_meta_data` lo controla el
-- propio cliente en un signUp, asi que de ahi solo se toman datos de contacto.
-- Una cuenta sin tenant en app_metadata no genera perfil: queda sin acceso
-- hasta que fn_provision_tenant (0008) o la edge function de alta la vincule.
--
-- La admin API de GoTrue puede aplicar `app_metadata` en un UPDATE posterior al
-- INSERT de la cuenta, por eso la misma funcion cuelga de ambos triggers. Es
-- idempotente: si el perfil ya existe no hace nada.
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

  if exists (select 1 from public.usuario u where u.auth_id = p_user.id) then
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

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.fn_crear_perfil_desde_auth(new);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create trigger on_auth_user_app_metadata_updated
  after update of raw_app_meta_data on auth.users
  for each row
  when (new.raw_app_meta_data is distinct from old.raw_app_meta_data)
  execute function public.handle_new_user();

-- Al borrar una cuenta de Auth el perfil se conserva (lo referencian reservas,
-- cajas, folios...) pero queda inactivo y libera el correo, para poder volver a
-- dar de alta a la misma persona. Es BEFORE DELETE porque la FK `on delete set
-- null` de auth_id se ejecuta como trigger AFTER y despues ya no se lo ubica.
create or replace function public.handle_deleted_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.usuario
  set estado = 'Inactivo',
      correo = 'eliminado-' || id_usuario || '@invalid.local'
  where auth_id = old.id;

  return old;
end;
$$;

create trigger on_auth_user_deleted
  before delete on auth.users
  for each row execute function public.handle_deleted_user();

-- ─── Vencimiento de tarifas ──────────────────────────────────────────────────
-- Solo desactiva: una tarifa que un admin dejo inactiva nunca se reactiva sola,
-- y las que no tienen fecha_fin no vencen. Es global y depende solo de la
-- fecha, por eso no distingue tenants.
create or replace function public.fn_actualizar_estado_tarifas()
returns void
language sql
security definer
set search_path = public
as $$
  update public.tarifas
  set estado = 'Inactiva'
  where lower(trim(estado)) = 'activa'
    and fecha_fin is not null
    and fecha_fin < current_date;
$$;

comment on function public.fn_actualizar_estado_tarifas() is
  'Desactiva las tarifas Activas cuya fecha_fin ya paso. No reactiva ninguna.';

-- Diario a las 00:05 (hora de la base). pg_cron no es relocatable: se instala
-- en su propio esquema, sin `with schema`. Si no esta disponible la migracion no
-- falla, pero lo avisa como WARNING: sin el job las tarifas vencidas siguen
-- activas hasta que alguien las edite.
do $$
begin
  create extension if not exists pg_cron;
  perform cron.unschedule(jobid) from cron.job where jobname = 'actualizar-estado-tarifas';
  perform cron.schedule('actualizar-estado-tarifas', '5 0 * * *', 'select public.fn_actualizar_estado_tarifas();');
exception
  when others then
    raise warning 'No se pudo programar el vencimiento de tarifas con pg_cron (%). Habilitar la extension y programar fn_actualizar_estado_tarifas() a mano.', sqlerrm;
end;
$$;
