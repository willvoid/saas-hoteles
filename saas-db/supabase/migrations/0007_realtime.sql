-- ═══════════════════════════════════════════════════════════════════════════
-- 0007 · Realtime
-- ═══════════════════════════════════════════════════════════════════════════
-- Realtime aplica las policies de RLS de cada tabla al decidir a quien enviar
-- un evento: un usuario solo recibe eventos de filas que su policy le deja
-- leer, es decir, de su propio tenant.
-- ═══════════════════════════════════════════════════════════════════════════

do $$
declare
  t text;
begin
  foreach t in array array[
    'notificacion', 'estado_limpieza', 'bloqueos_habitacion',
    'usuario', 'folios', 'cargos_folio'
  ] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception
      when duplicate_object then null;
    end;
  end loop;
end;
$$;

-- Realtime necesita la fila completa en el payload para exponer `estado` al
-- cerrar la sesion de un usuario recien desactivado.
alter table public.usuario replica identity full;
