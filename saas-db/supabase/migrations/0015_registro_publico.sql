-- ═══════════════════════════════════════════════════════════════════════════
-- 0015 · Landing y registro publico
-- ═══════════════════════════════════════════════════════════════════════════
-- Soporte de base de datos para la landing (/) y el alta publica (/registro):
--
--   * fn_planes_publicos(): planes que se ofrecen, para mostrar precios sin
--     sesion. Solo expone datos comerciales (precios, topes, contabilidad); no
--     devuelve ningun dato de facturacion electronica ni los planes ocultos
--     (trial, plantilla).
--   * fn_catalogos_registro() y fn_ubicaciones_registro(): lectura publica y
--     acotada de los catalogos que el asistente de registro necesita para armar
--     el payload de fn_provision_tenant (tipo de documento, contribuyente,
--     regimen y la cadena departamento > distrito > ciudad > barrio). Las
--     tablas siguen cerradas para anon: 0006 solo las deja leer a usuarios
--     activos y 0011 le quita todo a anon. No se toca ninguna policy.
--   * registro_intentos + fn_registro_rate_limit(): limite de intentos de la
--     edge function register-tenant. Solo service_role puede usarlo.
--
-- Toda funcion nueva recibe su GRANT explicito: la guarda de 0012 revoca EXECUTE
-- a PUBLIC, anon y authenticated en cada CREATE FUNCTION.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Planes publicos ─────────────────────────────────────────────────────────
-- Un tope null significa ilimitado (mismo contrato que public.planes).
create or replace function public.fn_planes_publicos()
returns table (
  codigo           text,
  nombre           text,
  precio_mensual   numeric,
  precio_anual     numeric,
  moneda           text,
  max_habitaciones integer,
  max_usuarios     integer,
  max_hoteles      integer,
  mod_contabilidad boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select p.codigo, p.nombre, p.precio_mensual, p.precio_anual, p.moneda,
         p.max_habitaciones, p.max_usuarios, p.max_hoteles, p.mod_contabilidad
  from public.planes p
  where p.visible
  order by p.precio_mensual asc, p.orden asc, p.codigo asc;
$$;

comment on function public.fn_planes_publicos() is
  'Planes ofrecidos (visible = true) con precios y topes; null = ilimitado. Publica: no expone modulos de facturacion electronica ni planes ocultos.';

-- ─── Catalogos del asistente de registro ─────────────────────────────────────
-- Devuelve los catalogos chicos y el primer nivel de la geografia. Las llaves
-- son las que espera fn_provision_tenant:
--   tipos_documento  -> admin.fk_tipo_doc          (cod_tipodoc)
--   contribuyentes   -> empresa.fk_contribuyente   (id_tipo_contribuyente)
--   regimenes        -> empresa.fk_regimen         (id_regimen)
--   departamentos    -> primer nivel hasta fk_barrio (cod_depto)
create or replace function public.fn_catalogos_registro()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'tipos_documento', coalesce((
      select jsonb_agg(jsonb_build_object('id', d.cod_tipodoc, 'descripcion', d.descripcion_tipodoc)
                       order by d.cod_tipodoc)
      from public.tipo_documento d), '[]'::jsonb),
    'contribuyentes', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id_tipo_contribuyente, 'descripcion', c.descripcion)
                       order by c.id_tipo_contribuyente)
      from public.tipo_contribuyente c), '[]'::jsonb),
    'regimenes', coalesce((
      select jsonb_agg(jsonb_build_object('id', r.id_regimen, 'descripcion', r.descripcion)
                       order by r.id_regimen)
      from public.tipo_regimen r), '[]'::jsonb),
    'departamentos', coalesce((
      select jsonb_agg(jsonb_build_object('id', x.cod_depto, 'nombre', x.nombre_depto)
                       order by x.nombre_depto, x.cod_depto)
      from public.departamentos x), '[]'::jsonb)
  );
$$;

comment on function public.fn_catalogos_registro() is
  'Catalogos publicos para el registro: tipos de documento, contribuyentes, regimenes y departamentos ({id, descripcion|nombre}).';

-- Hijos de un nodo de la geografia. p_nivel indica que se pide:
--   'distritos' (p_padre = cod_depto), 'ciudades' (p_padre = cod_distrito),
--   'barrios' (p_padre = cod_ciudades). Devuelve [{id, nombre}] ordenado por
-- nombre. Un nivel invalido se rechaza (22023); un padre sin hijos da [].
create or replace function public.fn_ubicaciones_registro(p_nivel text, p_padre bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_res jsonb;
begin
  if p_padre is null then
    raise exception 'p_padre es obligatorio' using errcode = '22023';
  end if;

  if p_nivel = 'distritos' then
    select coalesce(jsonb_agg(jsonb_build_object('id', x.cod_distrito, 'nombre', x.nombre_distrito)
                              order by x.nombre_distrito, x.cod_distrito), '[]'::jsonb)
      into v_res from public.distritos x where x.fk_depto = p_padre;
  elsif p_nivel = 'ciudades' then
    select coalesce(jsonb_agg(jsonb_build_object('id', x.cod_ciudades, 'nombre', x.nombre_ciudad)
                              order by x.nombre_ciudad, x.cod_ciudades), '[]'::jsonb)
      into v_res from public.ciudades x where x.fk_distrito = p_padre;
  elsif p_nivel = 'barrios' then
    select coalesce(jsonb_agg(jsonb_build_object('id', x.cod_barrio, 'nombre', x.nombre_barrio)
                              order by x.nombre_barrio, x.cod_barrio), '[]'::jsonb)
      into v_res from public.barrios x where x.fk_ciudad = p_padre;
  else
    raise exception 'p_nivel invalido: %', p_nivel using errcode = '22023';
  end if;

  return v_res;
end;
$$;

comment on function public.fn_ubicaciones_registro(text, bigint) is
  'Hijos publicos de un nodo geografico (distritos de un departamento, ciudades de un distrito, barrios de una ciudad) como [{id, nombre}].';

-- ─── Rate limit del registro ─────────────────────────────────────────────────
-- Solo la usa la edge function (service_role). La tabla guarda un hash de la
-- clave (IP, correo...), nunca el valor en claro.
create table public.registro_intentos (
  id         bigint generated always as identity primary key,
  clave_hash text        not null,
  created_at timestamptz not null default now()
);

create index registro_intentos_clave_idx on public.registro_intentos (clave_hash, created_at);
create index registro_intentos_fecha_idx on public.registro_intentos (created_at);

comment on table public.registro_intentos is
  'Intentos de registro por clave hasheada. RLS sin policies: solo fn_registro_rate_limit (service_role) la usa.';

-- Registra un intento de p_key y devuelve true si sigue dentro del limite
-- (como maximo p_max intentos en la ventana p_window, contando este) o false si
-- lo supero. Los intentos rechazados tambien se registran. Cada llamada borra,
-- de forma acotada (500 filas), los renglones con mas de max(p_window, 1 dia):
-- una ventana mayor a un dia llamada con otra clave podria perder historia.
create or replace function public.fn_registro_rate_limit(p_key text, p_max integer, p_window interval)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hash  text;
  v_total integer;
begin
  if p_key is null or length(trim(p_key)) = 0 then
    raise exception 'p_key es obligatorio' using errcode = '22023';
  end if;
  if p_max is null or p_max < 1 then
    raise exception 'p_max debe ser >= 1' using errcode = '22023';
  end if;
  if p_window is null or p_window <= interval '0' then
    raise exception 'p_window debe ser positivo' using errcode = '22023';
  end if;

  v_hash := encode(sha256(convert_to(p_key, 'UTF8')), 'hex');

  -- Serializa las llamadas de la misma clave para que el conteo no se cuele.
  perform pg_advisory_xact_lock(hashtextextended(v_hash, 0));

  delete from public.registro_intentos
  where ctid in (
    select r.ctid from public.registro_intentos r
    where r.created_at < now() - greatest(p_window, interval '1 day')
    limit 500
  );

  insert into public.registro_intentos (clave_hash) values (v_hash);

  select count(*) into v_total
  from public.registro_intentos r
  where r.clave_hash = v_hash and r.created_at > now() - p_window;

  return v_total <= p_max;
end;
$$;

comment on function public.fn_registro_rate_limit(text, integer, interval) is
  'Registra un intento y devuelve false si la clave supero p_max intentos en p_window. Solo service_role.';

-- ─── Privilegios ─────────────────────────────────────────────────────────────
-- La guarda de 0012 ya dejo la tabla y las funciones sin acceso para anon y
-- authenticated; se repite el revoke por si el event trigger no existe.
revoke all on public.registro_intentos from anon, authenticated;
grant select, insert, delete on public.registro_intentos to service_role;

revoke execute on function public.fn_registro_rate_limit(text, integer, interval) from public, anon, authenticated;

grant execute on function public.fn_planes_publicos()                  to anon, authenticated;
grant execute on function public.fn_catalogos_registro()               to anon, authenticated;
grant execute on function public.fn_ubicaciones_registro(text, bigint) to anon, authenticated;
grant execute on function public.fn_registro_rate_limit(text, integer, interval) to service_role;
