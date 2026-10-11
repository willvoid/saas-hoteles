-- ═══════════════════════════════════════════════════════════════════════════
-- 0002 · Catalogos globales
-- ═══════════════════════════════════════════════════════════════════════════
-- Datos de referencia compartidos por todos los tenants. Los usuarios
-- autenticados solo los leen; la escritura queda reservada a service_role
-- (las policies y los privilegios se definen en 0006 y 0011).
--
-- Cambio respecto del esquema anterior: `actividad_economica.es_principal` se
-- movio a `actividad_empresa`, porque "cual es la actividad principal" depende
-- de la empresa y no puede vivir en una tabla compartida.
-- ═══════════════════════════════════════════════════════════════════════════

create table public.paises (
  id_pais          bigint generated always as identity primary key,
  created_at       timestamptz not null default now(),
  pais             text not null,
  pais_descripcion text
);

create table public.departamentos (
  cod_depto     bigint primary key,
  created_at    timestamptz not null default now(),
  nombre_depto  text not null,
  fk_pais       bigint not null references public.paises (id_pais)
);

create table public.distritos (
  cod_distrito    bigint primary key,
  created_at      timestamptz not null default now(),
  nombre_distrito text not null,
  fk_depto        bigint not null references public.departamentos (cod_depto)
);

create table public.ciudades (
  cod_ciudades  bigint primary key,
  created_at    timestamptz not null default now(),
  nombre_ciudad text not null,
  fk_distrito   bigint not null references public.distritos (cod_distrito)
);

create table public.barrios (
  cod_barrio    bigint primary key,
  created_at    timestamptz not null default now(),
  nombre_barrio text not null,
  fk_ciudad     bigint not null references public.ciudades (cod_ciudades)
);

create table public.iva (
  id_iva      bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  valor       bigint not null,
  descripcion text not null
);

create table public.monedas (
  id_monedas    bigint generated always as identity primary key,
  created_at    timestamptz not null default now(),
  cod_moneda    bigint not null,
  num           bigint not null,
  dec           bigint not null,
  divisa        text not null,
  cotizacion_gs double precision not null
);

create table public.tipo_factura (
  id_tipo_factura smallint generated always as identity primary key,
  created_at      timestamptz not null default now(),
  descripcion     text
);

create table public.modo_pago (
  id_modo_pago bigint generated always as identity primary key,
  created_at   timestamptz not null default now(),
  descripcion  text not null
);

create table public.tipo_operacion (
  id_tipo_operacion bigint generated always as identity primary key,
  created_at        timestamptz not null default now(),
  codigo_tipo_op    text not null
);

create table public.tipo_documento (
  cod_tipodoc         bigint primary key,
  created_at          timestamptz not null default now(),
  descripcion_tipodoc text not null
);

create table public.tipo_contribuyente (
  id_tipo_contribuyente bigint generated always as identity primary key,
  created_at            timestamptz not null default now(),
  codigo_contribuyente  bigint not null,
  descripcion           text not null
);

create table public.tipo_regimen (
  id_regimen     bigint generated always as identity primary key,
  created_at     timestamptz not null default now(),
  codigo_regimen bigint not null,
  descripcion    text not null
);

create table public.unidades_medida (
  id_unidades         bigint generated always as identity primary key,
  created_at          timestamptz not null default now(),
  cod_unidades_medida bigint not null,
  representacion      text not null,
  descripcion         text not null
);

create table public.tipo_cuenta_contable (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  nombre      text not null,
  descripcion text
);

create table public.motivos_emision (
  id_motivos  smallint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  descripcion text not null
);

create table public.actividad_economica (
  id_actividad_economica          bigint generated always as identity primary key,
  created_at                      timestamptz not null default now(),
  codigo_activity                 bigint not null,
  descripcion_actividad_economica text not null
);

-- Roles de usuario. Los nombres que reconoce el frontend (normalizeRole en
-- src/utils/permissions.ts) y las policies son: admin/administrador, gerente,
-- recepcionista, limpiador/limpiadora.
create table public.cargo (
  id_cargo          bigint generated always as identity primary key,
  created_at        timestamptz not null default now(),
  cargo             text not null,
  descripcion_cargo text not null
);

create unique index cargo_nombre_key on public.cargo (lower(trim(cargo)));
