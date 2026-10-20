# cajas-por-plan

Branch: `feat/crud-cajas-por-plan` (cut from `feat/cargos-por-habitacion` so migration numbering 0030 follows 0029).
Plan source: `C:\Users\Windows 11\.claude\plans\quiero-un-plan-para-joyful-deer.md`

## Objective
Admin/gerente can create, edit and deactivate several cash registers (`caja`) per hotel. The maximum number of registers depends on the plan.

## Decisions
- Limit per hotel (tenant), counting active and inactive rows (same as habitaciones).
- Caps: basico 1, pro 3, trial 3, business unlimited (null).
- Soft delete via `caja.estado` ('Activo'/'Inactivo'); never hard delete (turnos, facturas, fondos reference caja).
- `caja` writes move from `operativo` to `admin_gerente`; SELECT stays open to active users.

## Authorized scope
`saas-db/supabase/migrations/0030_*`, `saas-db/tests/cajas.sql`, `saas-db/README.md`, `src/services/{cajaService,tenantService,authService,planService}.ts`, `src/types/*`, `src/pages/{ManageCajas,CajaForm,CajaTurno,Dashboard}.tsx`, `src/utils/permissions.ts`. No push, no PR.

## Tasks
- [~] T1 DB: migration 0030 (max_cajas, caja.estado, fn_limite, limit trigger, open-turn guard, RLS, fn_planes_publicos) + SQL tests + README. WRITTEN, NOT EXECUTED: no local DB credentials. Run `psql -f saas-db/tests/cajas.sql`, `planes.sql`, `finanzas.sql`, `aislamiento.sql` (finanzas.sql inserts extra cajas near lines 1102/1149/1163 and may hit the new cap). Route: delegated writer (2+ non-trivial files).
- [x] T2 Service/types: cajaService CRUD, getCajasConEstado filters Activo, getLimiteCajas (3 queries, no SessionUser change) + vitest. RED 5/5 failed, GREEN 6/6; `tsc --noEmit` clean; `npm test` 723/723. Route: delegated writer. PublicPlan.max_cajas left out (lives in src/utils/plans.ts, outside scope).
- [x] T3 UI: ManageCajas + CajaForm, 'cajas' tab in permissions and Dashboard, counter with cap. RED 1 failed, GREEN `npm test` 724/724, `tsc` clean, `npm run build` OK. NOT exercised in a browser. Route: delegated writer.

## Acceptance
- 2nd caja fails on basico, 4th on pro, none on business (errcode 23514).
- Deactivate + recreate does not bypass the cap; deactivating a caja with open turno fails.
- Recepcionista cannot write caja but can read it and open turnos.
- `npm test` and `npm run build` pass; SQL tests pass.

## Routes / evidence
(filled per task)

## Progress
Created. Next: T1.
