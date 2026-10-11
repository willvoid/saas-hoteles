-- ═══════════════════════════════════════════════════════════════════════════
-- 0003 · Tablas propias del tenant
-- ═══════════════════════════════════════════════════════════════════════════
-- Las 33 tablas de negocio, con los mismos nombres y columnas que el esquema
-- anterior mas `tenant_id`. Reglas aplicadas en todas:
--
--   * `tenant_id` es NOT NULL y por defecto toma el tenant del JWT, de modo que
--     los inserts del frontend actual siguen funcionando sin mandarlo. Las
--     policies (0006) exigen ademas que coincida con el del usuario.
--   * Cada tabla padre expone UNIQUE (tenant_id, <pk>) y cada hijo la
--     referencia con una FK compuesta (tenant_id, fk_x). Asi un registro no
--     puede apuntar a una fila de otro tenant: las FK se validan saltando RLS,
--     y sin esto bastaria adivinar un id para enlazar datos ajenos.
--   * Las FK a catalogos globales siguen siendo simples.
--   * Las columnas `estado` conservan el casing que escribe hoy el frontend;
--     los CHECK comparan con lower(trim(...)) y solo se agregan donde el
--     conjunto de valores es conocido.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Estructura fiscal y personal ────────────────────────────────────────────

create table public.datos_empresa (
  id_empresa       bigint generated always as identity primary key,
  tenant_id        bigint not null default public.current_tenant_id() references public.tenants (id),
  created_at       timestamptz not null default now(),
  ruc              text not null,
  razon_social     text not null,
  nombre_fantasia  text not null,
  fk_contribuyente bigint not null references public.tipo_contribuyente (id_tipo_contribuyente),
  fk_regimen       bigint not null references public.tipo_regimen (id_regimen),
  estado           text not null check (lower(trim(estado)) in ('activo', 'inactivo')),
  constraint datos_empresa_tenant_id_key unique (tenant_id, id_empresa)
);

-- Un RUC pertenece a un unico contribuyente: no puede estar en dos tenants.
create unique index datos_empresa_ruc_key on public.datos_empresa (ruc);

create table public.usuario (
  id_usuario  bigint generated always as identity primary key,
  tenant_id   bigint not null default public.current_tenant_id() references public.tenants (id),
  created_at  timestamptz not null default now(),
  documento   text not null,
  nombre      text not null,
  correo      text not null,
  usuario     text not null,
  fk_cargo    bigint not null references public.cargo (id_cargo),
  fk_tipo_doc bigint not null references public.tipo_documento (cod_tipodoc),
  telefono    text,
  estado      text not null default 'Activo' check (lower(trim(estado)) in ('activo', 'inactivo')),
  auth_id     uuid unique references auth.users (id) on delete set null,
  constraint usuario_tenant_id_key unique (tenant_id, id_usuario)
);

-- `correo` es el identificador de login y auth.users lo exige unico global.
-- `usuario` (el handle visible) solo debe ser unico dentro del tenant.
create unique index usuario_correo_key on public.usuario (lower(correo));
create unique index usuario_usuario_key on public.usuario (tenant_id, lower(usuario));

alter table public.tenants
  add constraint tenants_fk_usuario_web_fkey
  foreign key (id, fk_usuario_web) references public.usuario (tenant_id, id_usuario);

create table public.establecimientos (
  id_establecimiento      bigint generated always as identity primary key,
  tenant_id               bigint not null default public.current_tenant_id() references public.tenants (id),
  created_at              timestamptz not null default now(),
  codigo_establecimiento  text not null,
  direccion               text not null,
  numero_casa             text not null,
  complemento_direccion_1 text not null,
  complemento_direccion_2 text,
  telefono                text,
  email                   text,
  denominacion            text not null,
  estado_establecimiento  text not null check (lower(trim(estado_establecimiento)) in ('activo', 'inactivo')),
  fk_barrio               bigint not null references public.barrios (cod_barrio),
  fk_empresa              bigint not null,
  constraint establecimientos_tenant_id_key unique (tenant_id, id_establecimiento),
  constraint establecimientos_fk_empresa_fkey
    foreign key (tenant_id, fk_empresa) references public.datos_empresa (tenant_id, id_empresa)
);

create unique index establecimientos_codigo_key
  on public.establecimientos (fk_empresa, lower(codigo_establecimiento));

create table public.actividad_empresa (
  id           bigint generated always as identity primary key,
  tenant_id    bigint not null default public.current_tenant_id() references public.tenants (id),
  created_at   timestamptz not null default now(),
  fk_empresa   bigint not null,
  fk_actividad bigint not null references public.actividad_economica (id_actividad_economica),
  es_principal boolean not null default false,
  constraint actividad_empresa_tenant_id_key unique (tenant_id, id),
  constraint actividad_empresa_fk_empresa_fkey
    foreign key (tenant_id, fk_empresa) references public.datos_empresa (tenant_id, id_empresa),
  constraint actividad_empresa_unica unique (fk_empresa, fk_actividad)
);

create table public.timbrados (
  id_timbrado        bigint generated always as identity primary key,
  tenant_id          bigint not null default public.current_tenant_id() references public.tenants (id),
  created_at         timestamptz not null default now(),
  timbrado           text not null,
  inicio             date not null,
  vencimiento        date not null,
  estado             text not null,
  fk_establecimiento bigint not null,
  constraint timbrados_tenant_id_key unique (tenant_id, id_timbrado),
  constraint timbrados_fk_establecimiento_fkey
    foreign key (tenant_id, fk_establecimiento) references public.establecimientos (tenant_id, id_establecimiento)
);

-- ─── Clientes, conceptos y contabilidad ──────────────────────────────────────

create table public.clientes (
  id_cliente              bigint generated always as identity primary key,
  tenant_id               bigint not null default public.current_tenant_id() references public.tenants (id),
  created_at              timestamptz not null default now(),
  razon_social            text not null,
  nombre_fantasia         text,
  documento               text not null,
  telefono                text,
  celular                 text not null,
  direccion               text,
  es_proveedor_del_estado boolean not null,
  email                   text,
  nro_casa                bigint not null default 0,
  fk_tipo_operacion       bigint references public.tipo_operacion (id_tipo_operacion),
  estado_cliente          text not null default 'Activo',
  fk_tipo_documento       bigint references public.tipo_documento (cod_tipodoc),
  fk_barrios              bigint references public.barrios (cod_barrio),
  fk_tipo_contribuyente   bigint references public.tipo_contribuyente (id_tipo_contribuyente),
  constraint clientes_tenant_id_key unique (tenant_id, id_cliente)
);

create index clientes_documento_idx on public.clientes (tenant_id, documento);

create table public.conceptos (
  id_concepto      bigint generated always as identity primary key,
  tenant_id        bigint not null default public.current_tenant_id() references public.tenants (id),
  created_at       timestamptz not null default now(),
  nombre           text not null,
  arancel          double precision not null,
  descripcion      text not null,
  fk_iva           bigint not null references public.iva (id_iva),
  fk_unidad_medida bigint not null references public.unidades_medida (id_unidades),
  estado           text not null check (lower(trim(estado)) in ('activo', 'inactivo')),
  fk_servicio      bigint,
  constraint conceptos_tenant_id_key unique (tenant_id, id_concepto)
);

create table public.cuentas_contables (
  id              bigint generated always as identity primary key,
  tenant_id       bigint not null default public.current_tenant_id() references public.tenants (id),
  created_at      timestamptz not null default now(),
  nombre          text not null,
  codigo          text,
  fk_tipo_cuenta  integer not null references public.tipo_cuenta_contable (id),
  imputable       boolean not null,
  fk_cuenta_padre bigint,
  constraint cuentas_contables_tenant_id_key unique (tenant_id, id),
  constraint cuentas_contables_fk_cuenta_padre_fkey
    foreign key (tenant_id, fk_cuenta_padre) references public.cuentas_contables (tenant_id, id)
);

create table public.asientos (
  id           bigint generated always as identity primary key,
  tenant_id    bigint not null default public.current_tenant_id() references public.tenants (id),
  fecha        timestamptz not null default now(),
  descripcion  text not null,
  nro_asiento  bigint not null,
  fk_sucursal  bigint not null,
  estado       text not null,
  origen_tipo  text,
  fk_origen    bigint,
  constraint asientos_tenant_id_key unique (tenant_id, id),
  constraint asientos_fk_sucursal_fkey
    foreign key (tenant_id, fk_sucursal) references public.establecimientos (tenant_id, id_establecimiento)
);

create table public.detalle_asientos (
  id                  bigint generated always as identity primary key,
  tenant_id           bigint not null default public.current_tenant_id() references public.tenants (id),
  created_at          timestamptz not null default now(),
  fk_cuenta_contables bigint not null,
  fk_asientos         bigint not null,
  debe                numeric not null default 0,
  haber               numeric not null default 0,
  constraint detalle_asientos_fk_cuenta_contables_fkey
    foreign key (tenant_id, fk_cuenta_contables) references public.cuentas_contables (tenant_id, id),
  constraint detalle_asientos_fk_asientos_fkey
    foreign key (tenant_id, fk_asientos) references public.asientos (tenant_id, id)
);

create table public.saldos_mensuales (
  id                    bigint generated always as identity primary key,
  tenant_id             bigint not null default public.current_tenant_id() references public.tenants (id),
  created_at            timestamptz not null default now(),
  fk_cuenta             bigint not null,
  mes                   integer not null,
  anio                  bigint not null,
  saldo_debe_acumulado  numeric not null,
  saldo_haber_acumulado numeric not null,
  saldo_final           numeric not null,
  constraint saldos_mensuales_fk_cuenta_fkey
    foreign key (tenant_id, fk_cuenta) references public.cuentas_contables (tenant_id, id)
);

-- ─── Caja ────────────────────────────────────────────────────────────────────

create table public.caja (
  id_caja             bigint generated always as identity primary key,
  tenant_id           bigint not null default public.current_tenant_id() references public.tenants (id),
  created_at          timestamptz not null default now(),
  nro_caja            bigint not null,
  descripcion_caja    text,
  fk_establecimientos bigint not null,
  constraint caja_tenant_id_key unique (tenant_id, id_caja),
  constraint caja_nro_por_establecimiento unique (fk_establecimientos, nro_caja),
  constraint caja_fk_establecimientos_fkey
    foreign key (tenant_id, fk_establecimientos) references public.establecimientos (tenant_id, id_establecimiento)
);

create table public.apertura_cierre_caja (
  id_turno          bigint generated always as identity primary key,
  tenant_id         bigint not null default public.current_tenant_id() references public.tenants (id),
  apertura          timestamptz not null default now(),
  cierre            timestamptz,
  monto_inicial     double precision not null,
  monto_final       double precision not null,
  fk_usuario        bigint not null,
  fk_caja           bigint not null,
  fk_usuario_cierre bigint,
  constraint apertura_cierre_caja_tenant_id_key unique (tenant_id, id_turno),
  constraint apertura_cierre_caja_fk_usuario_fkey
    foreign key (tenant_id, fk_usuario) references public.usuario (tenant_id, id_usuario),
  constraint apertura_cierre_caja_fk_caja_fkey
    foreign key (tenant_id, fk_caja) references public.caja (tenant_id, id_caja),
  constraint apertura_cierre_caja_fk_usuario_cierre_fkey
    foreign key (tenant_id, fk_usuario_cierre) references public.usuario (tenant_id, id_usuario)
);

comment on column public.apertura_cierre_caja.fk_usuario_cierre is
  'Quien cerro el turno de verdad (puede ser distinto de fk_usuario, quien lo abrio). Null mientras sigue abierto.';

-- A lo sumo un turno abierto por caja fisica; el historial de cerrados no cuenta.
create unique index turno_abierto_unico_por_caja
  on public.apertura_cierre_caja (fk_caja)
  where cierre is null;

-- ─── Planta fisica y tarifas ─────────────────────────────────────────────────

create table public.edificios (
  id          bigint generated always as identity primary key,
  tenant_id   bigint not null default public.current_tenant_id() references public.tenants (id),
  created_at  timestamptz not null default now(),
  nombre      text not null,
  estado      text not null check (lower(trim(estado)) in ('activo', 'inactivo')),
  fk_sucursal bigint not null,
  constraint edificios_tenant_id_key unique (tenant_id, id),
  constraint edificios_fk_sucursal_fkey
    foreign key (tenant_id, fk_sucursal) references public.establecimientos (tenant_id, id_establecimiento)
);

create table public.pisos (
  id          bigint generated always as identity primary key,
  tenant_id   bigint not null default public.current_tenant_id() references public.tenants (id),
  created_at  timestamptz not null default now(),
  numero      integer not null,
  estado      text not null check (lower(trim(estado)) in ('activo', 'inactivo')),
  fk_edificio bigint not null,
  constraint pisos_tenant_id_key unique (tenant_id, id),
  constraint pisos_fk_edificio_fkey
    foreign key (tenant_id, fk_edificio) references public.edificios (tenant_id, id)
);

create table public.tipo_habitacion (
  id          bigint generated always as identity primary key,
  tenant_id   bigint not null default public.current_tenant_id() references public.tenants (id),
  created_at  timestamptz not null default now(),
  nombre      text not null,
  descripcion text not null,
  capacidad   integer not null,
  constraint tipo_habitacion_tenant_id_key unique (tenant_id, id)
);

create table public.habitaciones (
  id                 bigint generated always as identity primary key,
  tenant_id          bigint not null default public.current_tenant_id() references public.tenants (id),
  created_at         timestamptz not null default now(),
  numero_habitacion  integer not null,
  descripcion        text,
  fk_tipo_habitacion bigint not null,
  fk_piso            bigint not null,
  constraint habitaciones_tenant_id_key unique (tenant_id, id),
  constraint habitaciones_fk_tipo_habitacion_fkey
    foreign key (tenant_id, fk_tipo_habitacion) references public.tipo_habitacion (tenant_id, id),
  constraint habitaciones_fk_piso_fkey
    foreign key (tenant_id, fk_piso) references public.pisos (tenant_id, id)
);

create table public.tarifas (
  id                 bigint generated always as identity primary key,
  tenant_id          bigint not null default public.current_tenant_id() references public.tenants (id),
  created_at         timestamptz not null default now(),
  nombre             text not null,
  precio_base        numeric not null,
  estado             text not null check (lower(trim(estado)) in ('activa', 'inactiva')),
  fk_tipo_habitacion bigint not null,
  fecha_inicio       date not null default current_date,
  fecha_fin          date,
  constraint tarifas_tenant_id_key unique (tenant_id, id),
  constraint tarifas_fk_tipo_habitacion_fkey
    foreign key (tenant_id, fk_tipo_habitacion) references public.tipo_habitacion (tenant_id, id)
);

create table public.imagenes_habitacion (
  id            bigint generated always as identity primary key,
  tenant_id     bigint not null default public.current_tenant_id() references public.tenants (id),
  created_at    timestamptz not null default now(),
  fk_habitacion bigint not null,
  ruta_storage  text not null,
  es_principal  boolean not null default false,
  constraint imagenes_habitacion_fk_habitacion_fkey
    foreign key (tenant_id, fk_habitacion) references public.habitaciones (tenant_id, id)
);

create table public.imagenes_tipo_habitacion (
  id                 bigint generated always as identity primary key,
  tenant_id          bigint not null default public.current_tenant_id() references public.tenants (id),
  created_at         timestamptz not null default now(),
  fk_tipo_habitacion bigint not null,
  ruta_storage       text not null,
  es_principal       boolean not null default false,
  constraint imagenes_tipo_habitacion_fk_tipo_habitacion_fkey
    foreign key (tenant_id, fk_tipo_habitacion) references public.tipo_habitacion (tenant_id, id)
);

create table public.estado_limpieza (
  id_estado_limpieza   bigint generated always as identity primary key,
  tenant_id            bigint not null default public.current_tenant_id() references public.tenants (id),
  fk_habitacion        bigint not null,
  estado               text not null,
  fk_empleado          bigint,
  ultima_actualizacion timestamptz default now(),
  -- El frontend lee una sola fila por habitacion (maybeSingle).
  constraint estado_limpieza_habitacion_unica unique (fk_habitacion),
  constraint estado_limpieza_fk_habitacion_fkey
    foreign key (tenant_id, fk_habitacion) references public.habitaciones (tenant_id, id),
  constraint estado_limpieza_fk_empleado_fkey
    foreign key (tenant_id, fk_empleado) references public.usuario (tenant_id, id_usuario)
);

create table public.bloqueos_habitacion (
  id_bloqueo    bigint generated always as identity primary key,
  tenant_id     bigint not null default public.current_tenant_id() references public.tenants (id),
  fk_habitacion bigint not null,
  fecha_inicio  date not null,
  fecha_fin     date,
  motivo        text not null,
  observaciones text,
  constraint bloqueos_habitacion_fk_habitacion_fkey
    foreign key (tenant_id, fk_habitacion) references public.habitaciones (tenant_id, id)
);

-- ─── Reservas y folios ───────────────────────────────────────────────────────

create table public.reservas (
  id_reserva     bigint generated always as identity primary key,
  tenant_id      bigint not null default public.current_tenant_id() references public.tenants (id),
  created_at     timestamptz not null default now(),
  codigo_reserva text not null,
  fecha_entrada  date not null,
  fecha_salida   date not null,
  estado         text not null default 'Pendiente',
  fk_cliente     bigint not null,
  fk_usuario     bigint not null,
  origen         text not null,
  observaciones  text,
  total_estimado numeric default 0,
  constraint reservas_tenant_id_key unique (tenant_id, id_reserva),
  constraint reservas_fk_cliente_fkey
    foreign key (tenant_id, fk_cliente) references public.clientes (tenant_id, id_cliente),
  constraint reservas_fk_usuario_fkey
    foreign key (tenant_id, fk_usuario) references public.usuario (tenant_id, id_usuario)
);

-- El codigo lo genera el trigger (0005) cuando viene vacio; es unico por tenant.
create unique index reservas_codigo_key on public.reservas (tenant_id, codigo_reserva);
create index reservas_fechas_idx on public.reservas (tenant_id, fecha_entrada, fecha_salida);

create table public.detalle_reservas (
  id_detalle      bigint generated always as identity primary key,
  tenant_id       bigint not null default public.current_tenant_id() references public.tenants (id),
  created_at      timestamptz not null default now(),
  fk_reserva      bigint not null,
  fk_habitacion   bigint not null,
  fk_tarifa       bigint not null,
  cantidad_adultos integer not null default 1,
  cantidad_ninos   integer not null default 0,
  precio_unitario numeric not null,
  subtotal        numeric not null,
  estado          text not null default 'Activo',
  constraint detalle_reservas_tenant_id_key unique (tenant_id, id_detalle),
  constraint detalle_reservas_fk_reserva_fkey
    foreign key (tenant_id, fk_reserva) references public.reservas (tenant_id, id_reserva),
  constraint detalle_reservas_fk_habitacion_fkey
    foreign key (tenant_id, fk_habitacion) references public.habitaciones (tenant_id, id),
  constraint detalle_reservas_fk_tarifa_fkey
    foreign key (tenant_id, fk_tarifa) references public.tarifas (tenant_id, id)
);

create table public.huespedes_reserva (
  id_huesped         bigint generated always as identity primary key,
  tenant_id          bigint not null default public.current_tenant_id() references public.tenants (id),
  created_at         timestamptz not null default now(),
  fk_detalle_reserva bigint not null,
  nombre_completo    text not null,
  documento          text not null,
  fk_tipo_documento  bigint references public.tipo_documento (cod_tipodoc),
  nacionalidad       text,
  es_titular         boolean not null default false,
  constraint huespedes_reserva_fk_detalle_fkey
    foreign key (tenant_id, fk_detalle_reserva) references public.detalle_reservas (tenant_id, id_detalle)
);

create table public.historial_estancia (
  id_historial     bigint generated always as identity primary key,
  tenant_id        bigint not null default public.current_tenant_id() references public.tenants (id),
  fk_reserva       bigint not null,
  tipo_movimiento  text not null,
  descripcion      text,
  fecha_movimiento timestamptz default now(),
  fk_usuario       bigint,
  constraint historial_estancia_fk_reserva_fkey
    foreign key (tenant_id, fk_reserva) references public.reservas (tenant_id, id_reserva),
  constraint historial_estancia_fk_usuario_fkey
    foreign key (tenant_id, fk_usuario) references public.usuario (tenant_id, id_usuario)
);

create table public.folios (
  id_folio              bigint generated always as identity primary key,
  tenant_id             bigint not null default public.current_tenant_id() references public.tenants (id),
  fk_reserva            bigint not null,
  estado                text not null default 'abierto' check (lower(trim(estado)) in ('abierto', 'cerrado')),
  total_acumulado       numeric not null default 0,
  created_at            timestamptz not null default now(),
  fk_usuario_reapertura bigint,
  reabierto_at          timestamptz,
  constraint folios_tenant_id_key unique (tenant_id, id_folio),
  constraint folios_fk_reserva_fkey
    foreign key (tenant_id, fk_reserva) references public.reservas (tenant_id, id_reserva),
  constraint folios_fk_usuario_reapertura_fkey
    foreign key (tenant_id, fk_usuario_reapertura) references public.usuario (tenant_id, id_usuario)
);

comment on column public.folios.fk_usuario_reapertura is
  'Quien reabrio el folio (admin/gerente). Null si nunca se reabrio.';
comment on column public.folios.reabierto_at is
  'Cuando se reabrio el folio. Null si nunca se reabrio.';

create table public.cargos_folio (
  id_cargo       bigint generated always as identity primary key,
  tenant_id      bigint not null default public.current_tenant_id() references public.tenants (id),
  fk_folio       bigint not null,
  fk_concepto    bigint not null,
  cantidad       integer not null default 1,
  monto_unitario numeric not null,
  monto_total    numeric not null,
  fecha_cargo    timestamptz default now(),
  fk_usuario     bigint not null,
  estado         text default 'ACTIVO',
  constraint cargos_folio_tenant_id_key unique (tenant_id, id_cargo),
  constraint cargos_folio_fk_folio_fkey
    foreign key (tenant_id, fk_folio) references public.folios (tenant_id, id_folio),
  constraint cargos_folio_fk_concepto_fkey
    foreign key (tenant_id, fk_concepto) references public.conceptos (tenant_id, id_concepto),
  constraint cargos_folio_fk_usuario_fkey
    foreign key (tenant_id, fk_usuario) references public.usuario (tenant_id, id_usuario)
);

-- ─── Facturacion ─────────────────────────────────────────────────────────────

create table public.factura_secuencia (
  tenant_id           bigint not null default public.current_tenant_id() references public.tenants (id),
  fk_establecimientos bigint not null,
  fk_tipo_factura     bigint not null references public.tipo_factura (id_tipo_factura),
  ultimo              bigint not null default 0,
  primary key (fk_establecimientos, fk_tipo_factura),
  constraint factura_secuencia_fk_establecimientos_fkey
    foreign key (tenant_id, fk_establecimientos) references public.establecimientos (tenant_id, id_establecimiento)
);

create table public.facturas (
  id_factura          bigint generated always as identity primary key,
  tenant_id           bigint not null default public.current_tenant_id() references public.tenants (id),
  fecha_emision       timestamptz not null default now(),
  fk_cliente          bigint not null,
  condicion_venta     smallint not null,
  total_gravado_10    numeric not null,
  total_gravado_5     numeric not null,
  total_exenta        numeric not null,
  total_iva           numeric not null,
  total_general       numeric not null,
  observacion         text not null,
  fk_monedas          bigint not null references public.monedas (id_monedas),
  fk_establecimientos bigint not null,
  fk_modo_pago        bigint not null references public.modo_pago (id_modo_pago),
  fk_tipo_factura     bigint not null references public.tipo_factura (id_tipo_factura),
  nro_secuencial      bigint not null,
  fk_turno            bigint not null,
  tipo_emision        smallint,
  fk_motivo           smallint references public.motivos_emision (id_motivos),
  fk_factura_asociada bigint,
  efectivo            numeric not null,
  vuelto              numeric not null,
  descuento_global    numeric not null default 0,
  fk_inmueble         bigint not null,
  fk_folio            bigint,
  estado              text not null default 'EMITIDA' check (estado in ('EMITIDA', 'ANULADA')),
  constraint facturas_tenant_id_key unique (tenant_id, id_factura),
  constraint facturas_fk_cliente_fkey
    foreign key (tenant_id, fk_cliente) references public.clientes (tenant_id, id_cliente),
  constraint facturas_fk_establecimientos_fkey
    foreign key (tenant_id, fk_establecimientos) references public.establecimientos (tenant_id, id_establecimiento),
  constraint facturas_fk_turno_fkey
    foreign key (tenant_id, fk_turno) references public.apertura_cierre_caja (tenant_id, id_turno),
  constraint facturas_fk_factura_asociada_fkey
    foreign key (tenant_id, fk_factura_asociada) references public.facturas (tenant_id, id_factura),
  constraint facturas_fk_folio_fkey
    foreign key (tenant_id, fk_folio) references public.folios (tenant_id, id_folio)
);

create index facturas_fecha_idx on public.facturas (tenant_id, fecha_emision desc);

-- La numeracion es un invariante fiscal: nunca dos facturas con el mismo numero
-- para un mismo establecimiento y tipo (implica el tenant).
create unique index facturas_numero_key
  on public.facturas (fk_establecimientos, fk_tipo_factura, nro_secuencial);

create table public.detalle_factura (
  id_detalle    bigint generated always as identity primary key,
  tenant_id     bigint not null default public.current_tenant_id() references public.tenants (id),
  created_at    timestamptz not null default now(),
  fk_factura    bigint,
  fk_concepto   bigint not null,
  monto         numeric not null,
  descripcion   text not null,
  iva_aplicado  integer not null,
  subtotal      numeric not null,
  estado        text not null,
  cantidad      double precision not null,
  fk_cargo_folio bigint,
  constraint detalle_factura_fk_concepto_fkey
    foreign key (tenant_id, fk_concepto) references public.conceptos (tenant_id, id_concepto),
  constraint detalle_factura_fk_factura_fkey
    foreign key (tenant_id, fk_factura) references public.facturas (tenant_id, id_factura),
  constraint detalle_factura_fk_cargo_folio_fkey
    foreign key (tenant_id, fk_cargo_folio) references public.cargos_folio (tenant_id, id_cargo)
);

create table public.datos_factura_sifen (
  id               bigint generated always as identity primary key,
  tenant_id        bigint not null default public.current_tenant_id() references public.tenants (id),
  fecha_firma      timestamptz not null default now(),
  fk_factura       bigint not null,
  codigo_seguridad text not null,
  codigo_control   text,
  xml_url          text,
  enlace_qr        text,
  json_sifen       jsonb,
  cdc              text,
  estado_cdc       integer,
  constraint datos_factura_sifen_fk_factura_fkey
    foreign key (tenant_id, fk_factura) references public.facturas (tenant_id, id_factura)
);

-- ─── Notificaciones ──────────────────────────────────────────────────────────

create table public.notificacion (
  id_notificacion bigint generated always as identity primary key,
  tenant_id       bigint not null default public.current_tenant_id() references public.tenants (id),
  created_at      timestamptz not null default now(),
  fk_usuario      bigint not null,
  tipo            text not null,
  titulo          text not null,
  cuerpo          text,
  fk_habitacion   bigint,
  leida           boolean not null default false,
  leida_at        timestamptz,
  constraint notificacion_fk_usuario_fkey
    foreign key (tenant_id, fk_usuario) references public.usuario (tenant_id, id_usuario) on delete cascade,
  constraint notificacion_fk_habitacion_fkey
    foreign key (tenant_id, fk_habitacion) references public.habitaciones (tenant_id, id) on delete cascade
);

create index notificacion_bandeja_idx on public.notificacion (fk_usuario, leida, created_at desc);

-- ─── Indices para cada FK compuesta ──────────────────────────────────────────
-- Postgres no indexa solo las columnas referenciantes. Se crea un indice por
-- cada FK de una tabla con tenant_id, con `tenant_id` al frente, que es lo que
-- usan tanto el filtro de RLS como los joins y los borrados.
do $$
declare
  r record;
begin
  for r in
    select c.conrelid::regclass as tabla,
           c.conname,
           (
             select string_agg(quote_ident(a.attname), ', ' order by k.ord)
             from unnest(c.conkey) with ordinality as k(attnum, ord)
             join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
           ) as columnas
    from pg_constraint c
    join pg_namespace n on n.oid = c.connamespace
    where c.contype = 'f'
      and n.nspname = 'public'
      and exists (
        select 1 from pg_attribute t
        where t.attrelid = c.conrelid and t.attname = 'tenant_id' and not t.attisdropped
      )
      and c.conrelid::regclass::text <> 'tenants'
  loop
    execute format(
      'create index if not exists %I on %s (%s)',
      left('ix_' || r.conname, 63), r.tabla, r.columnas
    );
  end loop;
end;
$$;
