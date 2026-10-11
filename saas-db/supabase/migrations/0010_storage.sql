-- ═══════════════════════════════════════════════════════════════════════════
-- 0010 · Storage de imagenes
-- ═══════════════════════════════════════════════════════════════════════════
-- Convencion de ruta: {tenant_id}/{id_del_dueno}/{archivo}. El primer segmento
-- es el tenant y es lo que validan las policies de escritura; sin el no se
-- puede subir, reemplazar ni borrar nada.
--
-- Los buckets son publicos (la landing muestra las fotos por URL directa, que
-- no pasa por RLS), pero listar objetos y modificarlos si exige las policies
-- de abajo. En `ruta_storage` conviene guardar la ruta relativa
-- ({tenant_id}/...) y no la URL completa.
-- ═══════════════════════════════════════════════════════════════════════════

-- Tope de 5 MB y solo imagenes: los buckets son publicos y compartidos entre
-- todos los tenants, asi que sin limites uno solo podria llenarlos o alojar
-- archivos arbitrarios.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('habitaciones', 'habitaciones', true, 5242880,
   array['image/jpeg', 'image/png', 'image/webp', 'image/avif']),
  ('tipo_habitaciones', 'tipo_habitaciones', true, 5242880,
   array['image/jpeg', 'image/png', 'image/webp', 'image/avif'])
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy imagenes_tenant_select on storage.objects
  for select to authenticated
  using (
    bucket_id in ('habitaciones', 'tipo_habitaciones')
    and (storage.foldername(name))[1] = (select public.current_tenant_id())::text
    and (select public.current_usuario_activo())
  );

create policy imagenes_tenant_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id in ('habitaciones', 'tipo_habitaciones')
    and (storage.foldername(name))[1] = (select public.current_tenant_id())::text
    and (select public.current_usuario_activo())
    and (select public.current_puede_operar())
  );

create policy imagenes_tenant_update on storage.objects
  for update to authenticated
  using (
    bucket_id in ('habitaciones', 'tipo_habitaciones')
    and (storage.foldername(name))[1] = (select public.current_tenant_id())::text
    and (select public.current_usuario_activo())
    and (select public.current_puede_operar())
  )
  with check (
    bucket_id in ('habitaciones', 'tipo_habitaciones')
    and (storage.foldername(name))[1] = (select public.current_tenant_id())::text
    and (select public.current_usuario_activo())
    and (select public.current_puede_operar())
  );

create policy imagenes_tenant_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id in ('habitaciones', 'tipo_habitaciones')
    and (storage.foldername(name))[1] = (select public.current_tenant_id())::text
    and (select public.current_usuario_activo())
    and (select public.current_puede_operar())
  );
