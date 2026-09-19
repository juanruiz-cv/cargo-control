# ADR 0009 — CARGAMENTOS (cargo) module: divisible merchandise over item lots + movement spine

- **Status:** Accepted (2026-09-19)
- **Applies to:** `cargo-control-web` (cargo module UI), data schema, security layer

## Context

Fase 8 requires the cargo module UI (`CargoList`, `CargoItemCard`,
`CargoItemDetails`, create/edit dialogs, split and transfer dialogs, cargo
movements timeline) with search, filters and pagination. The module prompt
lists per-item fields (`description`, `category`, `quantity`, `unit`,
`weight`, `volume`, `identifier`, `status`, `currentLocation`,
`observations`) and explicitly requires:

- **divisible merchandise** — e.g. 100 units → 40 Sector 3, 30 Sector 7,
  20 Scanner, 10 Camión; never store only an aggregate "quantity per
  sector";
- **traceability via movements** — every operation keeps origin,
  destination, quantity, user, date, truck, merchandise and observations.

The repository authority (Fase 3 / ADR 0003) already models the hard part:
`cargo_items` (total quantity, uom, unit weight, unit volume, status),
`item_lots` (traceability quantum with the invariant **Σ leaf lot
quantities = `total_quantity`** enforced by trigger), and the append-only
movement spine (`movements` + `movement_items`) with per-lot quantity,
from/to location/truck, notes, actor and timestamp. The Fase 6 permission
catalog already includes `cargo.read/create/update/transfer` and the kind →
permission map already routes `split`/`store`/`discharge` → `cargo.update`
and `transfer`/`load_out` → `cargo.transfer`.

## Decision

1. **The module is spec + QA over the existing model — no redesign.** The
   divisibility example (100 → 40/30/20/10) is exactly the ADR 0003 /
   `item_lots` scenario: splits create chained child lots (via `split`
   movement rows), each lot carries its own quantity, unit, weight and
   volume override, and placement (`current_location_id` XOR
   `current_truck_id` — never both). The Σ invariant guarantees quantities
   reconcile.

2. **`category`:** new nullable `cargo_items.category` text column. It is a
   display/grouping label (UI offers autocomplete from recent values); a
   managed catalog can come later if filtering demands it. It is **not** an
   authorization axis.

3. **`observations`:** new nullable `cargo_items.observations` text column
   for item-level notes. Operation-level observations already live in
   `movement_items.notes` / `movements.reason` — never duplicated on the
   item.

4. **`currentLocation` is derived, never stored.** An item spans one or more
   lots; its current placement is the **rollup of active lots** (each lot's
   `current_location_id` / `current_truck_id` + quantity). No column on
   `cargo_items`; the UI renders placements read-only from `item_lots`.

5. **`identifier` = `sku`** (existing column). The UI labels it
   "Identificador"; no new column.

6. **Split and transfer are movements**, appended to the spine:
   - split: `movements.kind = 'split'`, `cargo.update`, child lots via
     `item_lots.parent_lot_id`, quantity from the split dialog;
   - transfer: `movements.kind = 'transfer'`, `cargo.transfer`;
     from/to on `movement_items`.
   Movement rows preserve origin, destination, quantity, user, date, truck,
   merchandise and observations; `audit_log` adds the actor trail. No
   UPDATE/DELETE on movements (append-only, ADR 0004).

7. **Permissions: no new catalog entries.** Module uses the existing
   `cargo.read/create/update/transfer` codes; no policy edits.

## Consequences

- Schema delta is small: 2 nullable columns on `cargo_items`
  (`category`, `observations`); no migration of existing rows.
- Divisible merchandise and its traceability are structural; a split or
  transfer cannot lose quantity (Σ invariant) and cannot be hand-edited
  into a mismatch (movements are append-only).
- `currentLocation` cannot go stale in the UI; it always reflects live lot
  placement, server-authoritative via RLS.
- QA can be written against the existing invariant and kind map
  (`docs/qa/cargo-module-tests.md`).

## Files

- Module UX: `docs/ux/cargo-module.md`
- Domain: `docs/domain/entities.md` (Cargo deltas), `docs/domain/states.md`
- Database: `docs/architecture/database.md` §4.6 (2 columns)
- Security: `docs/security/rbac.md`, `docs/security/rls.md` (assert only)
- Tests: `docs/qa/cargo-module-tests.md`