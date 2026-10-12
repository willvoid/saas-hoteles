# AGENTS.md — Sistema Hotelería

Guía de referencia para agentes de IA (Claude Code, GGA, etc.) que trabajen en este repositorio. El objetivo es mantener consistencia sin ser excesivamente rígidos: usá el criterio cuando una regla no aplique bien a un caso puntual.

## Stack

- **Frontend**: React + TypeScript + Vite
- **Routing**: React Router
- **Backend / datos**: Supabase (auth, base de datos, storage)
- **Estilos**: (completar según el proyecto — Tailwind / CSS Modules / styled-components)

## Estructura del proyecto

```
src/
├── assets/       # Imágenes, iconos y vectores de la UI (empaquetados con Vite)
├── components/   # Componentes UI reutilizables (botones, inputs, modales aislados)
├── constants/    # Constantes de la app (colores, etc.)
├── context/      # Manejadores de estado global (Theme, Auth Context)
├── hooks/        # Custom hooks (lógica extraída y reutilizable, ej. useAuth)
├── pages/        # Vistas completas que representan una URL (routing)
├── services/     # Lógica de conexión externa (instancia de Supabase, API endpoints)
├── utils/        # Funciones helper puras (formateo de fechas, parsers)
├── App.tsx       # Orquestador principal y enrutador base (React Router)
└── main.tsx      # Entry point de React (inyección en el DOM)
```

### Dónde va cada cosa

- **`components/`** — Solo UI reutilizable y aislada. Si un componente depende fuerte de una sola página y no se reutiliza, puede vivir junto a esa vista en `pages/`. No debería tener lógica de negocio ni llamadas directas a Supabase.
- **`pages/`** — Una vista = una ruta. Orquesta componentes, hooks y services. Evitar lógica de fetching compleja acá adentro; delegarla a `hooks/` o `services/`.
- **`context/`** — Solo estado verdaderamente global (auth, tema, preferencias de usuario). Si el estado es local a una página o feature, usar `useState`/`useReducer` ahí mismo antes de subirlo a contexto.
- **`hooks/`** — Lógica reutilizable extraída de componentes. Un hook debería poder testearse o razonarse de forma aislada del componente que lo usa.
- **`services/`** — Único lugar donde se instancia el cliente de Supabase y se definen las funciones que hablan con la base/API externa. Los componentes y hooks no deberían importar Supabase directamente; pasan por acá.
- **`utils/`** — Funciones puras, sin efectos secundarios, sin estado. Si una función necesita estado o contexto de React, no es un util, es un hook.

## Convenciones generales

- **TypeScript**: tipar props, retornos de hooks y respuestas de `services/`. Evitar `any` salvo casos justificados.
- **Nombres de archivos**: componentes en PascalCase (`RoomCard.tsx`), hooks en camelCase con prefijo `use` (`useAuth.ts`), utils en camelCase (`formatDate.ts`).
- **Imports**: preferir imports absolutos o alias configurados en Vite (`@/components/...`) si el proyecto los tiene configurados, para evitar cadenas largas de `../../../`.
- **Supabase**: nunca hardcodear keys ni URLs en el código; siempre vía variables de entorno (`.env`, no versionado). Las queries a Supabase se centralizan en `services/`, no se repiten sueltas en componentes.
- **Componentes**: preferir componentes funcionales con hooks. Mantenerlos chicos y enfocados; si un componente crece mucho, es señal de extraer lógica a un hook o dividir en subcomponentes.
- **Rutas**: definidas centralmente en `App.tsx`. Cada ruta nueva en `pages/` debe registrarse ahí.

## Qué evitar

- Lógica de negocio o llamadas a Supabase directamente dentro de `components/`.
- Estado global en `context/` para cosas que solo usa una página.
- Funciones en `utils/` que dependan de hooks de React o de contexto.
- Mezclar responsabilidades de fetching de datos con presentación dentro de una misma función/componente sin separarlas.

## Notas para el agente

- Antes de crear un archivo nuevo, ubicarlo según su responsabilidad usando la tabla de arriba, no por comodidad.
- Si una tarea no encaja claramente en ninguna carpeta, preguntar o proponer la ubicación más razonable antes de asumir.
- No es necesario forzar esta estructura al pie de la letra en casos chicos o prototipos rápidos — priorizar legibilidad y sentido común sobre la regla.