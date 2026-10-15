# Feature: planes-suscripcion

Branch: `feat/planes-suscripcion`
Full design and decisions: `C:\Users\Windows 11\.claude\plans\quiero-un-plan-para-floating-newell.md`

## Objective
Model subscription plans (Basico / Pro / Business) with prices and limits, enforce them in the database, and activate subscriptions manually (no payment gateway yet).

## Decisions
- Basico 150.000 PYG/mo (rooms 20, users 3, hotels 1, no accounting, no SIFEN); Pro 350.000 (60, 15, 5, yes, yes); Business 800.000 (unlimited, unlimited, unlimited, yes, yes). Annual = 10x monthly.
- Trial 30 days, Pro limits and modules, max 1 hotel.
- Subscription per hotel (tenant). Hotels per account = highest `max_hoteles` among hotels the user administers.
- Hard block on inserts at the limit; expired trial/payment = read-only.
- Rooms counted regardless of state.

## Constraints
- Every new/replaced function needs an explicit `grant execute` (migration 0012 guard).
- `fn_provision_tenant` redefinition must be a full copy of 0008 with trial default 30.
- Do not commit unrelated `.atl/`, `.gga`, `saas-db/supabase/.temp/` changes.

## Tasks
- [x] T1 DB: migration `0014_planes_suscripcion.sql` (planes, tenants columns, pagos_suscripcion, functions, triggers, restrictive policies, provisioning), SQL tests, README. Route: delegated writer (3+ non-trivial files, read-to-write).
- [x] T2 Edge function: `create-hotel` uses plan-based hotel limit instead of `MAX_HOTELS_PER_ACCOUNT`; tests updated. Route: inline (small, already-understood edits; RED observed 2 failing, GREEN 107/107 vitest).

Out of scope: upgrade UI, `fn_mis_hoteles` plan columns, payment gateway.

## Verification
See plan file (items 1-7). Test runner for T2: Deno (`validation.test.ts`). T1 has no automated runner known; SQL tests in `saas-db/tests/`.

## Progress
- T1 done (route: delegated writer; verified on throwaway PG17, 22 checks pass; concurrency and real Supabase stack not run). Next: T2. Note: fn_max_hoteles_cuenta() uses auth.uid(), so create-hotel must call it with the user JWT client.
