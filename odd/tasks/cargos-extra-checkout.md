# cargos-extra-checkout

Objective: charge late check-out / early check-in surcharges (suggested, confirmed by reception) plus manual folio charges.
Plan of record: `C:\Users\Windows 11\.claude\plans\quiero-implementar-los-cargos-cuddly-kitten.md`
Branch: `feat/cargos-extra-checkout`. Delivery strategy: ask-on-risk. Push/PR remain user decisions.

## Decisions
- Per-establishment config; method PORCENTAJE (of nightly rate) or FIJO_HORA.
- System suggests; reception confirms/edits/exonerates; mandatory reason; logged in `historial_estancia`.
- Concepts "Late check-out" / "Early check-in" seeded per tenant, IVA 10% editable.
- Business time via `now() at time zone 'America/Asuncion'`; never `current_date`.
- Migration number: 0022 (two 0015 files already exist).

## Tasks
- [x] T1 (commit 9116ad7; local PG17 shim: cargos_extra + 5 suites pass) DB: migration 0022 (config table, real timestamps, concept seed, calc fn, atomic checkout RPC, historial types) + `saas-db/tests/cargos_extra.sql`. Route: delegated writer.
- [x] T2 (commit 0817c8d; vitest 605 pass) Frontend core: types, utils (pure calc + vitest), service, hooks. Route: delegated writer.
- [x] T3 (UI not exercised in a browser) Frontend UI: config screen in establecimientos, check-in/out dialogs in ReservationDetail, manual charge in FolioDetail. Route: delegated writer.
- [ ] T4 Verify: SQL suites, vitest, tsc/build.

## Acceptance
- Checkout 13:00, hora normal 11:00, tolerance 30 min, 25% of Gs 300.000 -> suggested Gs 75.000.
- Charge + estado change are atomic; exoneration stores reason and actor.
- Invoice includes the surcharge concept; Finanzas untouched.

## Progress / evidence
(none yet)
