-- ═══════════════════════════════════════════════════════════════════════════
-- 0014 · Planes y suscripciones
-- ═══════════════════════════════════════════════════════════════════════════
-- Hasta 0013 `tenants.plan` era un texto libre y `trial_fin` solo informativo.
-- Esta migracion modela los planes (Basico, Pro, Business) con precios y topes,
-- y los aplica desde la base, no solo desde la interfaz:
--
--   * `planes` es el catalogo de planes: precios, topes (null = ilimitado) y
--     modulos habilitados. Lo leen los usuarios autenticados; solo la
--     plataforma lo modifica.
--   * La suscripcion es por hotel (por tenant): `tenants.plan`, `ciclo_facturacion`
--     y `vigente_hasta` (pagado hasta). Los cobros son manuales (transferencia):
--     un operador los registra con fn_activar_plan, que deja un renglon en
--     `pagos_suscripcion`. Quedan listas las columnas para una pasarela futura.
--   * Topes de altas: triggers BEFORE INSERT en `habitaciones` y `usuario`
--     rechazan el alta que superaria el tope del plan (SQLSTATE 23514).
--   * Vencimiento: un trial vencido o un plan sin pago vigente deja el hotel en
--     SOLO LECTURA. Se resuelve con policies RESTRICTIVE de escritura que
--     consultan fn_suscripcion_vigente(); se calcula por fecha, sin cron.
--   * Modulos: contabilidad y SIFEN son escritura bloqueada si el plan no los
--     incluye. Las lecturas no se tocan: un hotel que baja de plan conserva y
--     consulta sus datos.
--   * Hoteles por cuenta: fn_max_hoteles_cuenta() devuelve el tope mas alto
--     entre los hoteles que la cuenta administra (lo consume create-hotel).
--
-- Las funciones definer y los triggers del esquema (handle_new_user,
-- fn_provision_tenant, next_nro_secuencial...) saltan RLS y no se ven afectados
-- por las policies de vigencia.
--
-- Toda funcion nueva o redefinida aqui recibe su GRANT explicito: CREATE OR
-- REPLACE dispara la guarda de 0012, que revoca EXECUTE.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Catalogo de planes ──────────────────────────────────────────────────────
create table public.planes (
  codigo           text primary key check (codigo ~ '^[a-z][a-z0-9_]{1,19}$'),
  nombre           text not null check (length(trim(nombre)) > 0),
  precio_mensual   numeric not null default 0 check (precio_mensual >= 0),
  precio_anual     numeric not null default 0 check (precio_anual >= 0),
  moneda           text not null default 'PYG',
  max_habitaciones integer check (max_habitaciones > 0),
  max_usuarios     integer check (max_usuarios > 0),
  max_hoteles      integer check (max_hoteles > 0),
  mod_contabilidad boolean not null default false,
  mod_sifen        boolean not null default false,
  visible          boolean not null default true,
  orden            integer not null default 0
);

comment on table public.planes is
  'Catalogo de planes de suscripcion. Un tope null significa ilimitado. `visible` es false para los planes que no se ofrecen (trial, plantilla).';
comment on column public.planes.max_habitaciones is 'Habitaciones por hotel, de cualquier estado. null = ilimitado.';
comment on column public.planes.max_usuarios     is 'Perfiles de personal por hotel, de cualquier estado. null = ilimitado.';
comment on column public.planes.max_hoteles      is 'Hoteles que puede administrar una cuenta con este plan. null = ilimitado.';

-- Precios en guaranies; el anual equivale a 10 mensualidades (dos meses gratis).
-- El trial usa los topes y modulos de Pro para poder evaluar el producto, pero
-- con un solo hotel por cuenta para que no se encadenen hoteles de prueba.
insert into public.planes
  (codigo, nombre, precio_mensual, precio_anual,
   max_habitaciones, max_usuarios, max_hoteles, mod_contabilidad, mod_sifen, visible, orden)
values
  ('trial',     'Prueba gratuita',      0,       0,       60,   15,   1,    true,  true,  false, 0),
  ('basico',    'Basico',          150000, 1500000,       20,    3,   1,    false, false, true,  1),
  ('pro',       'Pro',             350000, 3500000,       60,   15,   5,    true,  true,  true,  2),
  ('business',  'Business',        800000, 8000000,     null, null, null,   true,  true,  true,  3),
  ('plantilla', 'Plantilla interna',    0,       0,     null, null, null,   true,  true,  false, 9);

alter table public.planes enable row level security;

-- Lectura abierta a los autenticados (la pantalla de planes los lista). Sin
-- policies de escritura: solo service_role o el operador modifican el catalogo.
create policy planes_select on public.planes
  for select to authenticated
  using (true);

revoke all on public.planes from anon;
revoke insert, update, delete, truncate, references, trigger on public.planes from authenticated;

-- ─── tenants: plan con integridad y vigencia del pago ───────────────────────
-- Cualquier plan desconocido pasa a 'trial'; 'plantilla' se conserva.
update public.tenants
set plan = 'trial'
where plan not in (select p.codigo from public.planes p);

alter table public.tenants
  add constraint tenants_plan_fkey foreign key (plan) references public.planes (codigo);

alter table public.tenants
  add column ciclo_facturacion text
    check (ciclo_facturacion in ('mensual', 'anual')),
  add column vigente_hasta date;

comment on column public.tenants.ciclo_facturacion is
  'Ciclo del ultimo pago registrado (mensual o anual). null mientras el hotel no haya pagado.';
comment on column public.tenants.vigente_hasta is
  'Ultimo dia cubierto por el pago. Con estado = activo, pasada esta fecha el hotel queda en solo lectura.';

-- Hoteles que ya existian: sin estas fechas quedarian en solo lectura al
-- aplicar la migracion. Un trial sin fecha de fin recibe 30 dias; un hotel
-- activo sin pago registrado recibe 30 dias de gracia para regularizarse.
update public.tenants
set trial_fin = current_date + 30
where estado = 'trial' and trial_fin is null and plan <> 'plantilla';

update public.tenants
set vigente_hasta = current_date + 30
where estado = 'activo' and vigente_hasta is null;

-- ─── Registro de cobros manuales ─────────────────────────────────────────────
-- Sin policies para authenticated: solo lo escribe fn_activar_plan y solo lo
-- lee service_role / el operador.
create table public.pagos_suscripcion (
  id         bigint generated always as identity primary key,
  tenant_id  bigint not null references public.tenants (id),
  plan       text   not null references public.planes (codigo),
  ciclo      text   not null check (ciclo in ('mensual', 'anual')),
  monto      numeric not null check (monto >= 0),
  moneda     text   not null default 'PYG',
  desde      date   not null,
  hasta      date   not null,
  referencia text,
  created_at timestamptz not null default now(),
  constraint pagos_suscripcion_periodo_check check (hasta > desde)
);

create index pagos_suscripcion_tenant_idx on public.pagos_suscripcion (tenant_id, desde desc);

comment on table public.pagos_suscripcion is
  'Cobros de suscripcion registrados a mano con fn_activar_plan. Sin acceso para authenticated.';

alter table public.pagos_suscripcion enable row level security;
revoke all on public.pagos_suscripcion from anon, authenticated;

-- ─── Funciones de consulta ───────────────────────────────────────────────────
-- Las tres son STABLE y SECURITY INVOKER: las policies las evaluan con el rol
-- del llamador, que solo lee su propio tenant (tenants_select), asi que no
-- sirven para sondear la suscripcion de otro hotel. Los triggers de abajo son
-- definer y las llaman con privilegios del dueno.

-- El hotel puede escribir: trial dentro de su plazo o plan pagado vigente.
-- `trial_fin` null solo es valido para la plantilla (nunca vence).
create or replace function public.fn_suscripcion_vigente(p_tenant bigint)
returns boolean
language sql
stable
set search_path = public
as $$
  select coalesce((
    select case t.estado
             when 'trial' then
               case when t.trial_fin is null
                    then t.plan = 'plantilla'
                    else t.trial_fin >= current_date
               end
             when 'activo' then coalesce(t.vigente_hasta >= current_date, false)
             else false
           end
    from public.tenants t
    where t.id = p_tenant
  ), false);
$$;

-- Tope del plan del hotel para una clave ('habitaciones', 'usuarios',
-- 'hoteles'). null = ilimitado. Una clave desconocida falla en vez de devolver
-- null, que se leeria como "sin tope".
create or replace function public.fn_limite(p_tenant bigint, p_clave text)
returns integer
language plpgsql
stable
set search_path = public
as $$
declare
  v_limite integer;
begin
  if p_clave is null or p_clave not in ('habitaciones', 'usuarios', 'hoteles') then
    raise exception 'Limite desconocido: %.', p_clave using errcode = '22023';
  end if;

  select case p_clave
           when 'habitaciones' then p.max_habitaciones
           when 'usuarios'     then p.max_usuarios
           else p.max_hoteles
         end
  into v_limite
  from public.tenants t
  join public.planes p on p.codigo = t.plan
  where t.id = p_tenant;

  return v_limite;
end;
$$;

-- El plan del hotel incluye el modulo ('contabilidad' o 'sifen').
create or replace function public.fn_modulo_habilitado(p_tenant bigint, p_modulo text)
returns boolean
language plpgsql
stable
set search_path = public
as $$
declare
  v_ok boolean;
begin
  if p_modulo is null or p_modulo not in ('contabilidad', 'sifen') then
    raise exception 'Modulo desconocido: %.', p_modulo using errcode = '22023';
  end if;

  select case p_modulo when 'contabilidad' then p.mod_contabilidad else p.mod_sifen end
  into v_ok
  from public.tenants t
  join public.planes p on p.codigo = t.plan
  where t.id = p_tenant;

  return coalesce(v_ok, false);
end;
$$;

-- Hoteles que puede administrar la cuenta autenticada: el mayor `max_hoteles`
-- entre los hoteles donde tiene un perfil activo de administrador (null si
-- alguno es ilimitado). Es definer porque `usuario` solo deja ver el hotel
-- activo; la plantilla no cuenta. Una cuenta sin hoteles propios puede abrir
-- el primero (devuelve 1).
create or replace function public.fn_max_hoteles_cuenta()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select case
           when count(*) = 0 then 1
           when bool_or(p.max_hoteles is null) then null
           else max(p.max_hoteles)
         end
  from public.usuario u
  join public.tenants t on t.id = u.tenant_id
  join public.planes  p on p.codigo = t.plan
  join public.cargo   c on c.id_cargo = u.fk_cargo
  where u.auth_id = auth.uid()
    and lower(trim(u.estado)) = 'activo'
    and lower(trim(c.cargo)) in ('admin', 'administrador')
    and t.plan <> 'plantilla';
$$;

-- ─── Activacion manual de un plan ────────────────────────────────────────────
-- Registra un cobro: deja el hotel activo en el plan y ciclo indicados y
-- extiende `vigente_hasta` un mes o doce meses a partir de lo que quede de la
-- vigencia actual (o de hoy si ya vencio). Si p_monto es null toma el precio
-- de lista del plan para ese ciclo. Devuelve el nuevo `vigente_hasta`.
--
-- Solo service_role o un operador con el rol postgres. Un hotel suspendido
-- vuelve a quedar activo: quien cobra decide si corresponde.
create or replace function public.fn_activar_plan(
  p_tenant     bigint,
  p_plan       text,
  p_ciclo      text,
  p_monto      numeric default null,
  p_referencia text    default null
)
returns date
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan    public.planes%rowtype;
  v_tenant  public.tenants%rowtype;
  v_desde   date;
  v_hasta   date;
  v_monto   numeric;
begin
  if p_ciclo is null or p_ciclo not in ('mensual', 'anual') then
    raise exception 'Ciclo de facturacion invalido: usar mensual o anual.' using errcode = '22023';
  end if;

  select * into v_plan from public.planes p where p.codigo = p_plan and p.visible;
  if not found then
    raise exception 'El plan "%" no existe o no se puede contratar.', p_plan using errcode = '22023';
  end if;

  select * into v_tenant from public.tenants t where t.id = p_tenant for update;
  if not found then
    raise exception 'No existe el hotel %.', p_tenant using errcode = '22023';
  end if;
  if v_tenant.plan = 'plantilla' then
    raise exception 'El hotel plantilla no tiene suscripcion.' using errcode = '22023';
  end if;

  v_monto := coalesce(p_monto,
                      case p_ciclo when 'mensual' then v_plan.precio_mensual else v_plan.precio_anual end);
  if v_monto < 0 then
    raise exception 'El monto no puede ser negativo.' using errcode = '22023';
  end if;

  v_desde := greatest(coalesce(v_tenant.vigente_hasta, current_date), current_date);
  v_hasta := (v_desde + case p_ciclo when 'mensual' then interval '1 month' else interval '12 months' end)::date;

  update public.tenants
  set estado = 'activo',
      plan = v_plan.codigo,
      ciclo_facturacion = p_ciclo,
      vigente_hasta = v_hasta
  where id = p_tenant;

  insert into public.pagos_suscripcion
    (tenant_id, plan, ciclo, monto, moneda, desde, hasta, referencia)
  values
    (p_tenant, v_plan.codigo, p_ciclo, v_monto, v_plan.moneda, v_desde, v_hasta,
     nullif(trim(p_referencia), ''));

  return v_hasta;
end;
$$;

-- ─── Topes de altas ──────────────────────────────────────────────────────────
-- Bloquean la fila del hotel (FOR NO KEY UPDATE) para serializar el conteo: dos
-- altas simultaneas en el tope no pasan las dos. NO KEY UPDATE no choca con el
-- FOR KEY SHARE de las FK, asi que no frena el resto de las altas del hotel.
-- Se cuentan TODAS las filas (activas e inactivas) para que el tope no se
-- esquive desactivando y recreando. Son definer: el conteo no depende de RLS.
create or replace function public.tg_fn_limite_habitaciones()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan   text;
  v_limite integer;
  v_total  bigint;
begin
  select t.plan into v_plan
  from public.tenants t
  where t.id = new.tenant_id
  for no key update;

  v_limite := public.fn_limite(new.tenant_id, 'habitaciones');
  if v_limite is null then
    return new;
  end if;

  select count(*) into v_total from public.habitaciones h where h.tenant_id = new.tenant_id;
  if v_total >= v_limite then
    raise exception 'El plan % permite hasta % habitaciones por hotel y ya hay %. Cambia de plan para agregar mas.',
      v_plan, v_limite, v_total
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create or replace function public.tg_fn_limite_usuarios()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan   text;
  v_limite integer;
  v_total  bigint;
begin
  select t.plan into v_plan
  from public.tenants t
  where t.id = new.tenant_id
  for no key update;

  v_limite := public.fn_limite(new.tenant_id, 'usuarios');
  if v_limite is null then
    return new;
  end if;

  select count(*) into v_total from public.usuario u where u.tenant_id = new.tenant_id;
  if v_total >= v_limite then
    raise exception 'El plan % permite hasta % usuarios por hotel y ya hay %. Cambia de plan para agregar mas.',
      v_plan, v_limite, v_total
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger habitaciones_limite_plan
  before insert on public.habitaciones
  for each row execute function public.tg_fn_limite_habitaciones();

create trigger usuario_limite_plan
  before insert on public.usuario
  for each row execute function public.tg_fn_limite_usuarios();

-- ─── Solo lectura al vencer y modulos por plan ───────────────────────────────
-- Policies RESTRICTIVE: se combinan con AND sobre las permissive de 0006, asi
-- que no reemplazan ninguna regla de rol. Solo INSERT/UPDATE/DELETE; el SELECT
-- no se toca, ni tampoco `tenants`, `usuario`, `notificacion` ni los catalogos
-- (el login y el cambio de hotel siguen funcionando con la suscripcion vencida).
-- `factura_secuencia` no tiene policies de escritura (solo la mueve una funcion
-- definer) y por eso no figura.
do $$
declare
  t         text;
  v_vigente constant text := '(select public.fn_suscripcion_vigente((select public.current_tenant_id())))';
begin
  foreach t in array array[
    'clientes', 'reservas', 'detalle_reservas', 'huespedes_reserva',
    'historial_estancia', 'folios', 'cargos_folio', 'facturas', 'detalle_factura',
    'datos_factura_sifen', 'caja', 'apertura_cierre_caja', 'habitaciones',
    'imagenes_habitacion', 'bloqueos_habitacion', 'tipo_habitacion',
    'imagenes_tipo_habitacion', 'tarifas', 'conceptos', 'datos_empresa',
    'establecimientos', 'pisos', 'timbrados', 'cuentas_contables', 'asientos',
    'detalle_asientos', 'saldos_mensuales', 'actividad_empresa', 'edificios',
    'estado_limpieza'
  ] loop
    execute format(
      'create policy %I on public.%I as restrictive for insert to authenticated with check (%s)',
      t || '_vigente_insert', t, v_vigente);
    execute format(
      'create policy %I on public.%I as restrictive for update to authenticated using (%s) with check (%s)',
      t || '_vigente_update', t, v_vigente, v_vigente);
    execute format(
      'create policy %I on public.%I as restrictive for delete to authenticated using (%s)',
      t || '_vigente_delete', t, v_vigente);
  end loop;
end;
$$;

-- Modulos: la escritura exige que el plan incluya el modulo. Verificado: ningun
-- trigger del esquema escribe en estas tablas (las escribe el frontend), asi que
-- el bloqueo no rompe flujos automaticos como el check-out.
do $$
declare
  r record;
  v_modulo text;
begin
  for r in
    select * from (values
      ('cuentas_contables',   'contabilidad'),
      ('asientos',            'contabilidad'),
      ('detalle_asientos',    'contabilidad'),
      ('saldos_mensuales',    'contabilidad'),
      ('timbrados',           'sifen'),
      ('datos_factura_sifen', 'sifen')
    ) as m(tabla, modulo)
  loop
    v_modulo := format(
      '(select public.fn_modulo_habilitado((select public.current_tenant_id()), %L))', r.modulo);

    execute format(
      'create policy %I on public.%I as restrictive for insert to authenticated with check (%s)',
      r.tabla || '_modulo_insert', r.tabla, v_modulo);
    execute format(
      'create policy %I on public.%I as restrictive for update to authenticated using (%s) with check (%s)',
      r.tabla || '_modulo_update', r.tabla, v_modulo, v_modulo);
    execute format(
      'create policy %I on public.%I as restrictive for delete to authenticated using (%s)',
      r.tabla || '_modulo_delete', r.tabla, v_modulo);
  end loop;
end;
$$;

-- ─── Alta de tenants: trial de 30 dias ───────────────────────────────────────
-- Copia completa de la version de 0008. Solo cambia el trial por defecto (14 ->
-- 30 dias) y que el plan y la vigencia de pago se fijan de forma explicita.
create or replace function public.fn_provision_tenant(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nombre     text := nullif(trim(p_payload #>> '{tenant,nombre}'), '');
  v_slug       text := lower(nullif(trim(p_payload #>> '{tenant,slug}'), ''));
  v_trial_dias integer := coalesce((p_payload #>> '{tenant,trial_dias}')::integer, 30);

  v_auth_id    uuid := (p_payload #>> '{admin,auth_id}')::uuid;
  v_correo     text;
  v_adm_nombre text := nullif(trim(p_payload #>> '{admin,nombre}'), '');
  v_adm_doc    text := nullif(trim(p_payload #>> '{admin,documento}'), '');
  v_adm_tipodoc bigint := (p_payload #>> '{admin,fk_tipo_doc}')::bigint;

  v_ruc        text := nullif(trim(p_payload #>> '{empresa,ruc}'), '');
  v_razon      text := nullif(trim(p_payload #>> '{empresa,razon_social}'), '');
  v_contrib    bigint := (p_payload #>> '{empresa,fk_contribuyente}')::bigint;
  v_regimen    bigint := (p_payload #>> '{empresa,fk_regimen}')::bigint;

  v_direccion  text := nullif(trim(p_payload #>> '{establecimiento,direccion}'), '');
  v_barrio     bigint := (p_payload #>> '{establecimiento,fk_barrio}')::bigint;

  v_tenant     bigint;
  v_cargo      bigint;
  v_empresa    bigint;
  v_estab      bigint;
  v_usuario    bigint;
  v_caja       bigint;
  v_iva        bigint;
  v_unidad     bigint;
begin
  if v_nombre is null or v_slug is null then
    raise exception 'Faltan el nombre o el identificador (slug) del tenant.';
  end if;
  if v_slug in ('plantilla-base', 'admin', 'api', 'www', 'app', 'auth', 'soporte',
                'support', 'landing', 'static', 'assets', 'login', 'registro') then
    raise exception 'El identificador "%" esta reservado.', v_slug using errcode = '23505';
  end if;
  if v_auth_id is null or v_adm_nombre is null or v_adm_doc is null or v_adm_tipodoc is null then
    raise exception 'Faltan datos del administrador (auth_id, nombre, documento, fk_tipo_doc).';
  end if;
  if v_ruc is null or v_razon is null or v_contrib is null or v_regimen is null then
    raise exception 'Faltan datos de la empresa (ruc, razon_social, fk_contribuyente, fk_regimen).';
  end if;
  if v_direccion is null or v_barrio is null then
    raise exception 'Faltan datos del establecimiento (direccion, fk_barrio).';
  end if;

  select u.email into v_correo from auth.users u where u.id = v_auth_id;
  if not found then
    raise exception 'No existe la cuenta de Auth del administrador (%).', v_auth_id;
  end if;

  select c.id_cargo into v_cargo
  from public.cargo c
  where lower(trim(c.cargo)) in ('admin', 'administrador')
  order by c.id_cargo
  limit 1;
  if v_cargo is null then
    raise exception 'No existe el cargo de administrador: cargar los catalogos antes de dar de alta tenants.';
  end if;

  begin
    insert into public.tenants (nombre, slug, estado, plan, trial_fin, vigente_hasta)
    values (v_nombre, v_slug, 'trial', 'trial', current_date + v_trial_dias, null)
    returning id into v_tenant;
  exception
    when unique_violation then
      raise exception 'El identificador "%" ya esta en uso.', v_slug using errcode = '23505';
    when check_violation then
      raise exception 'Identificador invalido: usar 3 a 40 caracteres entre a-z, 0-9 y guion.' using errcode = '23514';
  end;

  insert into public.datos_empresa
    (tenant_id, ruc, razon_social, nombre_fantasia, fk_contribuyente, fk_regimen, estado)
  values
    (v_tenant, v_ruc, v_razon,
     coalesce(nullif(trim(p_payload #>> '{empresa,nombre_fantasia}'), ''), v_razon),
     v_contrib, v_regimen, 'Activo')
  returning id_empresa into v_empresa;

  insert into public.establecimientos
    (tenant_id, codigo_establecimiento, direccion, numero_casa, complemento_direccion_1,
     complemento_direccion_2, telefono, email, denominacion, estado_establecimiento,
     fk_barrio, fk_empresa)
  values
    (v_tenant,
     coalesce(nullif(trim(p_payload #>> '{establecimiento,codigo}'), ''), '001'),
     v_direccion,
     coalesce(nullif(trim(p_payload #>> '{establecimiento,numero_casa}'), ''), 's/n'),
     coalesce(nullif(trim(p_payload #>> '{establecimiento,complemento_direccion_1}'), ''), '-'),
     nullif(trim(p_payload #>> '{establecimiento,complemento_direccion_2}'), ''),
     nullif(trim(p_payload #>> '{establecimiento,telefono}'), ''),
     nullif(trim(p_payload #>> '{establecimiento,email}'), ''),
     coalesce(nullif(trim(p_payload #>> '{establecimiento,denominacion}'), ''), v_nombre),
     'Activo', v_barrio, v_empresa)
  returning id_establecimiento into v_estab;

  insert into public.usuario
    (tenant_id, auth_id, correo, nombre, documento, telefono, usuario, fk_tipo_doc, fk_cargo, estado)
  values
    (v_tenant, v_auth_id, v_correo, v_adm_nombre, v_adm_doc,
     nullif(trim(p_payload #>> '{admin,telefono}'), ''),
     coalesce(nullif(trim(p_payload #>> '{admin,usuario}'), ''), split_part(v_correo, '@', 1)),
     v_adm_tipodoc, v_cargo, 'Activo')
  returning id_usuario into v_usuario;

  update public.tenants set fk_usuario_web = v_usuario where id = v_tenant;

  insert into public.caja (tenant_id, nro_caja, descripcion_caja, fk_establecimientos)
  values (v_tenant, 1, 'Caja principal', v_estab)
  returning id_caja into v_caja;

  -- Concepto fijo del cargo automatico de noches (lo busca por nombre
  -- folioService.getOrCrearConceptoAlojamiento). Si los catalogos aun no estan
  -- sembrados se omite y el frontend lo crea la primera vez que lo necesite.
  select i.id_iva into v_iva from public.iva i where i.valor = 10 order by i.id_iva limit 1;
  select m.id_unidades into v_unidad from public.unidades_medida m order by m.id_unidades limit 1;

  if v_iva is not null and v_unidad is not null then
    insert into public.conceptos
      (tenant_id, nombre, arancel, descripcion, fk_iva, fk_unidad_medida, estado)
    values
      (v_tenant, 'Alojamiento', 0, 'Cargo automático por noches de estadía', v_iva, v_unidad, 'ACTIVO');
  else
    raise notice 'Catalogos iva/unidades_medida sin sembrar: se omite el concepto Alojamiento.';
  end if;

  perform public.fn_seed_tenant_desde_plantilla(v_tenant);

  -- Deja el tenant en el claim de la cuenta de Auth (solo el servidor puede
  -- escribir raw_app_meta_data).
  update auth.users
  set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
                          || jsonb_build_object('tenant_id', v_tenant, 'fk_cargo', v_cargo)
  where id = v_auth_id;

  return jsonb_build_object(
    'tenant_id', v_tenant,
    'id_empresa', v_empresa,
    'id_establecimiento', v_estab,
    'id_usuario', v_usuario,
    'id_caja', v_caja
  );
end;
$$;

-- ─── Privilegios ─────────────────────────────────────────────────────────────
-- La guarda de 0012 ya revoca EXECUTE de lo que se crea arriba; se repite para
-- que no dependa del event trigger (puede no existir, ver 0012).
revoke execute on function public.fn_suscripcion_vigente(bigint)                          from public, anon, authenticated;
revoke execute on function public.fn_limite(bigint, text)                                 from public, anon, authenticated;
revoke execute on function public.fn_modulo_habilitado(bigint, text)                      from public, anon, authenticated;
revoke execute on function public.fn_max_hoteles_cuenta()                                 from public, anon, authenticated;
revoke execute on function public.fn_activar_plan(bigint, text, text, numeric, text)      from public, anon, authenticated;
revoke execute on function public.tg_fn_limite_habitaciones()                             from public, anon, authenticated;
revoke execute on function public.tg_fn_limite_usuarios()                                 from public, anon, authenticated;
revoke execute on function public.fn_provision_tenant(jsonb)                              from public, anon, authenticated;

-- Las policies y el frontend las evaluan con el rol authenticated.
grant execute on function public.fn_suscripcion_vigente(bigint)      to authenticated;
grant execute on function public.fn_limite(bigint, text)             to authenticated;
grant execute on function public.fn_modulo_habilitado(bigint, text)  to authenticated;
grant execute on function public.fn_max_hoteles_cuenta()             to authenticated;

-- Cobros y alta de tenants: solo service_role (o un operador con el rol postgres).
grant execute on function public.fn_activar_plan(bigint, text, text, numeric, text) to service_role;
grant execute on function public.fn_provision_tenant(jsonb)                          to service_role;

-- Sin concesiones a proposito: las funciones de trigger no requieren EXECUTE
-- para dispararse.
