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
supabase/seed.sql            catalogos minimos (solo desarrollo / respaldo)
tests/aislamiento.sql        suite de aislamiento entre dos tenants
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

- **register-tenant (pendiente):** crear la cuenta de Auth del administrador con la admin
  API (sin tenant) -> `select fn_provision_tenant(<payload>)` -> si falla, borrar
  la cuenta de Auth. Necesita captcha, rate limit y verificacion de correo. El
  payload esta documentado en el encabezado de 0008.
- **admin-create-user (implementada):** deriva el tenant del llamador (nunca del
  body) y crea la cuenta con `auth.admin.createUser` con
  `app_metadata = { tenant_id, fk_cargo }` y
  `user_metadata = { nombre, documento, telefono, usuario, fk_tipo_doc }`. El
  trigger `handle_new_user` crea el perfil. Valida que el llamador este activo y
  que un gerente no asigne el cargo de administrador. Detalle abajo.

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

## Cambios obligatorios en el frontend

El frontend actual **no funciona sin tocarlo**. Lo que se rompe, verificado contra
`src/`:

- **Login** (`Login.tsx`): llama a `resolve_login_email`, que ya no existe. El
  login pasa a ser por correo.
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
- **Sesion:** `SessionUser` necesita el tenant. La pestana de edicion de `cargo`
  se retira (los catalogos son de solo lectura).
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

## Decisiones abiertas

- Escritura de `timbrados`, `cuentas_contables`, `asientos`, `detalle_asientos` y
  `saldos_mensuales`: se propone `admin_gerente` (hoy cualquier usuario activo escribe).
- `tenants.trial_fin` es informativo: la base no bloquea un trial vencido.
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
  por establecimiento y tipo de factura, `nro_asiento`). Conviene sumarlas cuando
  se confirme que el frontend no reutiliza numeros.
- `fk_inmueble` en `facturas` sigue sin FK, igual que antes; se resuelve en la fase SIFEN.

## Pruebas

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f tests/aislamiento.sql
```

Corre en una transaccion que se revierte. Insertar en `auth.users` requiere un
rol con permiso: usar una base local o de staging, no produccion.
