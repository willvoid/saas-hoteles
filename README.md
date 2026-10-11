# hotel-saas-app

Frontend multi-tenant del PMS hotelero. Es la adaptación de la app single-tenant (Hotel San Martín) para trabajar contra el backend de `../saas-db`: cada hotel es un tenant aislado por RLS y el tenant del usuario viaja en el JWT (`app_metadata.tenant_id`).

Stack: React 19, Vite 8, TypeScript 6, react-router-dom 7, supabase-js 2, vitest. Las reglas de estructura están en `AGENTS.md`.

## Puesta en marcha

```bash
cp .env.example .env
```

Completar en `.env` las dos variables del proyecto Supabase nuevo (no del anterior):

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

```bash
npm install
npm run dev      # servidor de desarrollo
npm run build    # build de producción
npm test         # vitest
npm run lint     # eslint
```

## Rutas

| Ruta | Descripción |
|---|---|
| `/` | Redirige a `/login` (la página de marketing queda pendiente) |
| `/login` | Ingreso con correo electrónico y contraseña |
| `/recuperar-clave`, `/reset-password` | Recuperación de contraseña |
| `/administracion` | Panel del hotel (requiere sesión) |
| `/h/:slug` | Sitio público de reservas del hotel con ese slug |

## Sitio público `/h/:slug`

El visitante es `anon` y no tiene acceso a ninguna tabla. `services/landingService.ts` habla solo con tres RPC:

- `fn_landing_catalogo(p_slug)`: tipos de habitación, imágenes, tarifas activas, habitaciones y tipos de documento. Devuelve `null` si el hotel no existe o está suspendido (la app muestra "Hotel no encontrado").
- `fn_landing_ocupacion(p_slug, p_desde, p_hasta)`: habitaciones no disponibles en el rango.
- `fn_registrar_reserva_landing(p_slug, p_payload)`: crea la reserva en estado Pendiente. El precio y el usuario que la registra los decide el servidor.

## Sesión y tenant

`SessionUser` incluye `tenant_id` y `tenant { id, nombre, slug, estado }`. Si el tenant está `suspendido`, la RLS deja sin perfil a todo su personal: `resolveSession` lo detecta leyendo la fila de `tenants` y la app muestra una pantalla de bloqueo con botón para cerrar sesión.

## Storage

Las imágenes se suben a `habitaciones` y `tipo_habitaciones` con la ruta `{tenant_id}/{id_dueño}/{uuid}.{ext}`. Solo se aceptan JPG, PNG, WebP y AVIF de hasta 5 MB (se valida en el cliente y en el bucket).

## Regenerar tipos

`src/types/supabase.ts` viene del esquema anterior y fue ajustado a mano (tabla `tenants`, `usuario.tenant_id`, RPC de la landing). Para regenerarlo contra el proyecto nuevo:

```bash
npx supabase gen types typescript --project-id <ref> > src/types/supabase.ts
```

## Pendiente

- Edge functions en el proyecto nuevo: `register-tenant` y `admin-create-user` (el formulario de usuarios ya invoca esta última sin cambios).
- Pantallas de marketing, registro de hoteles y onboarding.
- Captcha y límite por IP para la reserva web pública (hoy `fn_registrar_reserva_landing` es llamable directamente por `anon`).
- Regenerar `src/types/supabase.ts` con el CLI de Supabase.
- Nombre y marca del hotel en la landing: `fn_landing_catalogo` no devuelve el nombre, por eso la landing muestra un encabezado genérico.
- Los reportes PDF (`utils/reporteIngresosPdf.ts`, `utils/reporteTurnosPdf.ts`) aún imprimen "Hotel San Martín" fijo.
- `utils/permissions.ts` trata un cargo desconocido como recepcionista, pero la base lo trata como solo lectura: alinear ambos.
