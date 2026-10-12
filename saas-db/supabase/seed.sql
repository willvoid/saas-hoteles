-- ═══════════════════════════════════════════════════════════════════════════
-- Siembra minima de catalogos (SOLO desarrollo / respaldo)
-- ═══════════════════════════════════════════════════════════════════════════
-- Deja la base utilizable de punta a punta: sin estos datos fn_provision_tenant
-- no puede dar de alta un tenant (necesita el cargo de administrador, un
-- barrio, un tipo de documento, etc.).
--
-- Para produccion conviene cargar los catalogos reales exportados del
-- proyecto anterior (ver README) y no este seed. Es idempotente y no pisa
-- filas que ya existan.
-- ═══════════════════════════════════════════════════════════════════════════

-- Cargos. Los nombres que reconocen el frontend y las policies estan en
-- src/utils/permissions.ts; un alias existente evita duplicar el cargo.
insert into public.cargo (cargo, descripcion_cargo)
select v.cargo, v.descripcion_cargo
from (values
  ('Admin',         'Administrador del sistema',      array['admin', 'administrador']),
  ('Gerente',       'Gerencia del establecimiento',   array['gerente']),
  ('Recepcionista', 'Recepción y atención al huésped', array['recepcionista']),
  ('Limpiador',     'Limpieza de habitaciones',       array['limpiador', 'limpiadora'])
) as v(cargo, descripcion_cargo, alias)
where not exists (
  select 1 from public.cargo c where lower(trim(c.cargo)) = any (v.alias)
);

insert into public.tipo_documento (cod_tipodoc, descripcion_tipodoc) values
  (1, 'Cédula de identidad'),
  (2, 'Pasaporte'),
  (3, 'RUC')
on conflict (cod_tipodoc) do nothing;

insert into public.tipo_contribuyente (codigo_contribuyente, descripcion)
select v.codigo, v.descripcion
from (values (1, 'Persona física'), (2, 'Persona jurídica')) as v(codigo, descripcion)
where not exists (
  select 1 from public.tipo_contribuyente c where c.codigo_contribuyente = v.codigo
);

insert into public.tipo_regimen (codigo_regimen, descripcion)
select 1, 'Régimen general'
where not exists (select 1 from public.tipo_regimen where codigo_regimen = 1);

-- Geografia minima (un solo barrio) para poder crear establecimientos.
insert into public.paises (pais, pais_descripcion)
select 'Paraguay', 'República del Paraguay'
where not exists (select 1 from public.paises where pais = 'Paraguay');

insert into public.departamentos (cod_depto, nombre_depto, fk_pais)
select 1, 'Central', p.id_pais from public.paises p where p.pais = 'Paraguay'
on conflict (cod_depto) do nothing;

insert into public.distritos (cod_distrito, nombre_distrito, fk_depto)
values (1, 'Asunción', 1)
on conflict (cod_distrito) do nothing;

insert into public.ciudades (cod_ciudades, nombre_ciudad, fk_distrito)
values (1, 'Asunción', 1)
on conflict (cod_ciudades) do nothing;

insert into public.barrios (cod_barrio, nombre_barrio, fk_ciudad)
values (1, 'Centro', 1)
on conflict (cod_barrio) do nothing;

insert into public.iva (valor, descripcion)
select v.valor, v.descripcion
from (values (0, 'Exenta'), (5, 'IVA 5%'), (10, 'IVA 10%')) as v(valor, descripcion)
where not exists (select 1 from public.iva i where i.valor = v.valor);

insert into public.unidades_medida (cod_unidades_medida, representacion, descripcion)
select 77, 'UNI', 'Unidad'
where not exists (select 1 from public.unidades_medida where cod_unidades_medida = 77);

-- Moneda operativa: guarani (ISO 600, sin decimales, cotizacion 1).
insert into public.monedas (cod_moneda, num, dec, divisa, cotizacion_gs)
select 600, 600, 0, 'PYG', 1
where not exists (select 1 from public.monedas where upper(divisa) in ('PYG', 'GS'));

insert into public.tipo_factura (descripcion)
select 'Ticket interno'
where not exists (select 1 from public.tipo_factura where descripcion = 'Ticket interno');

insert into public.modo_pago (descripcion)
select v.descripcion
from (values ('Efectivo'), ('Tarjeta'), ('Transferencia')) as v(descripcion)
where not exists (select 1 from public.modo_pago m where m.descripcion = v.descripcion);

insert into public.motivos_emision (descripcion)
select 'Anulación'
where not exists (select 1 from public.motivos_emision where descripcion = 'Anulación');

-- Tipos de operacion (B2B, B2C, B2G, B2F). El frontend (CreateClient.tsx) crea
-- los clientes con fk_tipo_operacion = 2 por defecto, que debe corresponder a
-- B2C: en una base vacia los ids de identidad salen 1..4 en este orden. Si
-- cargaste catalogos reales del proyecto anterior, no uses este bloque.
insert into public.tipo_operacion (codigo_tipo_op)
select v.codigo
from (values ('B2B'), ('B2C'), ('B2G'), ('B2F')) as v(codigo)
where not exists (select 1 from public.tipo_operacion t where t.codigo_tipo_op = v.codigo);
