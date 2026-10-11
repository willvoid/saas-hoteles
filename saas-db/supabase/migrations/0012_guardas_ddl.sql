-- ═══════════════════════════════════════════════════════════════════════════
-- 0012 · Guardas de DDL
-- ═══════════════════════════════════════════════════════════════════════════
-- Evita que una migracion futura abra un hueco sin querer:
--
--   * Toda tabla nueva de `public` nace con RLS habilitada, sin acceso para
--     anon y sin TRUNCATE/REFERENCES/TRIGGER para authenticated. Sin policies
--     una tabla con RLS no deja pasar a nadie: hay que escribirlas.
--   * Toda funcion nueva de `public` nace sin EXECUTE para PUBLIC, anon y
--     authenticated. Postgres concede EXECUTE a PUBLIC por defecto, y los
--     privilegios por defecto de Supabase lo suman a anon y authenticated.
--
-- Consecuencia a tener presente: al crear o reemplazar una funcion hay que
-- volver a hacer su `grant execute` (CREATE OR REPLACE dispara la guarda).
-- Se ignoran los objetos que crea una extension.
--
-- Los event triggers requieren privilegios altos. Si el rol que aplica la
-- migracion no puede crearlo, se emite un WARNING y la migracion sigue: en ese
-- caso la guarda no existe y hay que seguir la convencion a mano (README).
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.fn_guardas_ddl()
returns event_trigger
language plpgsql
as $$
declare
  r record;
begin
  for r in
    select object_type, schema_name, object_identity
    from pg_event_trigger_ddl_commands()
    where not in_extension
      and schema_name = 'public'
      and object_type in ('table', 'function')
  loop
    if r.object_type = 'table' then
      execute format('alter table %s enable row level security', r.object_identity);
      execute format('revoke all on %s from anon', r.object_identity);
      execute format('revoke truncate, references, trigger on %s from authenticated', r.object_identity);
    else
      execute format('revoke execute on function %s from public, anon, authenticated', r.object_identity);
    end if;
  end loop;
end;
$$;

do $$
begin
  create event trigger fn_guardas_ddl_trg
    on ddl_command_end
    when tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO', 'CREATE FUNCTION')
    execute function public.fn_guardas_ddl();
exception
  when others then
    raise warning 'No se pudo crear el event trigger de guardas DDL (%). Habilitar RLS y revocar EXECUTE a mano en cada objeto nuevo.', sqlerrm;
end;
$$;
