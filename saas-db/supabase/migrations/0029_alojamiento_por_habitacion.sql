-- ═══════════════════════════════════════════════════════════════════════════
-- 0029 · Alojamiento automatico por habitacion
-- ═══════════════════════════════════════════════════════════════════════════
-- El primer check-in (fn_estancia_con_recargo, 0022) cargaba un solo concepto
-- 'Alojamiento' con la suma de todas las habitaciones. Desde 0028 cada cargo
-- puede atribuirse a una habitacion (cargos_folio.fk_detalle_reserva): ahora se
-- carga un 'Alojamiento' por habitacion activa, con su subtotal y las noches de
-- la estancia. El total del folio no cambia; el recargo horario sigue siendo un
-- cargo general (fk_detalle_reserva NULL). Solo cambia el bloque de alojamiento:
-- el resto de la funcion es identico a 0022.
--
-- CREATE OR REPLACE dispara la guarda DDL de 0012 (revoca EXECUTE de la funcion
-- recreada), por eso los privilegios se repiten al final.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Check-out / check-in with surcharge: shared implementation ──────────────
-- Public entry points are checkout_con_recargo / checkin_con_recargo below;
-- this function holds the whole transaction. It validates everything itself
-- (authorization, estado, reason), so calling it directly is no looser than
-- calling the wrappers. SECURITY INVOKER: RLS enforces the tenant boundary.
--
-- Order matters: the surcharge row is inserted BEFORE the estado update,
-- because trg_cerrar_folios_checkout (0005) closes the open folio the moment
-- the estado becomes Check-out.
--
-- Check-in and the folio: the frontend used to create the folio and the
-- automatic 'Alojamiento' charge AFTER the estado change, in separate calls.
-- To attach an early check-in surcharge atomically a folio must exist, so when
-- the reservation has NO folio yet this function creates it (estado 'abierto')
-- and posts the 'Alojamiento' charges: one per active room (quantity = nights,
-- amount = the room subtotal, fk_detalle_reserva = that room, 0028). The
-- caller must therefore NOT create the folio / Alojamiento itself after
-- calling checkin_con_recargo; `folio_creado` in the result says whether it
-- happened.
--
-- p_monto: the final amount chosen by reception; NULL = accept the suggestion.
-- p_motivo is mandatory when the surcharge is exonerated or the amount differs
-- from the suggestion. Decimals are rounded to whole Gs.
--
-- Result (jsonb): id_reserva, estado, tipo, accion, minutos_exceso,
-- monto_sugerido, monto_final, id_folio, id_cargo, folio_creado.
-- `accion`: NINGUNO (nothing charged, nothing suggested) | APLICADO |
-- MODIFICADO | EXONERADO. Each non-NINGUNO action writes a historial_estancia
-- row of tipo_movimiento RECARGO_<accion> (actor, suggested, final, reason).
create or replace function public.fn_estancia_con_recargo(
  p_reserva  bigint,
  p_tipo     text,
  p_monto    numeric default null,
  p_motivo   text    default null,
  p_exonerar boolean default false
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_tipo         text := upper(trim(p_tipo));
  v_usuario      bigint;
  v_res          public.reservas%rowtype;
  v_calc         record;
  v_sug          numeric;
  v_final        numeric;
  v_motivo       text := nullif(trim(p_motivo), '');
  v_accion       text;
  v_etiqueta     text;
  v_nuevo_estado text;
  v_folio        bigint;
  v_folio_estado text;
  v_folio_nuevo  boolean := false;
  v_concepto     bigint;
  v_cargo        bigint;
  v_aloj_monto   numeric;
  v_det          record;
  v_aloj_cant    integer;
  v_c_aloj       bigint;
  v_actualizadas integer;
begin
  if v_tipo is null or v_tipo not in ('LATE_CHECKOUT', 'EARLY_CHECKIN') then
    raise exception 'Tipo de recargo invalido: % (usar LATE_CHECKOUT o EARLY_CHECKIN).', p_tipo
      using errcode = '22023';
  end if;

  if not public.current_usuario_activo() or not public.current_puede_operar() then
    raise exception 'No autorizado para operar check-in / check-out.' using errcode = '42501';
  end if;

  v_usuario := public.current_usuario_id();
  if v_usuario is null then
    raise exception 'No se pudo resolver el usuario actual.' using errcode = '42501';
  end if;

  if p_monto is not null and p_monto < 0 then
    raise exception 'El monto del recargo no puede ser negativo.' using errcode = '22023';
  end if;

  -- Row lock: two receptionists cannot check the same reservation out twice.
  select * into v_res
  from public.reservas r
  where r.id_reserva = p_reserva
  for update;

  if not found then
    raise exception 'Reserva no encontrada.' using errcode = 'P0002';
  end if;

  if v_tipo = 'LATE_CHECKOUT' then
    if lower(trim(v_res.estado)) <> 'check-in' then
      raise exception 'Solo se puede hacer check-out de una reserva en Check-in (estado actual: %).', v_res.estado
        using errcode = '55000';
    end if;
    v_etiqueta := 'Late check-out';
    v_nuevo_estado := 'Check-out';
  else
    if lower(trim(v_res.estado)) not in ('pendiente', 'confirmada') then
      raise exception 'Solo se puede hacer check-in de una reserva Pendiente o Confirmada (estado actual: %).', v_res.estado
        using errcode = '55000';
    end if;
    if not exists (
      select 1 from public.detalle_reservas d
      where d.tenant_id = v_res.tenant_id
        and d.fk_reserva = p_reserva
        and lower(trim(d.estado)) = 'activo'
    ) then
      raise exception 'No se puede hacer check-in sin habitaciones cargadas.' using errcode = '55000';
    end if;
    v_etiqueta := 'Early check-in';
    v_nuevo_estado := 'Check-in';
  end if;

  select * into v_calc from public.calcular_recargo_horario(p_reserva, v_tipo, now());
  v_sug := v_calc.monto_sugerido;

  if p_exonerar then
    v_final := 0;
  else
    v_final := round(coalesce(p_monto, v_sug));
  end if;

  v_accion := case
    when p_exonerar or (v_final = 0 and v_sug > 0) then 'EXONERADO'
    when v_final <> v_sug                           then 'MODIFICADO'
    when v_final > 0                                then 'APLICADO'
    else 'NINGUNO'
  end;

  if (p_exonerar or v_final <> v_sug) and v_motivo is null then
    raise exception 'Se requiere un motivo para % el recargo de % (sugerido: % Gs).',
      case when p_exonerar then 'exonerar' else 'modificar' end, v_etiqueta, v_sug::bigint
      using errcode = '22023';
  end if;

  -- Folio: the open one of the reservation. Check-in always ensures one exists;
  -- check-out only needs it when there is something to charge.
  select f.id_folio, lower(trim(f.estado))
  into v_folio, v_folio_estado
  from public.folios f
  where f.tenant_id = v_res.tenant_id
    and f.fk_reserva = p_reserva
  order by (lower(trim(f.estado)) = 'abierto') desc, f.id_folio desc
  limit 1
  for update;

  if v_folio is null and (v_tipo = 'EARLY_CHECKIN' or v_final > 0) then
    insert into public.folios (tenant_id, fk_reserva, estado, total_acumulado)
    values (v_res.tenant_id, p_reserva, 'abierto', 0)
    returning id_folio into v_folio;
    v_folio_estado := 'abierto';
    v_folio_nuevo := true;
  elsif v_folio is not null and v_final > 0 and v_folio_estado <> 'abierto' then
    raise exception 'El folio de la reserva esta cerrado: no se puede cargar el recargo.'
      using errcode = '55000';
  end if;

  -- First check-in: post the automatic accommodation charges, as the frontend did,
  -- but one per active room so each charge carries its fk_detalle_reserva.
  -- The folio total grows by the sum, i.e. the same amount as the old aggregate.
  if v_folio_nuevo and v_tipo = 'EARLY_CHECKIN' then
    v_aloj_cant := greatest(1, greatest(v_res.fecha_salida - v_res.fecha_entrada, 0));
    v_aloj_monto := 0;

    for v_det in
      select d.id_detalle, d.subtotal
      from public.detalle_reservas d
      where d.tenant_id = v_res.tenant_id
        and d.fk_reserva = p_reserva
        and lower(trim(d.estado)) = 'activo'
        and d.subtotal > 0
      order by d.id_detalle
    loop
      v_c_aloj := coalesce(
        v_c_aloj,
        public.fn_concepto_por_nombre(
          v_res.tenant_id, 'Alojamiento', 'Cargo automático por noches de estadía'));

      insert into public.cargos_folio
        (tenant_id, fk_folio, fk_concepto, cantidad, monto_unitario, monto_total, fk_usuario, estado,
         fk_detalle_reserva)
      values
        (v_res.tenant_id, v_folio, v_c_aloj, v_aloj_cant, v_det.subtotal / v_aloj_cant, v_det.subtotal,
         v_usuario, 'ACTIVO', v_det.id_detalle);

      v_aloj_monto := v_aloj_monto + v_det.subtotal;
    end loop;

    if v_aloj_monto > 0 then
      update public.folios
      set total_acumulado = total_acumulado + v_aloj_monto
      where id_folio = v_folio and tenant_id = v_res.tenant_id;
    end if;
  end if;

  -- The surcharge itself.
  if v_final > 0 then
    v_concepto := coalesce(
      v_calc.concepto_id,
      public.fn_concepto_por_nombre(
        v_res.tenant_id, v_etiqueta,
        case v_tipo when 'LATE_CHECKOUT' then 'Recargo por salida tardía (late check-out)'
                    else 'Recargo por ingreso anticipado (early check-in)' end));

    insert into public.cargos_folio
      (tenant_id, fk_folio, fk_concepto, cantidad, monto_unitario, monto_total, fk_usuario, estado)
    values
      (v_res.tenant_id, v_folio, v_concepto, 1, v_final, v_final, v_usuario, 'ACTIVO')
    returning id_cargo into v_cargo;

    update public.folios
    set total_acumulado = total_acumulado + v_final
    where id_folio = v_folio and tenant_id = v_res.tenant_id;
  end if;

  if v_accion <> 'NINGUNO' then
    insert into public.historial_estancia
      (tenant_id, fk_reserva, tipo_movimiento, descripcion, fk_usuario)
    values
      (v_res.tenant_id, p_reserva, 'RECARGO_' || v_accion,
       format('%s: sugerido %s Gs, final %s Gs (%s min de exceso, metodo %s). Motivo: %s',
              v_etiqueta, v_sug::bigint, v_final::bigint, v_calc.minutos_exceso, v_calc.metodo,
              coalesce(v_motivo, '-')),
       v_usuario);
  end if;

  -- Last: the estado change fires the 0005 triggers (history, folio closing)
  -- and the real-timestamp trigger of this migration.
  update public.reservas
  set estado = v_nuevo_estado
  where id_reserva = p_reserva
    and tenant_id = v_res.tenant_id;
  get diagnostics v_actualizadas = row_count;

  if v_actualizadas <> 1 then
    raise exception 'No se pudo actualizar el estado de la reserva.' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'id_reserva',     p_reserva,
    'estado',         v_nuevo_estado,
    'tipo',           v_tipo,
    'accion',         v_accion,
    'minutos_exceso', v_calc.minutos_exceso,
    'monto_sugerido', v_sug,
    'monto_final',    v_final,
    'id_folio',       v_folio,
    'id_cargo',       v_cargo,
    'folio_creado',   v_folio_nuevo
  );
end;
$$;

-- ─── Privileges ──────────────────────────────────────────────────────────────
-- Same as 0022: the 0012 guard revokes on CREATE OR REPLACE, so grant again.
revoke execute on function public.fn_estancia_con_recargo(bigint, text, numeric, text, boolean) from public, anon, authenticated;
grant execute on function public.fn_estancia_con_recargo(bigint, text, numeric, text, boolean)  to authenticated;
