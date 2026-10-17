# ODD — superadmin-gestion-hoteles

> When approved, this content becomes `odd/tasks/superadmin-gestion-hoteles.md`, with an Engram mirror under topic `odd/superadmin-gestion-hoteles/tasks`. Work happens on branch `feat/superadmin-gestion-hoteles`, with one Conventional Commit per task.

## Objective
Give the platform owner a `/superadmin` panel to manage tenants. From the panel the owner can list hotels, see their detail and users, create a hotel, suspend or reactivate it, and change its plan.

## Problem / Why
There is no platform-operator concept today. Tenants are activated, provisioned and suspended by hand through `service_role` or SQL (`fn_activar_plan`, `fn_provision_tenant` in `0014`). That process is slow and error-prone, and it leaves no audit trail.

## Approach (decided)
The super admin does not go through tenant RLS. Every operation goes through the edge function `superadmin`, which does three things:
1. Validates the JWT.
2. Checks that the caller is in `platform_admins`.
3. Runs the operation with `service_role`.

With this approach, no policy in 0006 or 0014 needs to change. Tenant isolation stays the same.

## Scope / Constraints
- **In scope:** the tenant CRUD described above, plus an audit log.
- **Out of scope:** impersonation, global metrics, and automatic billing.
- **Reuse:** `fn_activar_plan`, `fn_provision_tenant`, `fn_suscripcion_vigente`, `current_usuario_activo` (which already blocks a suspended tenant), and the edge function `_shared` helpers.
- **Conventions:** follow AGENTS.md. Services go through `src/services`, and routes are registered in `App.tsx`.

## Tasks
| ID | Task | Route | Test-first |
|----|------|-------|------------|
| T1 | Migration `0024_platform_admins.sql`. It adds the `platform_admins` and `platform_audit` tables, `fn_es_platform_admin`, and `fn_admin_tenants_resumen` (summary per tenant: plan, current subscription, user, establishment and room counts). All of them are `service_role` only. It also includes the documented seed for my `auth_id`. | inline (1 file) | RED: write `saas-db/tests/platform_admins.sql` first. It checks that `authenticated` cannot read the tables or execute the functions. |
| T2 | Edge function `functions/superadmin/` with the actions `whoami`, `list_tenants`, `get_tenant`, `set_estado`, `set_plan` and `create_tenant`. A guard returns 403, and every action is audited. | delegated (writer) | Deno test for the guard (403 or 200) if a runner exists. If not, a manual `curl` check. |
| T3 | `src/services/superadminService.ts` (typed) and its `superadminService.test.ts`. Add `isPlatformAdmin` to `resolveSession` in `authService.ts`. | delegated (2 files) | RED: the service test with the client mocked, following the existing `*.test.ts` files. |
| T4 | UI in `src/pages/superadmin/`: `TenantsList`, `TenantDetail` (with confirmation dialogs) and `CreateTenant`. Add the `useTenantsAdmin` hook and the guarded `/superadmin` route in `App.tsx`. | delegated (writer) | Covered by the build and manual checks. |
| T5 | End-to-end check (see Verification) and close-out. | inline | — |

- [x] T1 — route: inline. Wrote `tests/platform_admins.sql` and `0024_platform_admins.sql`. RED/GREEN not observed: no Docker and no credentials for the local Postgres, so the SQL suite has not been run yet (must run before PR1).
- [ ] T2
- [ ] T3
- [ ] T4
- [ ] T5

## Acceptance criteria
- A normal user gets 403 from the edge function and is redirected when visiting `/superadmin`.
- The super admin can list tenants, suspend one and reactivate it. A suspended tenant's users see the suspended screen.
- After a plan change, `loadTenant().modulos` reflects the new plan.
- Every action leaves a row in `platform_audit`.
- `aislamiento.sql` and `planes.sql` still pass.

## Verification
`supabase db reset`, then the SQL tests, `npm test` and `npm run build`. Finish with the manual flows from the acceptance criteria.

## Delivery
- Forecast is about 700–900 authored lines, which is over the budget of 400. Strategy: `ask-on-risk`. I'll ask for the chain strategy before the commit that crosses the budget.
- Planned slices: PR1 = T1+T2 (backend), PR2 = T3+T4 (frontend).
- Push, opening PRs and merging are your call.

## Progress
T1 committed. Next step: T2.
