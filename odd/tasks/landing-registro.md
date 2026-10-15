# Feature: landing-registro

Branch: `feat/landing-registro` (cut from `feat/planes-suscripcion`, which holds migration 0014)
Full plan: `C:\Users\Windows 11\.claude\plans\ahora-quiero-implementar-una-humming-pine.md`

## Objective
Public landing at `/` with plans and prices, plus a public sign-up that creates the user and their hotel in one flow and starts a 30-day trial. No payment gateway.

## Decisions
- Everyone starts on trial (30 days); plans on the landing are informational, CTA "Probar gratis".
- Account creation through a new public edge function `register-tenant` (native Supabase signup stays disabled): Turnstile + rate limit + email verification.
- Landing sections: hero + CTA, plans (monthly/annual toggle), features, FAQ + WhatsApp contact. Plans come from a public RPC `fn_planes_publicos`.
- Sign-up wizard in 3 steps (account -> hotel -> company/address), all data required by `fn_provision_tenant`.
- Visual: existing dark/glass tokens in `src/index.css`, plain CSS.
- **No mention of SIFEN / facturacion electronica** anywhere in the landing, plans shown, FAQ or wizard. Scope: landing and sign-up only; DB gates and the internal app are untouched.
- UI copy is Spanish (the existing project language); code, comments and docs are English.

## Constraints
- Every new/replaced function needs an explicit `grant execute` (migration 0012 guard).
- Do not commit unrelated `.atl/`, `.gga`, `saas-db/backup_pre_0014.sql`, `saas-db/supabase/.temp/` changes.
- `components/` has no Supabase calls; Supabase only in `services/`.
- Secrets (`TURNSTILE_SECRET`) never in the repo.
- Advisory heuristic: ~400 authored changed lines per task.

## Tasks
- [x] T1 DB: migration `0015_registro_publico.sql`: `fn_planes_publicos()`, `fn_catalogos_registro()`, `fn_ubicaciones_registro(nivel, padre)`, `fn_registro_rate_limit()` (service_role only) + table `registro_intentos`; SQL tests. Route: delegated writer (read-to-write, 2 non-trivial files). Verified on throwaway PG17: registro_publico 35 ok, planes 24 ok, aislamiento 122 ok. Not run: real Supabase/PostgREST, concurrency.
- [x] T2 Edge function `register-tenant` (+ shared validation extracted to `_shared/hotelInput.ts`). Route: delegated writer. RED observed (module missing), GREEN: `npm test` 384/384 (re-run by parent). Not verified: `deno check` (deno not installed), live Turnstile, real email send via `auth.resend`, `email_exists` code, interval string via PostgREST, provisioning with unconfirmed user. Deploy with `--no-verify-jwt` (no config.toml in repo).
- [x] T3 Frontend foundations: `utils/plans.ts` (+ vitest), `services/planService.ts`, `services/registrationService.ts`, `services/catalogService.ts`. Reused `formatGs` (utils/currency.ts), `slugify`/`RESERVED_SLUGS` (utils/hotel.ts), `readFunctionError`. Route: delegated writer. RED observed, GREEN `npm test` 391. tsc on tsconfig.app.json: no errors in new files (pre-existing unrelated errors elsewhere). RPCs not run against a real backend.
- [x] T4 Frontend landing: `pages/Home.tsx`, `components/landing/*`, `hooks/usePublicPlans.ts`, `utils/landing.ts`, CSS (`home-` prefix), route `/`. Route: delegated writer. RED observed, GREEN `npm test` 399 (re-run by parent); `npm run build` OK (per writer); `rg` finds no SIFEN/electronica in new files. Not verified: visual check (desktop/375px), real `fn_planes_publicos` call. `.env.example` is permission-denied for the agent: `VITE_WHATSAPP_NUMBER` must be documented by the user or in T6.
- [ ] T5 Frontend sign-up wizard: `pages/Register.tsx`, `hooks/useRegisterWizard.ts`, Turnstile widget, route `/registro`.
- [ ] T6 Docs (`saas-db/README.md`, `.env.example` if present) and final verification.

Out of scope: payment gateway, plan upgrade UI, i18n, plan selection at sign-up, SIFEN cleanup in backend/app.

## Verification
`npm test` (vitest), Deno tests for the edge function, SQL tests in `saas-db/tests/`, manual run of `/` and `/registro` at desktop and 375px.

## Progress
- Branch and feature document created. Next: T1.

## Route declaration
(filled per task as work proceeds)
