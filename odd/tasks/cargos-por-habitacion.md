# cargos-por-habitacion

Objective: attribute folio charges to a reservation room (`cargos_folio.fk_detalle_reserva`, nullable; NULL = general/legacy charge) so multi-room reservations can be adjusted, reported and (later) billed per room.
Plan of record: `C:\Users\Windows 11\.claude\plans\haz-un-plan-para-partitioned-falcon.md`
Branch: `feat/cargos-por-habitacion` (cut from `feat/superadmin-finanzas`; that branch has unrelated uncommitted work, so commit with explicit paths only). Delivery strategy: ask-on-risk. Push/PR remain user decisions.

## Decisions
- One folio per reservation stays; no split billing in this feature.
- Late check-out / early check-in surcharge stays `fk_detalle_reserva = NULL` (its calculation uses max rate across rooms; per-room surcharge is a separate product decision).
- Backfill only reservations with exactly one `detalle_reservas` row; multi-room historical lodging stays aggregated (NULL) and `ajustarCargoAlojamiento` keeps a legacy path for it.
- `folioService.addCargo` merge key must include `fk_detalle_reserva`.
- Migration number: 0028.

## Tasks
- [x] T1 (commit d910bdf) DB: migration 0028 (column, composite FK, index, single-room backfill, comment). Route: inline (one mechanical file); verified by the T2 writer on a scratch PG17 (backfill: single-room -> detalle id; multi-room, single-active+inactive, no-detalle -> NULL).
- [x] T2 (commit c5d9651) DB: migration 0029 `fn_estancia_con_recargo` posts one lodging charge per active room + `saas-db/tests/cargos_extra.sql` (RED observed at first new assertion, GREEN 130 ok) + README migration lines. Route: delegated writer (2 non-trivial files). aislamiento.sql passes. Not run: finanzas, planes, fecha_paraguay, registro_publico.
- [x] T3 (commit 273a325; alojamiento.test.ts RED 7 fail -> GREEN 22/22) Frontend core: `types/supabase.ts`, `folioService` (addCargo key, addCargoManual, ajustarCargoAlojamiento per room + legacy), `alojamientoService`, `utils/alojamiento.ts` + test, `ReservationDetail.sincronizarCargoAlojamiento`. Route: delegated writer. Supabase paths (`addCargo`, `ajustarCargoAlojamiento`) only type-checked, not exercised.
- [x] T4 (commit 12be47b; cargosPorHabitacion.test.ts RED -> GREEN 25/25; UI NOT exercised in a browser) Frontend UI: room selector in `CargoManualDialog`/`useCargoManual`, per-room display and mismatch banner (`detectarDesfaseAlojamiento`) in `FolioDetail`, new `utils/cargosPorHabitacion.ts`. Route: delegated writer.
- [x] T5 Verify: SQL (scratch PG17) cargos_extra + aislamiento pass; `npx vitest run` 53 files / 717 tests pass; `tsc -p tsconfig.app.json` 17 errors = same as baseline (pre-existing); eslint counts identical to HEAD on touched files. NOT run: finanzas, planes, fecha_paraguay, registro_publico SQL suites; no end-to-end browser check.

## Acceptance
- Early check-in on a 2-room reservation creates 2 lodging charges, each with its `fk_detalle_reserva`; `total_acumulado` unchanged vs. the aggregated version.
- Changing dates of one room adjusts only that room's charge; legacy aggregated folios still adjust as before.
- Manual charge can be assigned to a room or left general; same concept on two rooms does not merge.
- FK rejects a detalle from another tenant.

## Progress / evidence
- Base for review ranges: 17b89bf (branch point). Native review assess after T1+T2 was `unassessable` (unrelated untracked files in the working tree: `.claude/launch.json`, `supabase/.temp/...`), so `high_risk` / review_due=true; preflight STATUS asks for an intended-untracked selection. Deferred to a single user-owned decision at close (RDD is on by default; candidate consent is the user's).
- 0029 decisions: per-room qty = greatest(1, nights), unit = subtotal/nights; rooms with subtotal <= 0 get no charge; grants repeated after CREATE OR REPLACE because the 0012 DDL guard revokes EXECUTE.
- GGA pre-commit review is non-deterministic: first attempt on T4 failed on pre-existing `any`/fetching in `FolioDetail.tsx` (not introduced here), the retry passed. No `--no-verify` used.
- UI choices (T4): general charges first, then by room order, removed rooms last; "Habitación" column only when >1 room or an attributed charge exists; selector hidden when fewer than 2 rooms; the aggregated NULL lodging charge covers only rooms without their own charge (one rule for legacy, per-room and mixed folios).
- 0028 backfill counts ALL detalle rows (incl. inactive): a reservation with 1 active + 1 inactive room stays NULL (conservative).
