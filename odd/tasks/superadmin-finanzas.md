# ODD — superadmin-finanzas

Branch `feat/superadmin-finanzas`. One Conventional Commit per task. Engram mirror: `odd/superadmin-finanzas/tasks`.

## Objective
Add a Finanzas section to `/superadmin` that tracks the platform's own income and expenses.

## Problem / Why
The platform owner has no view of the SaaS's money. Subscription payments sit in `pagos_suscripcion` (service_role only, never read), and the SaaS's own expenses aren't recorded anywhere.

## Decisions (confirmed by the user)
- **Income:** mixed. Automatic income comes from `pagos_suscripcion`, and manual income entries can be added on top.
- **Currency:** PYG only.
- **Expenses:** a single type, `egreso`, told apart by category. Categories come seeded and can be edited (create, rename, deactivate).
- **Recurrence:** none. Every movement is entered by hand.
- **KPIs:** Ingresos, Egresos and Neto for the selected range; MRR, where an annual plan counts as price / 12; a ranking of income per hotel; and a monthly bar chart.
- **Navigation:** Hoteles | Finanzas tabs across superadmin.
- **Movements:** they can be edited and voided (soft-delete with `anulado`). Every change is written to `platform_audit`.

## Scope / Constraints
- **Separation:** this is separate from the per-hotel finance module (0016–0021).
- **Access:** RLS is on and `anon`/`authenticated` are revoked. Access goes only through the `superadmin` edge function, which runs with service_role (same pattern as 0024).
- **Charts:** no new chart library. The chart is SVG, following `OccupancyChart.tsx`.
- **Delivery:** `ask-on-risk`. The forecast is about 900 changed lines.

## Tasks
| ID | Task | Route | Test-first |
|----|------|-------|------------|
| T1 | Migration `0025_finanzas_plataforma.sql`: categories, movements, and `fn_admin_finanzas_resumen` | delegated writer | RED: `saas-db/tests/finanzas_plataforma.sql` |
| T2 | Edge function actions for summary, movements and categories, with validation | delegated writer | RED: `validation.test.ts` |
| T3 | `superadminFinanzasService.ts` and `useFinanzasPlataforma.ts`, with tests | delegated writer | RED: vitest |
| T4 | `SuperadminTabs`, `FinanzasPlataforma` page and `/superadmin/finanzas` route | delegated writer | pure helpers tested, plus build |
| T5 | End-to-end verification | inline | — |

- [x] T1 — route: delegated writer. Wrote 0025 migration and tests/finanzas_plataforma.sql; NOT executed (no DB credentials: psql needs a password, no docker), so no RED/GREEN observed.
- [x] T2 — route: delegated writer. Added validation.ts (24 vitest tests, RED then GREEN observed) and finanzas.ts handlers wired in index.ts; handlers not executed or type-checked (no deno on PATH, no DB/edge runtime).
- [x] T3 — route: delegated writer. RED observed (modules missing), then GREEN: 18 new tests plus service/hook suites pass (82 in src/services+src/hooks). `npm run build` completed with no errors. Exported `call` from superadminService. Hook effects not DOM-tested; only pure helpers are.
- [ ] T4
- [ ] T5

## Acceptance criteria
- Activating a plan shows up as income and in the hotel ranking.
- A manual expense can be created, edited and voided, and the totals update each time.
- Voided rows are excluded from every total.
- A non-admin is redirected, and `authenticated` is denied at the database.

## Checks
- SQL suites run with `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f tests/finanzas_plataforma.sql` (also `platform_admins.sql` and `planes.sql`).
- `npm test` and `npm run build`.

## Progress / Next step
Next step: T4.
