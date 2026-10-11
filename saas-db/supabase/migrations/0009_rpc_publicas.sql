-- ═══════════════════════════════════════════════════════════════════════════
-- 0009 · RPC publicas de la landing (reservas web)
-- ═══════════════════════════════════════════════════════════════════════════
-- `anon` no tiene acceso directo a ninguna tabla. El sitio publico de cada
-- hotel entra por estas funciones, que reciben el slug del tenant en la URL
-- (por ejemplo /h/{slug}) y solo devuelven lo que el visitante necesita.
--
-- Son SECURITY DEFINER, asi que no pueden confiar en current_tenant_id() (el
-- visitante no tiene JWT): resuelven el tenant por slug y lo pasan explicito a
-- cada consulta e insert.
--
-- Un slug desconocido o de un tenant suspendido se trata igual que "no existe":
-- no se distingue para no revelar que tenants existen.
-- ═══════════════════════════════════════════════════════════════════════════

-- Resuelve el slug a un tenant activo. Interna: no se concede a anon.
create or replace function public.fn_landing_tenant(p_slug text)
returns bigint
language sql
security definer
stable
set search_path = public
as $$
  select t.id
  from public.tenants t
  where t.slug = lower(trim(p_slug))
    and t.estado in ('trial', 'activo')
  limit 1;
$$;

-- Catalogo que necesita el wizard de reserva. Devuelve null si el hotel no
-- esta disponible.
create or replace function public.fn_landing_catalogo(p_slug text)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_tenant bigint := public.fn_landing_tenant(p_slug);
begin
  if v_tenant is null then
    return null;
  end if;

  return jsonb_build_object(
    'tipos_habitacion', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.id)
      from (
        select th.id, th.nombre, th.descripcion, th.capacidad
        from public.tipo_habitacion th
        where th.tenant_id = v_tenant
      ) x
    ), '[]'::jsonb),
    'imagenes_tipo_habitacion', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.id)
      from (
        select i.id, i.fk_tipo_habitacion, i.ruta_storage, i.es_principal
        from public.imagenes_tipo_habitacion i
        where i.tenant_id = v_tenant
      ) x
    ), '[]'::jsonb),
    'tarifas', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.id)
      from (
        select t.id, t.nombre, t.precio_base, t.estado, t.fk_tipo_habitacion,
               t.fecha_inicio, t.fecha_fin
        from public.tarifas t
        where t.tenant_id = v_tenant
          and lower(trim(t.estado)) = 'activa'
      ) x
    ), '[]'::jsonb),
    'habitaciones', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.id)
      from (
        select h.id, h.fk_tipo_habitacion
        from public.habitaciones h
        where h.tenant_id = v_tenant
      ) x
    ), '[]'::jsonb),
    'tipos_documento', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.cod_tipodoc)
      from (
        select d.cod_tipodoc, d.descripcion_tipodoc
        from public.tipo_documento d
      ) x
    ), '[]'::jsonb)
  );
end;
$$;

-- Habitaciones no disponibles en [p_desde, p_hasta): con una reserva que
-- bloquea disponibilidad o con un bloqueo de mantenimiento. No expone clientes,
-- montos ni fechas de otras reservas.
create or replace function public.fn_landing_ocupacion(p_slug text, p_desde date, p_hasta date)
returns table (fk_habitacion bigint)
language plpgsql
security definer
stable
set search_path = public
as $$
#variable_conflict use_column
declare
  v_tenant bigint := public.fn_landing_tenant(p_slug);
begin
  if v_tenant is null or p_desde is null or p_hasta is null or p_desde >= p_hasta then
    return;
  end if;

  return query
    select dr.fk_habitacion
    from public.detalle_reservas dr
    join public.reservas r
      on r.tenant_id = dr.tenant_id and r.id_reserva = dr.fk_reserva
    where dr.tenant_id = v_tenant
      and lower(trim(dr.estado)) = 'activo'
      and lower(trim(r.estado)) in ('pendiente', 'confirmada', 'check-in')
      and r.fecha_entrada < p_hasta
      and r.fecha_salida > p_desde
    union
    select bh.fk_habitacion
    from public.bloqueos_habitacion bh
    where bh.tenant_id = v_tenant
      and bh.fecha_inicio <= p_hasta
      and (bh.fecha_fin is null or bh.fecha_fin >= p_desde);
end;
$$;

-- Registra una reserva web en estado Pendiente.
--
-- Contrato de respuesta: { success, message, id_reserva, codigo_reserva,
-- total_estimado } o { success: false, error_message, error_code }. Ya no se
-- devuelve `id_cliente` (el frontend no lo usa y permitia saber si un documento
-- estaba registrado).
--
--  * El precio sale siempre de `tarifas` del tenant; lo que mande el cliente
--    se ignora (misma regla que resolveTarifaForStay en src/utils/tarifas.ts).
--  * Una reserva a la vez por tenant: advisory lock por tenant, para que la
--    busqueda de habitacion libre y su ocupacion no se crucen sin frenar a los
--    demas hoteles.
--  * La reserva se atribuye a tenants.fk_usuario_web, no a un id del payload.
--  * Los errores de negocio (RAISE EXCEPTION) se devuelven tal cual; cualquier
--    otro error se registra en el log del servidor y el visitante recibe un
--    mensaje generico, sin SQLERRM.
create or replace function public.fn_registrar_reserva_landing(p_slug text, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c_max_habitaciones constant integer := 10;   -- por reserva
  c_max_noches       constant integer := 90;
  c_max_huespedes    constant integer := 10;   -- por habitacion
  c_max_anticipo     constant integer := 365;  -- dias hacia adelante
  c_max_web_hora     constant integer := 60;   -- reservas web por tenant y por hora
  c_max_pend_cliente constant integer := 3;    -- pendientes web por cliente
  c_zona             constant text := 'America/Asuncion';

  v_hoy              date;
  v_obs              text;
  v_capacidad        integer;
  v_adultos          integer;
  v_ninos            integer;
  v_cliente_existia  boolean := false;
  v_n                bigint;

  v_tenant           bigint;
  v_fk_usuario_web   bigint;

  v_id_cliente       bigint;
  v_id_reserva       bigint;
  v_id_detalle       bigint;
  v_id_habitacion    bigint;
  v_codigo_reserva   text;

  v_cliente_json     jsonb;
  v_detalle          jsonb;
  v_huesped          jsonb;
  v_detalles         jsonb;

  v_fecha_entrada    date;
  v_fecha_salida     date;
  v_noches           integer;
  v_fk_tipo_habitacion bigint;
  v_doc_cliente      text;

  v_fk_tarifa        bigint;
  v_precio_unitario  numeric;
  v_subtotal         numeric;
  v_total_estimado   numeric := 0;
begin
  select t.id, t.fk_usuario_web
  into v_tenant, v_fk_usuario_web
  from public.tenants t
  where t.slug = lower(trim(p_slug))
    and t.estado in ('trial', 'activo');

  if v_tenant is null then
    return jsonb_build_object(
      'success', false,
      'error_message', 'El hotel no está disponible para reservas.',
      'error_code', 'tenant_no_disponible');
  end if;

  if v_fk_usuario_web is null then
    return jsonb_build_object(
      'success', false,
      'error_message', 'Las reservas web no están habilitadas para este hotel.',
      'error_code', 'reservas_web_no_configuradas');
  end if;

  -- 1. Fechas ----------------------------------------------------------------
  v_fecha_entrada := (p_payload ->> 'fecha_entrada')::date;
  v_fecha_salida  := (p_payload ->> 'fecha_salida')::date;

  if v_fecha_entrada is null or v_fecha_salida is null then
    raise exception 'Faltan las fechas de entrada o salida.';
  end if;

  if v_fecha_entrada >= v_fecha_salida then
    raise exception 'Consistencia de fechas inválida: Entrada debe ser anterior a Salida.';
  end if;

  -- "Hoy" es el del hotel, no el del servidor (UTC): de noche en Paraguay ya es
  -- manana en UTC y se rechazarian reservas validas para hoy.
  v_hoy := (now() at time zone c_zona)::date;

  if v_fecha_entrada < v_hoy then
    raise exception 'La fecha de entrada no puede ser anterior a hoy.';
  end if;

  if v_fecha_entrada > v_hoy + c_max_anticipo then
    raise exception 'Solo se aceptan reservas con hasta % días de anticipación.', c_max_anticipo;
  end if;

  v_noches := v_fecha_salida - v_fecha_entrada;

  if v_noches > c_max_noches then
    raise exception 'La estadía máxima para reservas web es de % noches.', c_max_noches;
  end if;

  -- 2. Detalles: al menos una habitacion, con tope ---------------------------
  v_detalles := p_payload -> 'detalles';

  if v_detalles is null
     or jsonb_typeof(v_detalles) <> 'array'
     or jsonb_array_length(v_detalles) = 0 then
    raise exception 'La reserva debe incluir al menos una habitación.';
  end if;

  if jsonb_array_length(v_detalles) > c_max_habitaciones then
    raise exception 'Una reserva web admite hasta % habitaciones.', c_max_habitaciones;
  end if;

  -- 3. Datos del cliente: obligatorios y con largo acotado ---------------------
  v_cliente_json := p_payload -> 'cliente';
  v_doc_cliente  := nullif(trim(v_cliente_json ->> 'documento'), '');

  if v_doc_cliente is null then
    raise exception 'El documento del cliente es obligatorio.';
  end if;

  if coalesce(length(v_cliente_json ->> 'razon_social'), 0) > 200
     or coalesce(length(v_cliente_json ->> 'nombre_fantasia'), 0) > 200
     or length(v_doc_cliente) > 40
     or coalesce(length(v_cliente_json ->> 'telefono'), 0) > 40
     or coalesce(length(v_cliente_json ->> 'celular'), 0) > 40
     or coalesce(length(v_cliente_json ->> 'direccion'), 0) > 300
     or coalesce(length(v_cliente_json ->> 'email'), 0) > 200
     or coalesce(length(p_payload ->> 'observaciones'), 0) > 1000 then
    raise exception 'Alguno de los datos supera el largo permitido.';
  end if;

  -- 4. Seccion critica por tenant: espera hasta 3 s, no indefinidamente --------
  perform set_config('lock_timeout', '3000', true);
  perform pg_advisory_xact_lock(hashtextextended('fn_registrar_reserva_landing:' || v_tenant::text, 0));

  -- Tope de solicitudes web por hora para el hotel: sin captcha ni rate limit
  -- en la base, esto acota cuanto inventario puede bloquear un abuso.
  select count(*) into v_n
  from public.reservas r
  where r.tenant_id = v_tenant
    and r.origen = 'WEB'
    and r.created_at > now() - interval '1 hour';

  if v_n >= c_max_web_hora then
    raise exception 'Hay demasiadas solicitudes de reserva en este momento. Intente más tarde.';
  end if;

  select c.id_cliente into v_id_cliente
  from public.clientes c
  where c.tenant_id = v_tenant
    and c.documento = v_doc_cliente
  limit 1;

  if v_id_cliente is null then
    insert into public.clientes (
      tenant_id, razon_social, nombre_fantasia, documento, telefono, celular,
      direccion, es_proveedor_del_estado, email, nro_casa, fk_tipo_operacion,
      estado_cliente, fk_tipo_documento, fk_barrios, fk_tipo_contribuyente
    ) values (
      v_tenant,
      v_cliente_json ->> 'razon_social',
      v_cliente_json ->> 'nombre_fantasia',
      v_doc_cliente,
      v_cliente_json ->> 'telefono',
      v_cliente_json ->> 'celular',
      v_cliente_json ->> 'direccion',
      coalesce((v_cliente_json ->> 'es_proveedor_del_estado')::boolean, false),
      v_cliente_json ->> 'email',
      coalesce((v_cliente_json ->> 'nro_casa')::bigint, 0),
      (v_cliente_json ->> 'fk_tipo_operacion')::bigint,
      'Activo',
      (v_cliente_json ->> 'fk_tipo_documento')::bigint,
      (v_cliente_json ->> 'fk_barrios')::bigint,
      (v_cliente_json ->> 'fk_tipo_contribuyente')::bigint
    ) returning id_cliente into v_id_cliente;
  else
    -- Quien reserva es anonimo y solo tuvo que acertar un documento: un cliente
    -- existente se reutiliza pero NUNCA se modifica desde aqui (ni siquiera para
    -- completar datos vacios) y no se devuelve su id: ni se pisa su contacto ni
    -- se revela si el documento ya estaba registrado.
    v_cliente_existia := true;

    select count(*) into v_n
    from public.reservas r
    where r.tenant_id = v_tenant
      and r.fk_cliente = v_id_cliente
      and r.origen = 'WEB'
      and lower(trim(r.estado)) = 'pendiente';

    if v_n >= c_max_pend_cliente then
      raise exception 'Ya tiene reservas pendientes de confirmación. Comuníquese con el hotel.';
    end if;
  end if;

  -- El contacto que dio el visitante para ESTA reserva queda en las
  -- observaciones: el hotel lo ve aunque el cliente ya existiera con otros datos.
  v_obs := nullif(trim(coalesce(p_payload ->> 'observaciones', '')), '');
  if v_cliente_existia then
    v_obs := concat_ws(E'\n', v_obs,
      '[Contacto web] celular: ' || coalesce(nullif(v_cliente_json ->> 'celular', ''), '-')
      || ' | email: ' || coalesce(nullif(v_cliente_json ->> 'email', ''), '-'));
  end if;

  -- 5. Cabecera de la reserva ---------------------------------------------------
  -- `total_estimado` arranca en 0 y se completa con la suma recalculada;
  -- `codigo_reserva` lo genera el trigger.
  insert into public.reservas (
    tenant_id, fecha_entrada, fecha_salida, estado,
    fk_cliente, fk_usuario, origen, observaciones, total_estimado
  ) values (
    v_tenant,
    v_fecha_entrada,
    v_fecha_salida,
    'Pendiente',
    v_id_cliente,
    v_fk_usuario_web,
    'WEB',
    v_obs,
    0
  ) returning id_reserva, codigo_reserva into v_id_reserva, v_codigo_reserva;

  -- 6. Habitaciones --------------------------------------------------------------
  for v_detalle in select * from jsonb_array_elements(v_detalles)
  loop
    v_fk_tipo_habitacion := (v_detalle ->> 'fk_tipo_habitacion')::bigint;

    if v_fk_tipo_habitacion is null then
      raise exception 'Cada habitación debe indicar su tipo.';
    end if;

    -- El tipo debe ser del hotel, y los huespedes no pueden superar su capacidad.
    select th.capacidad into v_capacidad
    from public.tipo_habitacion th
    where th.tenant_id = v_tenant
      and th.id = v_fk_tipo_habitacion;

    if v_capacidad is null then
      raise exception 'Tipo de habitación inválido.';
    end if;

    v_adultos := greatest(coalesce((v_detalle ->> 'cantidad_adultos')::integer, 1), 1);
    v_ninos   := greatest(coalesce((v_detalle ->> 'cantidad_ninos')::integer, 0), 0);

    if v_adultos + v_ninos > greatest(v_capacidad, 1) then
      raise exception 'La cantidad de huéspedes supera la capacidad del tipo de habitación.';
    end if;

    if jsonb_typeof(v_detalle -> 'huespedes') = 'array'
       and jsonb_array_length(v_detalle -> 'huespedes') > c_max_huespedes then
      raise exception 'Se admiten hasta % huéspedes registrados por habitación.', c_max_huespedes;
    end if;

    -- 6.a Precio desde `tarifas` del tenant: tarifa activa y vigente a la fecha
    --     de entrada; desempate por inicio mas reciente y luego id mas alto.
    select t.id, t.precio_base
    into v_fk_tarifa, v_precio_unitario
    from public.tarifas t
    where t.tenant_id = v_tenant
      and t.fk_tipo_habitacion = v_fk_tipo_habitacion
      and lower(trim(t.estado)) = 'activa'
      and t.fecha_inicio <= v_fecha_entrada
      and (t.fecha_fin is null or v_fecha_entrada <= t.fecha_fin)
    order by t.fecha_inicio desc, t.id desc
    limit 1;

    if v_fk_tarifa is null then
      raise exception 'No hay tarifa activa para el tipo de habitación % en la fecha %.',
        v_fk_tipo_habitacion, v_fecha_entrada;
    end if;

    v_subtotal := v_precio_unitario * v_noches;
    v_total_estimado := v_total_estimado + v_subtotal;

    -- 6.b Unidad fisica libre: sin bloqueo en el rango y sin reserva que lo
    --     solape en estado bloqueante.
    select h.id into v_id_habitacion
    from public.habitaciones h
    where h.tenant_id = v_tenant
      and h.fk_tipo_habitacion = v_fk_tipo_habitacion
      and not exists (
        select 1 from public.bloqueos_habitacion bh
        where bh.tenant_id = v_tenant
          and bh.fk_habitacion = h.id
          and bh.fecha_inicio <= v_fecha_salida
          and (bh.fecha_fin is null or bh.fecha_fin >= v_fecha_entrada)
      )
      and not exists (
        select 1
        from public.detalle_reservas dr
        join public.reservas r
          on r.tenant_id = dr.tenant_id and r.id_reserva = dr.fk_reserva
        where dr.tenant_id = v_tenant
          and dr.fk_habitacion = h.id
          and lower(trim(dr.estado)) = 'activo'
          and lower(trim(r.estado)) in ('pendiente', 'confirmada', 'check-in')
          and r.fecha_entrada < v_fecha_salida
          and r.fecha_salida > v_fecha_entrada
      )
    order by h.id
    limit 1;

    if v_id_habitacion is null then
      raise exception
        'Sobrecupo: No hay unidades físicas disponibles para el Tipo de Habitación ID % en las fechas seleccionadas.',
        v_fk_tipo_habitacion;
    end if;

    insert into public.detalle_reservas (
      tenant_id, fk_reserva, fk_habitacion, fk_tarifa, cantidad_adultos,
      cantidad_ninos, precio_unitario, subtotal, estado
    ) values (
      v_tenant,
      v_id_reserva,
      v_id_habitacion,
      v_fk_tarifa,
      v_adultos,
      v_ninos,
      v_precio_unitario,
      v_subtotal,
      'Activo'
    ) returning id_detalle into v_id_detalle;


    -- 6.c Huespedes de esta habitacion
    if jsonb_typeof(v_detalle -> 'huespedes') = 'array' then
      for v_huesped in select * from jsonb_array_elements(v_detalle -> 'huespedes')
      loop
        if coalesce(length(v_huesped ->> 'nombre_completo'), 0) > 200
           or coalesce(length(v_huesped ->> 'documento'), 0) > 40
           or coalesce(length(v_huesped ->> 'nacionalidad'), 0) > 80 then
          raise exception 'Alguno de los datos de los huéspedes supera el largo permitido.';
        end if;

        insert into public.huespedes_reserva (
          tenant_id, fk_detalle_reserva, nombre_completo, documento,
          fk_tipo_documento, nacionalidad, es_titular
        ) values (
          v_tenant,
          v_id_detalle,
          v_huesped ->> 'nombre_completo',
          v_huesped ->> 'documento',
          (v_huesped ->> 'fk_tipo_documento')::bigint,
          v_huesped ->> 'nacionalidad',
          coalesce((v_huesped ->> 'es_titular')::boolean, false)
        );
      end loop;
    end if;
  end loop;

  -- 7. Total real, calculado en el servidor ---------------------------------------
  update public.reservas
  set total_estimado = v_total_estimado
  where tenant_id = v_tenant
    and id_reserva = v_id_reserva;

  return jsonb_build_object(
    'success', true,
    'message', 'Reserva registrada exitosamente en estado Pendiente.',
    'id_reserva', v_id_reserva,
    'codigo_reserva', v_codigo_reserva,
    'total_estimado', v_total_estimado
  );

exception
  -- Al capturar aqui se revierte todo lo escrito en el bloque: no quedan
  -- reservas a medias.
  when lock_not_available then
    return jsonb_build_object(
      'success', false,
      'error_message', 'El sistema está procesando otras reservas. Intente nuevamente en unos segundos.',
      'error_code', 'ocupado');
  when raise_exception then
    return jsonb_build_object(
      'success', false,
      'error_message', sqlerrm,
      'error_code', sqlstate);
  when others then
    raise warning 'fn_registrar_reserva_landing (tenant %): % [%]', v_tenant, sqlerrm, sqlstate;
    return jsonb_build_object(
      'success', false,
      'error_message', 'No se pudo registrar la reserva. Intente nuevamente en unos minutos.',
      'error_code', 'error_interno');
end;
$$;
