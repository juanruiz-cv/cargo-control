# ADR 0006 — Capacity & Occupancy: derived occupancy, DB-enforced guard, audit

- **Status:** Accepted (2026-09-19)
- **Applies to:** `cargo-control-web`, data schema (v3)

## Context

Fase 5 requires every location to carry three optional capacity dimensions —
weight (kg), volume (m³), units — and to display max / used / available / %
occupancy. The operator must not be able to create negative quantities or
capacities, place stock beyond capacity, or shrink a capacity below the
current occupancy. Every capacity modification must be audited.

The schema already has capacity columns on `locations`
(`capacity_max_kg`, `capacity_max_volume_m3`, `capacity_max_units`, schema v2,
ADR 0005) and D7 declares occupancy **derived** from `item_lots`. The open
points were: (a) there is no per-lot volume source, (b) where the invariants
are enforced, and (c) what "occupancy" counts exactly (holds? lots on trucks?
lots without weight/volume data?).

## Decision

1. **Occupancy is derived, never stored (D7).** Per dimension and location:

   - `occupancy_kg = Σ quantity × COALESCE(lot.unit_weight_kg, item.unit_weight_kg)`
   - `occupancy_m3 = Σ quantity × COALESCE(lot.unit_volume_m3, item.unit_volume_m3)`
   - `occupancy_units = Σ quantity` for lots whose `uom = 'unit'`

   computed over lots at rest at the location (`current_location_id = X`),
   **including holds** (`in_quarantine`, `seized`). Lots on a truck
   (`current_truck_id`) never count. Exposed as a `location_occupancy` view.

2. **Volume source (schema v3):** add nullable `unit_volume_m3` with
   `CHECK (> 0)` to `cargo_items` (line default) and `item_lots` (override),
   mirroring the existing `unit_weight_kg` pair.

3. **Missing data is visible, not blocked.** A lot without weight (resp. volume)
   data contributes 0 to that dimension and is counted in `missing_weight_lots`
   / `missing_volume_lots` so the UI can flag incomplete data. Unknown
   dimensions cannot be overflow-checked; the guard enforces only computable
   totals. Quantity is never optional: `quantity > 0` is already a CHECK.

4. **Null capacity = unlimited.** A dimension with `NULL` capacity is not
   guarded and renders as unlimited. `>= 0` values are guarded.
   `capacity = 0` permits zero occupancy only.

5. **Invariants enforced in the database (single writer), same transaction:**
   - `CHECK` columns: `quantity > 0` (exists), `capacity_* >= 0 or null` (v2).
   - `lot_placement_capacity_guard` trigger (item_lots INSERT/UPDATE): rejects a
     placement that would push any known dimension over capacity; locks the
     target `locations` row `FOR UPDATE` so concurrent placements serialize.
     `occupancy == capacity` is allowed.
   - `locations_capacity_guard` trigger (UPDATE of `capacity_*` columns):
     rejects any reduction below the current occupancy (equal is allowed);
     `NULL → value` requires occupancy ≤ value; `value → NULL` is always
     allowed (unlimited).

6. **Audit:** `locations_capacity_audit` trigger appends an `audit_log` row
   (`action = 'capacity.set'`, `entity_type = 'location'`, `before/after`
   jsonb with the three capacity values) on every capacity modification.
   Placement history is already audited by the movement spine.

7. **Rejected operations raise exceptions; nothing is written, nothing is
   audited** (an attempt is not a change). The RLS matrix keeps capacity edits
   under the existing `locations` write rules.

## Consequences

- The four display metrics are pure read-side projections:
  `max = capacity`, `used = occupancy`, `available = capacity − used`,
  `% = used / capacity × 100` (all nullable when capacity is NULL).
- Invariants hold even with concurrent operators and bypass attempts; the app
  layer cannot corrupt occupancy because it never writes it.
- Guarded placement requires weight/volume data to become fully enforceable —
  this motivates the Fase 5–6 capture workflow (scale/scanner ops) for
  `missing_*` lots.
- A small schema v3 delta (two columns + view + three triggers); no renames.
  Unit-count occupancy is limited to `uom = 'unit'` in the MVP; other count
  uoms (pallets, bundles) need a uom-conversion catalog (future evolution).

## Files

- Spec: `docs/domain/capacity-occupancy.md`
- Tests: `docs/qa/capacity-occupancy-tests.md`
- Schema: `docs/architecture/database.md` §4.2, §4.6, §7 (v3), §8
- Rules: `docs/domain/business-rules.md` §10