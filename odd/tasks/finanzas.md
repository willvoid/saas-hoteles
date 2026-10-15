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
- [x] T0 Feature document and branch. Commit: f4a3fa0.
- [x] T1 Migration 0016: fixes to `cuentas_contables`/`asientos`/`detalle_asientos`, `asiento_secuencia`, `fn_contabilizar`, balance constraint trigger, RLS move to `admin_gerente_total`; `saas-db/tests/finanzas.sql` (base). Route: delegated writer. RED observed (fixtures failed, no `clave` column), GREEN on throwaway PG17 with a Supabase stub: finanzas 118 ok, planes 24 ok, aislamiento 122 ok, registro_publico 35 ok; 0016 re-run is idempotent; real COMMIT with an unbalanced entry rejected. Not run: real Supabase/PostgREST, concurrency. Commit: pending (parent).
- [x] T2 Migration 0017: `tipo_cuenta_contable` seed, PY hotel chart of accounts in `plantilla-base`, `categorias_finanzas`, updated `fn_seed_tenant_desde_plantilla`, backfill. Route: delegated writer. RED observed (0017 skipped: first T2 assertion failed, no `Pasivo` type), GREEN on throwaway PG17 with the Supabase stub: finanzas 197 ok, aislamiento 122 ok, registro_publico 35 ok, planes 24 ok only with its fixture patched (see Progress). 0017 re-run on a migrated DB is idempotent; a real pre-0017 backfill gave an empty hotel 35 accounts + 17 categories and left a hotel with its own account untouched. New helper `fn_copiar_plan_cuentas_plantilla` (no grants); `fn_seed_tenant_desde_plantilla` delegates to it, grants unchanged. Not run: real Supabase/PostgREST. Review: assessed medium, candidate review declined by the user. Commit: see git log (`feat(db): seed hotel chart of accounts`).
- [x] T3 Migration 0018: `cuentas_fondos`, `medios_pago_fondo`, `facturas` credit columns, posting of invoice and annulment. Route: delegated writer. RED observed (T3 sections failed: `public.cuentas_fondos` did not exist), GREEN on throwaway PG17 with the Supabase stub: finanzas 291 ok, planes 24 ok, aislamiento 122 ok, registro_publico 35 ok. 0018 re-applied on a migrated DB is idempotent; a real pre-0018 backfill (hotel with 2 cajas, an old invoice with condicion_venta 5) created 2 funds/accounts once, raised the VALIDATE WARNING and posted nothing for the old invoice. Not run: real Supabase/PostgREST, concurrent fund creation. Commit: pending (parent).
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
- T0 to T3 done. Next: T4 (suppliers, gastos, cobros, pagos, transfers).
- T3 carry-over for T4: `facturas.saldo_pendiente` is set only by triggers (`tg_fn_factura_antes` in 0018); cobros must lower it from a definer function. The annulment guard "refuse while the invoice has active cobros" goes in `tg_fn_factura_antes` (marked with a `T4 (0019) adds here` comment; also marked in `finanzas.sql` Annulment section). Fund resolution helper `fn_cuenta_fondo_factura(tenant, turno, modo_pago)` can be reused for cobros/pagos. `fn_asegurar_fondos_cajas(tenant)` creates the missing caja fund; the caja trigger and `fn_copiar_plan_cuentas_plantilla` (replaced in 0018) call it. Fund accounts are 1.1.01.NN children of DISPONIBILIDADES, so a hotel now has 35 + one account per fund (T2 assertions in `finanzas.sql` were adjusted to exclude codes `1.1.01.%`; fixture deletes `cuentas_fondos` before dropping the chart). Posting skips hotels with no accounts at all; a hotel with accounts but no VENTAS_*/IVA_DEBITO keys, or a shift caja without fund, makes invoicing fail with a Spanish error. Client can still UPDATE totals/condicion_venta/saldo_pendiente of an EMITIDA invoice (RLS is row-level only); T4 should add a guard or accept it. `fk_modo_pago` is now nullable: `src/types/supabase.ts` is regenerated in T7. Reversal asiento dated with the annulment day (Asuncion), original keeps the invoice day.
- T2 carry-over: `saas-db/tests/planes.sql:161` used account codigo `'1'`, which collided with the copied chart; the parent changed it to `'9.9.9'` and re-ran all four suites (finanzas, planes, aislamiento, registro_publico) green. Fund accounts of T3 must be children of the `DISPONIBILIDADES` account (1.1.01, non-imputable parent). The `finanzas.sql` fixture drops the copied chart of `fin-pro`/`fin-basico` to keep its minimal chart; T2 sections use their own tenants (`fin-nuevo`, `fin-vacio`).
- Carry-over for T5: reversals leave both the original and the reversal asiento in `ANULADO`; the month-lock guard on `asientos` must allow that `estado -> ANULADO` update. `finanzas.sql` has a `FIN` marker: add new `do $$` sections before it. Local PG17 test method: see T1 evidence (throwaway cluster + Supabase stub).

## Route declaration
(filled per task as work proceeds)
