# saas-db: base de datos multi-tenant

Esquema de Supabase para el SaaS del PMS hotelero. Cada hotel cliente es un
**tenant** (`tenants`), aislado de los demas por RLS. Este directorio es su
propia raiz de CLI: las migraciones de `../supabase/` pertenecen al proyecto
anterior (single-tenant) y no deben correr contra el proyecto nuevo.

## Estructura

```
supabase/migrations/
  0001_tenants_y_claims      tenants y current_tenant_id() (claim del JWT)
  0002_catalogos_globales    18 catalogos compartidos, solo lectura para el cliente
  0003_tablas_tenant         33 tablas con tenant_id, FK compuestas, indices
  0004_helpers_rol           identidad, rol y estado del tenant
  0005_funciones_triggers    triggers y funciones tenant-aware
  0006_rls                   policies generadas desde una tabla de reglas
  0007_realtime              publicacion de Realtime
  0008_provisioning          fn_provision_tenant (alta de un hotel)
  0009_rpc_publicas          RPC con p_slug para la landing (unica entrada de anon)
  0010_storage               buckets y policies por prefijo de tenant
  0011_privilegios           privilegios minimos y EXECUTE de cada funcion
  0012_guardas_ddl           event trigger: RLS en tablas nuevas, sin EXECUTE en funciones nuevas
  0013_multi_hotel           una cuenta, varios hoteles (un perfil por hotel) y fn_mis_hoteles
  0014_planes_suscripcion    planes, topes, modulos, solo lectura al vencer, fn_activar_plan
  0015_registro_publico      rate limit y RPC publicas del alta de hoteles
  0016_contabilidad_base     base de partida doble: fn_contabilizar, asiento_secuencia, RLS admin/gerente
  0017_plan_cuentas_hotelero plan de cuentas hotelero, categorias_finanzas y backfill
  0018_fondos_facturas_credito  fondos (caja, banco), facturas a credito y su asiento
  0019_gastos_cobros_pagos   proveedores, gastos, cobros, pagos, transferencias, saldos iniciales
  0020_cierre_mensual        cierre y reapertura de meses (fn_cerrar_mes / fn_reabrir_mes)
  0021_reportes_finanzas     RPC de reportes de finanzas (fn_rep_*)
supabase/seed.sql            catalogos minimos (solo desarrollo / respaldo)
tests/aislamiento.sql        suite de aislamiento entre dos tenants (incluye finanzas)
tests/planes.sql             suite de planes y suscripciones
tests/finanzas.sql           suite del modulo de finanzas (contabilizacion, cierre, reportes)
tests/registro_publico.sql   suite del alta publica de hoteles
```

## Puesta en marcha

1. Crear el proyecto en Supabase.
2. En Authentication: **deshabilitar el registro directo** ("Allow new users to
   sign up"), activar la confirmacion de correo y configurar SMTP propio. El
   alta de hoteles pasa por una edge function con service_role, no por `signUp`.
3. Desde `saas-db/`: `supabase init` (genera `config.toml`), `supabase link
   --project-ref <ref>` y `supabase db push`.
4. Cargar los catalogos (ver abajo).
5. Opcional: cargar plan de cuentas y conceptos de ejemplo en el tenant
   `plantilla-base`; `fn_provision_tenant` los copia a cada hotel nuevo.

### Catalogos reales del proyecto anterior

`seed.sql` solo deja una base utilizable (un cargo por rol, un barrio, IVA,
guarani...). Para produccion exportar los datos reales del proyecto viejo:

```bash
pg_dump "$OLD_DATABASE_URL" --data-only --column-inserts --rows-per-insert=100 \
  -t public.paises -t public.departamentos -t public.distritos -t public.ciudades \
  -t public.barrios -t public.iva -t public.monedas -t public.tipo_factura \
  -t public.modo_pago -t public.tipo_operacion -t public.tipo_documento \
  -t public.tipo_contribuyente -t public.tipo_regimen -t public.unidades_medida \
  -t public.tipo_cuenta_contable -t public.motivos_emision -t public.cargo \
  > catalogos.sql
```

`actividad_economica` se omite: el frontend no la usa y la columna `es_principal`
paso a `actividad_empresa`. Despues de cargar, reajustar las secuencias de
identidad (por ejemplo `select setval(pg_get_serial_sequence('public.iva','id_iva'), (select max(id_iva) from public.iva))`
para cada catalogo con identidad) y verificar que existan los cargos
`admin`/`administrador`, `gerente`, `recepcionista` y `limpiador`/`limpiadora`:
`fn_provision_tenant` los necesita.

## Como funciona el aislamiento

- `tenant_id` viaja en el JWT como `app_metadata.tenant_id`, que solo escribe
  el servidor. `current_tenant_id()` lo lee sin consultar tablas.
- Las 33 tablas del tenant tienen `tenant_id NOT NULL DEFAULT current_tenant_id()`:
  los inserts del frontend no necesitan mandarlo, y las policies exigen que
  coincida con el del usuario.
- Cada padre expone `UNIQUE (tenant_id, id)` y cada hijo lo referencia con una
  FK compuesta: una fila no puede apuntar a datos de otro tenant.
- Un tenant `suspendido` deja sin acceso a todo su personal
  (`current_usuario_activo()` lo comprueba en un solo lugar).
- `anon` no tiene acceso a ninguna tabla. La landing usa `fn_landing_catalogo`,
  `fn_landing_ocupacion` y `fn_registrar_reserva_landing`, que reciben el slug.
- Los catalogos son globales: el cliente solo los lee.

## Reglas para extender

- **Tabla nueva del tenant:** `tenant_id` con el mismo default, `UNIQUE (tenant_id, <pk>)`,
  FK compuestas hacia otras tablas del tenant, y sus policies en una migracion
  nueva con el mismo patron que 0006. El event trigger de 0012 habilita RLS en
  cada tabla nueva (sin policies nadie accede hasta que se escriban) y le quita
  acceso a anon y TRUNCATE a authenticated. Si el rol que aplica las migraciones
  no pudo crearlo, 0012 lo avisa con un WARNING y la convencion es manual.
- **Funcion o trigger que inserta filas:** copiar `tenant_id` de `NEW` o de un
  parametro; no depender del default (en pg_cron, service_role y las funciones
  anonimas no hay JWT).
- **Funcion nueva:** nace sin EXECUTE para nadie (0012). Hay que hacer el `grant`
  explicito, tambien despues de un `CREATE OR REPLACE`, que dispara la guarda de
  nuevo (ver 0011).
- **Cargo nuevo:** `current_puede_operar()` usa una lista cerrada (admin,
  administrador, gerente, recepcionista). Un cargo que no este en ella solo lee;
  sumarlo en 0004 y en `src/utils/permissions.ts`.
- **Storage:** rutas `{tenant_id}/{id_dueno}/{archivo}`; guardar la ruta relativa.

## Flujos de servidor que consumen esta base (edge functions)

- **register-tenant (implementada):** alta publica. Valida Cloudflare Turnstile,
  aplica rate limit (`fn_registro_rate_limit`, migracion 0015: 5/hora por IP y
  3/hora por correo), crea la cuenta de Auth sin confirmar, ejecuta
  `fn_provision_tenant` (hotel en trial de 30 dias) y, si falla, borra la cuenta.
  Envia el correo de confirmacion con `auth.resend`. Responde igual si el correo
  ya existe (sin enumeracion de cuentas). Despliegue:
  `supabase functions deploy register-tenant --use-api --no-verify-jwt` y
  `supabase secrets set TURNSTILE_SECRET=...`. Frontend: `VITE_TURNSTILE_SITE_KEY`
  (clave publica) y `VITE_WHATSAPP_NUMBER` (opcional, boton de contacto).
  La landing lee los planes con `fn_planes_publicos()` y el wizard los catalogos
  con `fn_catalogos_registro()` / `fn_ubicaciones_registro()`: todas publicas
  (anon) y solo lectura. Sin ejecutar contra un stack real de Supabase todavia.
- **admin-create-user (implementada):** deriva el tenant del llamador (nunca del
  body) y crea la cuenta con `auth.admin.createUser` con
  `app_metadata = { tenant_id, fk_cargo }` y
  `user_metadata = { nombre, documento, telefono, usuario, fk_tipo_doc }`. El
  trigger `handle_new_user` crea el perfil. Valida que el llamador este activo y
  que un gerente no asigne el cargo de administrador. Detalle abajo.
- **switch-hotel / create-hotel (implementadas):** cambian el hotel activo de la
  cuenta y crean un hotel nuevo. Ver "Multi-hotel".

### admin-create-user

Codigo en `supabase/functions/admin-create-user/` (`index.ts` es la funcion;
`validation.ts` tiene las reglas puras y `validation.test.ts` sus tests, que
corren con `npm test` desde la raiz del repo).

**Que hace, en orden:**

1. Autentica al llamador con su JWT.
2. Toma el `tenant_id` de la claim `app_metadata` del JWT y le pregunta a la base
   por su rol con `current_user_role()` (0004), que devuelve `null` si el perfil
   esta inactivo o el tenant suspendido. Solo `admin`, `administrador` y
   `gerente` pasan.
3. Valida el body con las mismas reglas que `UsuarioForm.tsx`. Cualquier campo
   que no sea de la lista (por ejemplo un `tenant_id`) se ignora.
4. Verifica el cargo: debe existir, ser de personal y un gerente no puede asignar
   `admin`/`administrador`. `guard_cargo_admin` (0005) no se dispara con
   `service_role`, por eso la comprobacion vive tambien en la funcion.
5. Rechaza correo duplicado (unico global) y `usuario` duplicado dentro del
   tenant. El trigger renombra un handle repetido en silencio, asi que el
   duplicado hay que rechazarlo antes.
6. Crea la cuenta con `email_confirm: true` y comprueba que el trigger creo el
   perfil en ese tenant. Si algo falla despues de crear la cuenta de Auth, la
   borra.

`email_confirm: true` significa que **no se envia correo de confirmacion**: el
administrador define la clave y la cuenta queda lista. (`signUp` enviaria el
correo, pero exige el registro directo habilitado y no puede escribir
`app_metadata`.)

**Contrato:** `POST` con `Authorization: Bearer <jwt del usuario>`.

```json
{
  "correo": "ana@hotel.com", "clave": "secreto123", "nombre": "Ana Gomez",
  "documento": "1234567", "telefono": "+595 981 123456",
  "usuario": "ana_gomez", "fk_tipo_doc": 1, "fk_cargo": 3
}
```

`telefono` es opcional (`null` o vacio). Respuesta correcta: `201 { "ok": true, "id": "<uuid de Auth>" }`.
Error: `{ "error": "<mensaje en espanol>" }` con estos estados:

| Estado | Causa |
|---|---|
| 400 | body invalido, campo faltante o con formato incorrecto, cargo o tipo de documento inexistente |
| 401 | sin token o sesion invalida |
| 403 | cuenta sin hotel, rol sin permiso, o gerente asignando el cargo de administrador |
| 405 | metodo distinto de `POST` |
| 409 | correo o `usuario` ya existentes |
| 429 | limite de Auth |
| 500 | fallo interno (se revierte la cuenta de Auth si ya se habia creado) |

**Despliegue** (desde `saas-db/`, con el proyecto enlazado):

```bash
supabase functions deploy admin-create-user
```

Secretos: `SUPABASE_URL`, `SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` los
inyecta el runtime de Supabase; no hay que cargarlos ni escribirlos en el
codigo. Opcional: `supabase secrets set ALLOWED_ORIGIN=https://tu-sitio.com`
para limitar CORS (por defecto `*`; la autenticacion es por bearer token).
`verify_jwt` queda activo por defecto.

**Prueba local** (requiere Docker):

```bash
supabase start
supabase functions serve admin-create-user
```

Luego iniciar sesion en la app apuntando `VITE_SUPABASE_URL` al stack local
(`http://127.0.0.1:54321`) con un administrador de un tenant de prueba, y crear
un usuario desde la pantalla "Usuarios": la app llama a la funcion con
`supabase.functions.invoke`. Esta funcion **no se probo contra un proyecto de
Supabase** al escribirse: los tests cubren solo `validation.ts`.

## Multi-hotel

Una misma cuenta de Auth puede tener acceso a varios hoteles, como el selector de
empresas de FacturaSend: tras el login se lista cada hotel como una tarjeta, una
tarjeta "+" crea otro y al elegir una se entra a su panel.

**Modelo.** Cada hotel de la cuenta es un perfil `usuario` propio (con su cargo),
unico por `(auth_id, tenant_id)`. El hotel **activo** sigue siendo
`app_metadata.tenant_id` del JWT: `current_tenant_id()`, las policies y los
helpers no cambian. Un cargo rige solo dentro de su hotel: `current_user_role()`
mira unicamente el perfil del hotel activo (antes tomaba cualquiera de la
cuenta, lo que habria dejado heredar un cargo de un hotel en otro).

| Pieza | Que hace |
|---|---|
| `fn_mis_hoteles()` | Lista los hoteles de la cuenta (cargo, estado y cual es el activo). Oculta la plantilla. Solo `authenticated`. |
| `current_es_miembro()` | La cuenta tiene un perfil activo en algun hotel no suspendido. Con `current_usuario_activo()` decide quien lee los catalogos, para poder elegir otro hotel si el activo esta suspendido. |
| `switch-hotel` | Valida que la cuenta tenga un perfil activo en el hotel pedido y que no este suspendido; escribe `app_metadata.tenant_id` con la admin API. `{ "tenant_id": 7 }` -> `{ "ok": true }`. |
| `create-hotel` | Crea un hotel con `fn_provision_tenant`, con la cuenta como administradora (el `auth_id` siempre es el del llamador). Devuelve `201 { "ok": true, "tenant_id": 8 }`. |

Despues de `switch-hotel` o `create-hotel` el cliente llama a
`supabase.auth.refreshSession()` para recibir un token con el hotel nuevo.
`create-hotel` deja el hotel creado como activo (lo hace `fn_provision_tenant`).

**Reglas de `create-hotel`:** solo puede crear hoteles una cuenta que sea
administradora en todos los suyos (o que aun no tenga ninguno), asi el personal
creado por un hotel no abre hoteles de prueba; el maximo de hoteles por
cuenta lo fija el plan (`fn_max_hoteles_cuenta()`); el RUC es unico entre todos los hoteles y el
identificador (slug) no puede estar reservado ni en uso.

**Despliegue:** `supabase db push` para 0013 y, desde `saas-db/`:

```bash
supabase functions deploy switch-hotel --use-api
supabase functions deploy create-hotel --use-api
```

Ambas usan `supabase/functions/_shared/` (se despliega junto con la funcion) y los
secretos que inyecta el runtime, igual que `admin-create-user`. Despues de
aplicar 0013 hay que volver a desplegar `admin-create-user`: ahora acota la
busqueda del perfil por hotel.

**Limites a tener presentes:**

- El hotel activo es de **toda la cuenta**: otra pestana o dispositivo pasa al
  hotel nuevo en su proximo refresco de token.
- Quitar a alguien de un hotel es poner su perfil en `Inactivo` en ese hotel. Borrar
  la cuenta de Auth desactiva **todos** sus perfiles (`handle_deleted_user`).
- Una cuenta sin ningun hotel no puede crear el primero desde la app (no lee los
  catalogos): el primer hotel se crea en el alta publica (`register-tenant`).
- `admin-create-user` sigue respondiendo 409 si el correo ya existe: no suma una
  cuenta existente a otro hotel.

## Planes y suscripciones

La suscripcion es **por hotel** (`tenants`). Catalogo en `planes` (legible por
`authenticated`, sin escritura); un tope `null` es ilimitado.

| Plan | Mensual (PYG) | Anual | Habitaciones | Usuarios | Hoteles/cuenta | Contabilidad | SIFEN |
|---|---|---|---|---|---|---|---|
| `trial` (30 dias, no se ofrece) | 0 | 0 | 60 | 15 | 1 | si | si |
| `basico` | 150.000 | 1.500.000 | 20 | 3 | 1 | no | no |
| `pro` | 350.000 | 3.500.000 | 60 | 15 | 5 | si | si |
| `business` | 800.000 | 8.000.000 | ilimitado | ilimitado | ilimitado | si | si |
| `plantilla` (interno) | - | - | ilimitado | ilimitado | ilimitado | si | si |

- **Topes de altas:** triggers `BEFORE INSERT` en `habitaciones` y `usuario`
  rechazan el alta que pase el tope (SQLSTATE `23514`). Cuentan todas las filas
  del hotel, activas o no, y serializan con un lock de la fila de `tenants`.
- **Solo lectura al vencer:** policies `RESTRICTIVE` de INSERT/UPDATE/DELETE en las
  tablas del tenant exigen `fn_suscripcion_vigente(current_tenant_id())`: trial con
  `trial_fin >= hoy`, o `estado = 'activo'` con `vigente_hasta >= hoy`. El SELECT,
  el login y `switch-hotel` no se tocan. Las funciones definer saltan RLS.
- **Modulos:** escritura en `cuentas_contables`, `asientos`, `detalle_asientos`,
  `saldos_mensuales` y, desde 0018/0019, en `cuentas_fondos`, `medios_pago_fondo`,
  `categorias_finanzas`, `proveedores`, `gastos`, `cobros`, `pagos`,
  `transferencias_fondos` y `saldos_iniciales_fondos` exige `mod_contabilidad`
  (ver "Finanzas"); en `timbrados` y `datos_factura_sifen`, `mod_sifen`. Las
  lecturas, incluidos los reportes `fn_rep_*`, no se bloquean.
- **Hoteles por cuenta:** `fn_max_hoteles_cuenta()` (usa `auth.uid()`, hay que
  llamarla con el JWT del usuario) da el mayor tope entre los hoteles que la cuenta
  administra; `null` es ilimitado. `create-hotel` la consume con el cliente que lleva el
  JWT del usuario.
- **Cobro manual:** el operador (service_role o rol postgres) ejecuta
  `select fn_activar_plan(<tenant>, 'pro', 'mensual', null, '<referencia>')`. Deja el
  hotel `activo`, extiende `vigente_hasta` 1 o 12 meses desde lo que quede de
  vigencia y registra el cobro en `pagos_suscripcion` (sin acceso para clientes).
  Con `p_monto` null toma el precio de lista.
- **Migracion de datos:** planes desconocidos pasan a `trial`; los trials sin fecha de
  fin reciben 30 dias y los hoteles `activo` sin `vigente_hasta` reciben 30 dias de gracia.
- **Limites a tener presentes:** los perfiles inactivos cuentan para el tope de
  usuarios; la landing publica (RPC definer) sigue aceptando reservas de un hotel
  vencido mientras su estado sea `trial`/`activo`; Storage no se bloquea por
  vencimiento; las fechas usan `current_date` del servidor (UTC en Supabase).

## Finanzas

Contabilidad simple para el hotel (ingresos, egresos, cuentas por cobrar y por
pagar, fondos, cierre mensual y reportes) construida sobre la partida doble que
ya existia (`cuentas_contables`, `asientos`, `detalle_asientos`). La interfaz oculta
debe/haber: el usuario ve gastos, cobros, pagos y fondos, y los triggers escriben
los asientos en la misma transaccion del documento. Migraciones 0016 a 0021.

- **Quien:** solo admin y gerente. Las tablas contables y las de finanzas usan la
  regla `admin_gerente_total` (0006): leer y escribir. Recepcion puede emitir una
  factura a credito pero no ve saldos ni cobra; `asiento_secuencia` es la unica
  excepcion de lectura (un contador, lo lee cualquier usuario activo del hotel).
- **Plan:** escribir exige `mod_contabilidad` y suscripcion vigente (policies
  `RESTRICTIVE` de 0014/0018/0019); facturar a credito tambien exige el modulo. Los asientos
  se generan tambien en `basico` (si el hotel sube de plan no pierde historia),
  pero un hotel que baja a `basico` no registra cobros ni pagos. **Las lecturas
  nunca se bloquean:** tras una baja de plan siguen funcionando los reportes.
- **Desde cuando:** el libro arranca en la fecha de activacion; las facturas
  anteriores no se contabilizan. `saldos_mensuales` queda sin uso: los saldos se
  calculan siempre desde `detalle_asientos`.
- **Hora:** el dia contable es `America/Asuncion`, nunca el UTC del servidor. El
  asiento de un documento lleva su fecha (mediodia local); el reverso de una anulacion, el dia
  de la anulacion.

### Tablas

| Migracion | Tablas y funciones |
|---|---|
| 0016 | `cuentas_contables` (`clave` de sistema, `activo`), `asientos` (numero unico por hotel con `asiento_secuencia`), `detalle_asientos` (constraint trigger diferido: debe = haber), `fn_contabilizar` y `fn_contabilizar_reverso` (definer, **sin EXECUTE**) |
| 0017 | `tipo_cuenta_contable`, plan de cuentas hotelero en `plantilla-base` (copiado a cada hotel nuevo y rellenado a los existentes), `categorias_finanzas` (una por cuenta de ingreso/egreso) |
| 0018 | `cuentas_fondos` (caja de turno, caja chica, banco; cada una con su cuenta hija de 1.1.01 Disponibilidades), `medios_pago_fondo` (modo de pago -> fondo), `facturas.fecha_vencimiento` / `saldo_pendiente`, `fk_modo_pago` nullable (credito) |
| 0019 | `proveedores`, `gastos`, `cobros`, `pagos`, `transferencias_fondos`, `saldos_iniciales_fondos` |
| 0020 | `periodos_cerrados`, `fn_cerrar_mes(anio, mes)`, `fn_reabrir_mes(anio, mes)` |
| 0021 | RPC de reportes `fn_rep_*` |

Los documentos (`gastos`, `cobros`, `pagos`, `transferencias_fondos`,
`saldos_iniciales_fondos`) nacen `REGISTRADO`, no se borran y no se editan salvo
campos descriptivos: se anulan (`ANULADO`) y se cargan de nuevo. Los importes
(`iva_*`, `total`, `saldo_pendiente`) los calcula el trigger, no el cliente.

### Contabilizacion por evento

El IVA esta incluido en los montos. En facturas `iva5 = round(gravado_5 / 21)` e
`iva10 = total_iva - iva5`; en gastos `iva_10 = round(gravado_10 / 11)`.

| Evento | Debe | Haber |
|---|---|---|
| Factura de contado | Fondo (segun el modo de pago; sin mapa, el de la caja del turno) | `VENTAS_10`, `VENTAS_5`, `VENTAS_EXENTAS` (sin IVA) e `IVA_DEBITO` |
| Factura a credito | `CXC_CLIENTES` (`saldo_pendiente = total`) | igual que la de contado |
| Cobro | Fondo | `CXC_CLIENTES` (baja el saldo; rechaza monto > saldo) |
| Gasto de contado | Cuenta de la categoria (sin IVA) e `IVA_CREDITO` | Fondo que pago |
| Gasto a credito | Cuenta de la categoria e `IVA_CREDITO` | `CXP_PROVEEDORES` (`saldo_pendiente = total`) |
| Pago | `CXP_PROVEEDORES` | Fondo |
| Transferencia | Fondo destino | Fondo origen |
| Saldo inicial | Fondo | `SALDOS_INICIALES` |
| Anulacion | asiento inverso; original y reverso quedan `ANULADO` | saldo restaurado (cobro, pago) o en cero (gasto, factura) |

Anular una factura o un gasto se bloquea mientras tenga cobros o pagos activos.
Un error de contabilizacion (por ejemplo falta una cuenta de sistema) aborta el
documento con un mensaje en espanol: el backfill y los fondos autocreados
(`fn_asegurar_fondos_cajas`) existen para que un hotel no quede sin cuentas.

### Cierre mensual

El admin cierra y reabre meses con `fn_cerrar_mes` / `fn_reabrir_mes` (no hay cierre
de ejercicio). Con un mes cerrado, el trigger `a00_periodo_cerrado` rechaza (`55000`,
"El periodo YYYY-MM esta cerrado.") crear, editar, anular o borrar facturas, gastos,
cobros, pagos, transferencias, saldos iniciales, asientos y detalles con fecha en ese
mes (se revisa la fecha vieja y la nueva). Anular hoy un documento de un mes abierto
exige que el mes de hoy tambien este abierto, porque el reverso se fecha hoy. Cerrar
el mes en curso esta permitido. `periodos_cerrados` solo se escribe por las RPC.

### Reportes

RPC `security invoker`, `stable`, con `EXECUTE` solo para `authenticated`. Filtran
por `tenant_id = current_tenant_id()` y devuelven filas solo a admin y gerente
(`current_es_admin_o_gerente()`; recepcion y limpieza reciben 0 filas aunque puedan
leer facturas). Leen solo asientos `CONTABILIZADO`: los documentos anulados y sus
reversos no aparecen. Fechas y montos: `date` y `numeric` (guaranies), dia contable
`America/Asuncion`.

| RPC | Columnas |
|---|---|
| `fn_rep_resultado(p_desde date, p_hasta date)` | `mes` (primer dia), `fk_categoria`, `categoria`, `tipo` (`ingreso`/`egreso`), `monto`. Una fila por mes y categoria con movimiento; ingreso = haber - debe, egreso = debe - haber. |
| `fn_rep_cxc(p_corte date default null)` | `fk_cliente`, `cliente`, `documento`, `id_factura`, `nro`, `fecha_emision`, `fecha_vencimiento`, `total_general`, `saldo_pendiente`, `dias_vencido`, `bucket` (`vigente`, `1-30`, `31-60`, `61-90`, `+90`). Facturas a credito emitidas con saldo > 0. |
| `fn_rep_cxp(p_corte date default null)` | `fk_proveedor`, `proveedor`, `ruc`, `id_gasto`, `nro_comprobante`, `fecha`, `fecha_vencimiento`, `total`, `saldo_pendiente`, `dias_vencido`, `bucket`. Gastos a credito registrados con saldo > 0. |
| `fn_rep_flujo_fondos(p_desde date, p_hasta date)` | `fk_fondo`, `fondo`, `tipo`, `activo`, `saldo_inicial` (antes de `p_desde`), `ingresos` (debe), `egresos` (haber), `saldo_final`. Fondos activos o con movimiento hasta `p_hasta`; las transferencias cuentan como ingreso y egreso. |
| `fn_rep_movimientos_fondo(p_fondo bigint, p_desde date, p_hasta date)` | `fecha`, `nro_asiento`, `descripcion`, `origen_tipo`, `fk_origen`, `debe`, `haber`, `saldo_acumulado` (arranca del saldo del fondo antes de `p_desde`). Un fondo ajeno o inexistente no devuelve filas. |
| `fn_rep_libro_iva(p_anio integer)` | 12 filas (`mes` 1..12, con ceros): `base_ventas_10`, `base_ventas_5`, `base_ventas_exentas`, `iva_debito`, `compras_gravadas_10`, `compras_gravadas_5` (netas de IVA), `compras_exentas`, `iva_credito`, `iva_a_pagar` = debito - credito. Resumen de gestion, **no** el archivo RG 90. |

- `saldo_pendiente` de CxC y CxP es el saldo **actual**: no se reconstruye a la fecha
  de `p_corte`, que solo gobierna la antiguedad (`p_corte` null = hoy en
  `America/Asuncion`). `dias_vencido` es `p_corte - fecha_vencimiento`, 0 si aun no
  vence; sin fecha de vencimiento el documento vence el dia de su emision o fecha.
- `fn_rep_libro_iva` toma ventas e IVA del libro mayor (cuentas `VENTAS_*`,
  `IVA_DEBITO`, `IVA_CREDITO`) y las bases de compras de los gastos registrados; las
  pruebas comprueban que ambas fuentes coinciden mes a mes.

## Cambios obligatorios en el frontend

El frontend actual **no funciona sin tocarlo**. Lo que se rompe, verificado contra
`src/`:

- **Login** (`Login.tsx`): ~~llamaba a `resolve_login_email`~~. Resuelto: el login ya
  es por correo (`signInWithPassword`) y desemboca en `/hoteles`.
- **Landing:** `fn_registrar_reserva_landing` recibe `p_slug`, y las lecturas
  anonimas directas (`tipo_habitacion`, `tarifas`, `habitaciones`, `reservas`...)
  se reemplazan por `fn_landing_catalogo` y `fn_landing_ocupacion`. Hace falta
  una ruta por slug (por ejemplo `/h/{slug}`).
- **Storage** (`habitacionService.ts`): las rutas pasan a `{tenant_id}/{id}/...`.
  Sin ese prefijo la policy rechaza la subida. Solo se aceptan imagenes de hasta 5 MB.
- **Tres embeds con FK compuesta.** PostgREST solo acepta el nombre de la columna
  como pista cuando la FK es de una sola columna. Hay que nombrar la relacion por
  su constraint (los nombres siguen el patron anterior `<tabla>_<columna>_fkey`):

  | Archivo | Antes | Despues |
  |---|---|---|
  | `establecimientoService.ts:21` | `empresa:fk_empresa ( ... )` | `empresa:datos_empresa!establecimientos_fk_empresa_fkey ( ... )` |
  | `edificioService.ts:13` | `establecimiento:fk_sucursal ( ... )` | `establecimiento:establecimientos!edificios_fk_sucursal_fkey ( ... )` |
  | `pisoService.ts:13` | `edificio:fk_edificio ( ... )` | `edificio:edificios!pisos_fk_edificio_fkey ( ... )` |

  Los demas embeds con pista de columna apuntan a catalogos (FK simple) y siguen
  igual; los `usuario!apertura_cierre_caja_fk_usuario_fkey` ya usan el nombre
  de constraint y no cambian.
- **Sesion:** ~~`SessionUser` necesita el tenant~~ (resuelto: `SessionUser.tenant`).
  La pestana de edicion de `cargo` se retira (los catalogos son de solo lectura).
- **Reservas web:** `fk_usuario = 1` en `Step4Client.tsx` y `BookingContext.tsx`
  deja de usarse; la reserva se atribuye a `tenants.fk_usuario_web`.

## Diferencias con el esquema anterior

- Se elimina `usuario.clave` y `resolve_login_email`: el login es por correo.
  El handle `usuario` queda como nombre visible, unico por tenant.
- `actividad_economica.es_principal` pasa a `actividad_empresa`.
- `fn_registrar_reserva_landing(p_slug, p_payload)` recibe el slug; nuevas
  `fn_landing_catalogo` y `fn_landing_ocupacion` reemplazan las lecturas anonimas
  directas. Limites en la reserva web: 10 habitaciones, 90 noches, hasta 365 dias
  de anticipo, fecha de entrada no anterior a hoy (hora de Asuncion), huespedes
  dentro de la capacidad del tipo y hasta 10 registrados por habitacion, largo
  maximo de textos, 60 reservas web por hora y hotel, 3 pendientes por cliente.
  Un cliente existente se reutiliza pero no se modifica ni se devuelve su id: el
  contacto dado en la reserva queda en `observaciones`.
- `next_nro_secuencial` es SECURITY DEFINER y `factura_secuencia` es de solo
  lectura para el cliente; hay unicidad del numero de factura por establecimiento
  y tipo. `estado_limpieza` admite una sola fila por habitacion.
- Las cuentas de Auth se vinculan al perfil tambien cuando `app_metadata` llega
  en un UPDATE posterior al INSERT (como puede hacer la admin API). Al borrar una
  cuenta, el perfil queda inactivo y libera el correo para un reingreso.
- Un cargo no reconocido solo lee (antes operaba como recepcionista).
- `incrementar_total_folio` existe ahora (antes el frontend caia a leer y escribir).
- `cargo` y el resto de catalogos son de solo lectura para los tenants; la
  pestana de edicion de cargos del frontend debe retirarse.
- Defaults alineados con lo que escribe el frontend: `reservas.estado = 'Pendiente'`,
  `clientes.estado_cliente = 'Activo'`, `detalle_reservas.estado = 'Activo'`,
  `folios.estado = 'abierto'`. Se agregan CHECK (insensibles a mayusculas) donde el
  conjunto de valores es conocido.
- Nuevas unicidades: RUC global, codigo de establecimiento por empresa, numero de
  caja por establecimiento, `usuario` por tenant, codigo de reserva por tenant.
- `guard_cargo_admin` se instala desde el inicio y ademas impide reasignar
  `tenant_id` o `auth_id` de un perfil.
- Desde 0013 una cuenta puede tener un perfil por hotel: `usuario` es unico por
  `(auth_id, tenant_id)` y el correo por `(tenant_id, correo)`; Auth sigue
  exigiendo correo unico global. Ver "Multi-hotel".

## Decisiones abiertas

- Escritura de `timbrados`: se propone `admin_gerente` (hoy cualquier usuario activo
  escribe). Resuelto para la contabilidad en 0016: `cuentas_contables`, `asientos`,
  `detalle_asientos` y `saldos_mensuales` pasaron a `admin_gerente_total` (leen y
  escriben solo admin y gerente) y los asientos los escriben triggers definer, no el
  cliente. Ver "Finanzas".
- Vencimiento: el trial y el pago se evaluan por fecha (`fn_suscripcion_vigente`), sin cron; un hotel vencido queda en solo lectura. No hay aviso previo ni pasarela de pago: ver "Planes y suscripciones".
- **La RPC de reserva web sigue siendo publica.** Los topes de arriba acotan el
  abuso pero no lo impiden: sin captcha ni rate limit un atacante puede ocupar
  inventario con reservas Pendiente, que no vencen. Lo correcto es exponerla solo
  a traves de una edge function con captcha y limite por IP (y revocar el EXECUTE
  de `anon`), y definir si las reservas web pendientes caducan.
- **Existencia de RUC y correo:** son unicos globales, asi que un error de
  duplicado revela que ya existen. Es inherente (auth.users hace lo mismo) pero
  el alta publica debe verificar el correo y no confiar en el RUC declarado.
- Realtime no filtra por RLS los eventos DELETE: llega la clave primaria de la
  fila borrada a otros tenants (sin datos).
- `monedas` es global con cotizacion administrada por la plataforma.
- No se agregaron unicidades cuyo conjunto de datos se desconoce (`nro_secuencial`
  por establecimiento y tipo de factura). Conviene sumarlas cuando se confirme que
  el frontend no reutiliza numeros. `nro_asiento` ya es unico por hotel desde 0016
  (`asiento_secuencia`).
- `fk_inmueble` en `facturas` sigue sin FK, igual que antes; se resuelve en la fase SIFEN.
- **Hoteles de prueba sin limite real:** `create-hotel` solo topa 5 hoteles por
  cuenta. Sin captcha ni rate limit una cuenta puede encadenar altas; sumarlos
  junto con `register-tenant`.
- **Hotel activo por cuenta, no por sesion.** Un hook de access token permitiria un
  hotel distinto por sesion, a costa de que un error en el hook bloquee todos los
  logins y refrescos. Se eligio `switch-hotel` por su menor riesgo operativo.

## Pruebas

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f tests/aislamiento.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f tests/finanzas.sql
```

Requieren las migraciones 0001-0021 y `seed.sql` (`planes.sql` y
`registro_publico.sql` se corren igual). `aislamiento.sql` incluye la seccion "Una
cuenta, dos hoteles" (cargo por hotel, visibilidad, `fn_mis_hoteles`, catalogos con el
hotel activo suspendido, trigger de perfiles y alta de un hotel para una cuenta
existente) y una seccion de finanzas (B no ve ni toca las tablas contables de A,
recepcion y limpieza no leen nada, anon no entra). `finanzas.sql` cubre cada regla de
contabilizacion, el cierre mensual y los reportes contra un escenario con cifras
calculadas a mano.

Corre en una transaccion que se revierte. Insertar en `auth.users` requiere un
rol con permiso: usar una base local o de staging, no produccion.

Sin un stack de Supabase, las suites se verificaron en un PostgreSQL 17 descartable
con un esquema stub de `auth` y `storage` y los roles `anon`, `authenticated` y
`service_role`. Los scripts de ese stub **no estan en el repo**; las suites tampoco se
corrieron contra PostgREST ni contra concurrencia real.
