# Business Rules — Cargo Control (operational)

Detailed operational rules (Fase 2). Enforced in the data layer
(PostgreSQL constraints/triggers, RLS, Edge Functions).

## 1. Arrival and identity

- A cargo is created with a unique human-readable code at truck arrival.
- Arrival records truck, driver (from registry), carrier company, and the
  manifest (items + quantities).
- An item is created with `total_quantity > 0`; zero-quantity items are invalid.
- Discharge may start only after the truck is `in_playon`.

## 2. Full and partial discharge

- **Total discharge:** the full item quantity leaves the truck in one operation.
- **Partial discharge:** the operator records the quantity discharged; the
  remainder stays as an `on_truck` lot (remanente) linked to `truck_id`.
- The truck can leave (egress) while undeclared remnants exist, but the egress
  must acknowledge the `on_truck` balance (AC-E2-2).
- Discharged quantities stage at the control checkpoint (location
  `type=checkpoint`).

## 3. Splitting and quantities (ADR 0003)

- An item or existing lot can be split into any quantities (chained splits).
- **Invariant:** for every item, Σ leaf lot quantities = `total_quantity`.
  Splits/transfers are a transaction: the trigger recomputes and rejects the
  operation if the invariant would break.
- Quantities are numeric with an item `uom`; partial units are allowed only if
  the `uom` permits fractions (e.g. liters vs units).
- Every split/transfer creates the destination lot and reduces the source via
  events — in-place UPDATE of lot history is forbidden.

## 4. Remnant on truck

- `on_truck` lots are normal lots in the traceability model: they can be
  discharged later (re-discharge), split, or leave with the truck.
- A cargo whose full quantity has left the truck is independent of the truck.

## 5. Scanner and scale checkpoints

- A lot scanned at a checkpoint records identity + checkpoint + operator.
- A weighing attaches `gross/tare/net`; if `net` falls outside
  `expected ± tolerance`, the reading is recorded `within_tolerance=false` and
  **raises an alert** — it is never silently accepted (AC-E5-2).
- Damaged barcodes allow manual entry of the lot code; the event remains
  identical in the trail.

## 6. Rezago (hold/warning)

- Opening a rezago case requires a reason; the lot becomes frozen.
- Frozen lots: no normal stock movements (store, transfer, load_out).
- Resolution requires a resolution record (supervisor) with reason;
  release restores the prior lifecycle state.

## 7. Secuestro (seizure/blocked)

- Opening a seizure requires a legal reference; the lot becomes **blocked**.
- Blocked lots are frozen; only evidence transfer linked to the seizure is
  permitted. Attempted movements are refused and audit-logged (AC-E7-2).
- Resolution closes the case and unfreezes the lot.

## 8. Tracing and corrections

- Every merchandise mutation emits a **movement** event
  (actor, timestamp, location, quantity, reason when sensitive).
- Corrections never modify the original row: a `correction` movement references
  `previous_movement_id` (AC-E8-3).
- Sensitive actions (quarantine, seizure, release, role change) always write
  to `audit_log` with actor and reason (AC-E9-2).
- **Visual ≠ logistic (Fase 14, ADR 0015):** editing/restoring/publishing a
  layout never emits a movement; layout operations are administrative
  `audit_log` rows (`layout.create/publish/restore/edit`). Capacity
  changes DO require validation + audit (`capacity.set`).

## 9. Access and data quality

- Operators see only their `org_id` (RLS).
- No fictional seed that could be confused with production data.
- Required references enforced by foreign keys; no dangling references.

## 10. Capacity and occupancy (Fase 5, ADR 0006)

- Each location has three **optional** capacity dimensions: `capacity_max_kg`,
  `capacity_max_volume_m3`, `capacity_max_units`. `NULL` = unlimited.
- **Occupancy is derived from `item_lots` at rest at the location**
  (per dimension: weight = Σ qty × unit_weight, volume = Σ qty × unit_volume,
  units = Σ qty with `uom='unit'`). It is never written as a column.
- Holds (`in_quarantine`, `seized`) still occupy physical space and count;
  lots on a truck never count.
- **Forbidden:** negative `quantity`; negative capacity; a placement that
  would exceed any known capacity (occupancy == capacity is allowed); a
  capacity reduction below the current occupancy (`NULL → value` below
  occupancy is also rejected; `value → NULL` unlocks).
- A placement that would overflow, or a capacity cut that would under-cut,
  fails the whole transaction and writes nothing.
- Lots without weight/volume data are **flagged** (`missing_weight_lots` /
  `missing_volume_lots`), not summed as zero.
- Every accepted capacity change appends an `audit_log` row
  (`action='capacity.set'`, before/after jsonb); rejected attempts leave no
  audit row. Guard triggers serialize concurrent placements per location.