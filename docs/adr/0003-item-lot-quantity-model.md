# ADR 0003 — Quantity + Lots Merchandise Model

- **Status:** Accepted (2026-09-19)
- **Applies to:** `cargo-control-web`, data schema

## Context

The canonical use case splits merchandise into arbitrary quantities
(1000 units → 300 Sector 3, 250 Sector 8, 150 Scanner, 100 Balanza, 100 Rezago,
100 remanente en camión) and allows **partial discharge**, leaving part of the
load on the truck. Chained re-splitting and transfers must remain traceable.

The previous Fase 0 model treated `cargo_unit` as an atomic physical unit —
fitting for unit scanning, but not natural for quantity aggregates such as
"1000 units" or "100 stay on the truck".

## Decision

Use a **quantity + lots** model:

- `cargo_item` — merchandise line with `total_quantity` and `uom`.
- `item_lot` — an allocation of `quantity` to a `location_type`
  (`playon | warehouse | checkpoint | truck`); when `on_truck`, points to a
  `truck_id`. Lots are split via `parent_lot_id` (chained splits).
- **Balance invariant:** Σ leaf lot quantities per item = `total_quantity`,
  enforced atomically by a database trigger on every split/transfer.
- State lives at **lot level**; `cargo` status is a derived rollup.
- Add `driver` registry (catalog, external persona, not an app user).
- Every mutation emits a `checkpoint_event`; corrections append, never update.

## Consequences

- Matches the canonical split example and partial discharge natively.
- Higher event/lot volume than atomic units — mitigated by indexing and
  retention strategy (`docs/architecture/risks.md`).
- Atomic barcode scanning remains available as a secondary, per-lot option
  (scanner checkpoints apply to lots at checkpoint locations).