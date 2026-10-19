-- ═══════════════════════════════════════════════════════════════════════════
-- 0028 · Cargos del folio atribuidos a la habitacion
-- ═══════════════════════════════════════════════════════════════════════════
-- Una reserva puede tener varias habitaciones (detalle_reservas) pero un solo
-- folio. `cargos_folio.fk_detalle_reserva` dice a que habitacion pertenece cada
-- cargo; NULL = cargo general de la reserva (p. ej. recargo horario) o cargo
-- historico agregado de una reserva con varias habitaciones.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.cargos_folio
  add column fk_detalle_reserva bigint;

alter table public.cargos_folio
  add constraint cargos_folio_fk_detalle_reserva_fkey
    foreign key (tenant_id, fk_detalle_reserva)
    references public.detalle_reservas (tenant_id, id_detalle);

create index cargos_folio_detalle_reserva_idx
  on public.cargos_folio (tenant_id, fk_detalle_reserva);

comment on column public.cargos_folio.fk_detalle_reserva is
  'Habitacion de la reserva a la que pertenece el cargo. Null = cargo general de la reserva o cargo historico agregado (reservas con varias habitaciones anteriores a 0028).';

-- Backfill: solo las reservas con exactamente una habitacion tienen atribucion
-- inequivoca. Las historicas con varias habitaciones quedan en NULL.
update public.cargos_folio c
set fk_detalle_reserva = d.id_detalle
from public.folios f
join public.detalle_reservas d
  on d.tenant_id = f.tenant_id
 and d.fk_reserva = f.fk_reserva
where c.tenant_id = f.tenant_id
  and c.fk_folio = f.id_folio
  and c.fk_detalle_reserva is null
  and (
    select count(*)
    from public.detalle_reservas x
    where x.tenant_id = f.tenant_id
      and x.fk_reserva = f.fk_reserva
  ) = 1;
