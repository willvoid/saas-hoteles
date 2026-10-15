# Feature: finanzas

Branch: `feat/finanzas` (cut from `feat/landing-registro`, which holds migrations up to 0015)
Full plan: `C:\Users\Windows 11\.claude\plans\quiero-un-plan-para-melodic-leaf.md`

## Objective
Simple finance module for the hotel: income and expenses, accounts receivable and payable, fund accounts (cash, banks), monthly lock and four basic reports. Built on top of the existing double-entry tables; the UI hides debit/credit and database triggers write the journal entries in the same transaction.

## Decisions
- Only admin and gerente use the module; read access to accounting tables is closed to every other role (`admin_gerente_total` rule, `0006_rls.sql:56-70`).
- Receivable: invoices with credit condition and partial collections (cobros). Reception may issue credit invoices but sees no balances and cannot collect.
- Payable: supplier catalog (name, RUC) and expenses (gastos), cash or credit with due date, partial payments (pagos).
- Fund accounts (cuentas_fondos): shift cash, petty cash, banks. PYG only, no bank reconciliation. Includes transfers between funds and opening balances.
- Reports: income vs expenses, receivable/payable with aging, fund flow, simple VAT book (no RG 90 export).
- Monthly lock: admin closes/reopens a month; no fiscal-year close.
- Chart of accounts: standard Paraguayan hotel template seeded into `plantilla-base`, backfilled for existing tenants.
- Ledger starts at activation date; historical invoices are not posted.
- Defaults assumed (adjustable): only admin closes/reopens months; entries are also posted on plan `basico`; annulling an invoice/gasto is blocked while it has active cobros/pagos; sales broken down by VAT rate.
- Language: UI copy Spanish; DB objects follow the existing Spanish schema naming; comments and docs in English.

## Constraints
- Every new/replaced function needs an explicit `grant execute` (migration 0012 guard); `fn_contabilizar` gets no grant.
- New tenant tables follow `saas-db/README.md:80-97` (tenant_id default, UNIQUE(tenant_id,id), composite FKs, RLS rule).
- Report RPCs are `security invoker`, `stable`.
- Business day is `America/Asuncion`, never UTC `current_date`.
- Do not commit unrelated `.atl/`, `.gga`, `saas-db/backup_pre_0014.sql`, `saas-db/supabase/.temp/`, `.claude/` changes.
- `components/` has no Supabase calls; Supabase only in `services/`.
- Advisory heuristic: ~400 authored changed lines per task.

## Tasks
- [ ] T0 Feature document and branch.
- [ ] T1 Migration 0016: fixes to `cuentas_contables`/`asientos`/`detalle_asientos`, `asiento_secuencia`, `fn_contabilizar`, balance constraint trigger, RLS move to `admin_gerente_total`; `saas-db/tests/finanzas.sql` (base).
- [ ] T2 Migration 0017: `tipo_cuenta_contable` seed, PY hotel chart of accounts in `plantilla-base`, `categorias_finanzas`, updated `fn_seed_tenant_desde_plantilla`, backfill.
- [ ] T3 Migration 0018: `cuentas_fondos`, `medios_pago_fondo`, `facturas` credit columns, posting of invoice and annulment.
- [ ] T4 Migration 0019: `proveedores`, `gastos`, `cobros`, `pagos`, `transferencias_fondos`, opening balances, posting and policies.
- [ ] T5 Migration 0020: month lock (guards, `fn_cerrar_mes`, `fn_reabrir_mes`).
- [ ] T6 Migration 0021: report RPCs, README update, rest of `finanzas.sql`, extend `aislamiento.sql`.
- [ ] T7 Frontend base: tenant modules, `TabId 'finanzas'`, Dashboard shell, regenerated types, cash-only filter in `reporteService`.
- [ ] T8 Frontend utils and services with Vitest tests.
- [ ] T9 Credit sales in `FacturaForm`, `FacturaDetail`, `ManageFacturas`.
- [ ] T10 Pages: suppliers, funds, gastos, pagos, transfers.
- [ ] T11 Pages: cobros, receivables, month closing.
- [ ] T12 Reports page and PDF.

## Open questions (defaults assumed, revisit if wrong)
- Who closes a month: admin only (assumed).
- Post entries for `basico` tenants: yes (assumed).
- Block annulment with active cobros/pagos: yes (assumed).

## Verification
`npm test` (vitest), SQL tests in `saas-db/tests/` (`finanzas.sql`, `aislamiento.sql`, `planes.sql`) on a throwaway PG, manual run of the Finanzas tab as admin and recepcionista.

## Progress
- Branch and feature document created. Next: T1.

## Route declaration
(filled per task as work proceeds)
