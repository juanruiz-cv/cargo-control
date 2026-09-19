# ADR 0004 — Physical Location vs Visual Layout Separation

- **Status:** Accepted (2026-09-19)
- **Applies to:** `cargo-control-web`, data schema, warehouse map visualization

## Context

The warehouse map must be freely editable (positions, sizes, rotations, colors,
icons, z-order) while the warehouse itself is an operational truth: locations
carry capacity, occupancy, inventory, and operational rules. Fase 2 merged both
concerns into `warehouse_location` (a node with `type`, `code`, `name`, `active`),
which cannot express layout composition, multiple maps of the same facility, or a
visual change that must never alter stock data.

Editing a map is a **presentation** action. Moving a bin on screen must never
change a lot's location, a capacity, or an operational rule; deactivating a
location must not delete its markers from published maps.

## Decision

Split the model into two fully independent submodels:

- **Physical/operational** — `facilities` and `locations` (tree of zones, bins,
  playón areas, checkpoints). A location owns capacity, operational rules, and
  (by derivation) occupancy/inventory. It has **no** visual columns.
- **Visual/presentation** — `layouts` (a named, versioned map per facility) and
  `layout_elements` (placement records: `x`, `y`, `width`, `height`, `rotation`,
  `color`, `icon`, `z_index`). Elements optionally link to a location through
  `location_id` (nullable) but carry **no** operational data.

Hard invariants:

1. `layout_elements` never stores capacity, inventory, or operational rules.
2. `locations` never stores `x/y/width/height/rotation/color/icon/z_index`.
3. A location may appear in zero, one, or many layouts; a layout may contain
   decorative elements with no location link.
4. Deleting or archiving a location never deletes layout elements; the marker
   simply keeps pointing at the (deactivated) location or becomes standalone.
5. Occupancy and inventory are **derived** from `item_lots` (ADR 0003 balance
   invariant); they are never stored on the location, so a layout edit can never
   corrupt stock truth.

## Consequences

- Single source of truth for stock: layout changes are zero-risk for inventory.
- Free map design: multiple versions, draft/published lifecycle, decorations.
- One extra join (`layout_elements -> locations`) when rendering markers.
- The Fase 1 brand tokens for zones/status remain presentation-layer concerns
  (colors/icons live on elements), consistent with `docs/brand/colors.md`.