# ADR 0008 — CAMIONES (trucks) module: derived display states, entry/exit as movements, lazy loading

- **Status:** Accepted (2026-09-19)
- **Applies to:** `cargo-control-web` (truck module UI), data schema, security layer

## Context

Fase 7 requires the truck module UI (`TruckList`, `TruckCard`, `TruckDetails`,
`TruckCreateDialog`, `TruckEditDialog`, `TruckStatusBadge`, `TruckTimeline`)
with search, filters, sorting and pagination, plus auditable entry/exit for
trucks.

The module prompt lists **13 truck states** (`EXPECTED|ARRIVED|IN_PLAYON|
IN_PROCESS|PARTIALLY_UNLOADED|UNLOADED|WAITING|IN_SCANNER|IN_SCALE|RETAINED|
SEIZED|READY_TO_EXIT|EXITED`). But the repository authority (Fase 3/5/6)
models:

- `trucks.status` as a **fleet base status** CHECK with 5 codes
  (`available|in_playon|in_route|out_of_service|inspection`);
- arrival, discharge, split, transfer, scan_in/out, scale, quarantine,
  seizure, release, egress and correction as **movements** on the append-only
  spine (`movements.kind`), each with a kind → permission map
  (`docs/security/authorization.md`) and server-side enforcement (ADR 0007).

Adding 13 codes to the CHECK would (a) break the Fase 5 derived-occupancy /
spine invariant and (b) force client and server to co-author display state,
violating ADR 0007 defense in depth.

## Decision

1. **`trucks.status` (base fleet status, 5 codes) stays unchanged.** It is
   catalog/config state (`available|in_playon|in_route|out_of_service|
   inspection`) and is the only truck status written by create/update.

2. **`TruckStatusBadge` computes a 13-code display state** from read-only
   signals, never stored:
   - base `trucks.status`;
   - latest `movements` / `movement_items` for the truck;
   - any **open** `scanner_operations`, `scale_operations`,
     `quarantine_operations` or `seizure_operations`.
   Derivation precedence is documented in `docs/domain/states.md`
   (truck_status display map) and specified in `docs/ux/trucks-module.md`.
   The badge is a UX projection; the server-side authority remains RLS +
   Edge Functions per ADR 0007.

3. **Entry and exit are movements, not columns.** Truck entry is an
   `arrival` movement and exit is an `egress` movement on the append-only
   spine (auditable via `audit_log`). The UI derives displayed entry/exit
   from the first arrival / last egress of the truck's movement history.
   There is **no** editable `entry_at` / `exit_at` date column and no
   hand-editable status transition for arrival/egress. This preserves the
   immutable event log (ADR 0004) and the Fase 6 audit direction.

4. **Lazy-loading contract for the list.** `TruckList` fetches one page
   (page size 20; cursor/offset on `plate` for stable ordering), never the
   full table. Row count is displayed only when the rendered page is full
   (fetch `count_exact` only then); otherwise the client shows an infinite
   scroll "load more" affordance, keeping count cost proportional to viewport.

5. **Permissions: no new catalog entries.** The Fase 6 catalog already
   covers the module: `truck.read/create/update/exit` (fleet), plus
   `cargo.read` and others surfaced by `TruckDetails`/`TruckTimeline`. No
   policy edits needed; the module asserts the existing matrix
   (`docs/security/rbac.md`, `docs/security/rls.md`).

## Consequences

- No schema migration for Fase 7: no CHECK change, no new columns, no
  schema-v3/4.
- Truck operational state is **derived**, so a truck cannot lie in the UI:
  egress requires the `truck.exit` movement and remains server-authorized.
- The 13 display codes are a UI contract shared with QA tests, not a
  database contract; `docs/qa/truck-module-tests.md` tests precedence and
  auditability.
- List performance scales without a full-table scan; count is pay-per-view.

## Files

- Module UX: `docs/ux/trucks-module.md`
- Display projections: `docs/domain/entities.md` (Truck deltas),
  `docs/domain/states.md` (truck_status display map)
- Security: `docs/security/rbac.md`, `docs/security/rls.md` (assert only)
- Database: `docs/architecture/database.md` (truck § note; no DDL change)
- Tests: `docs/qa/truck-module-tests.md`