# ADR 0005 — Floor Plan Editor: Element Taxonomy and Physical/Visual Sync

- **Status:** Accepted (2026-09-19)
- **Applies to:** `cargo-control-web`, floor plan editor, data schema (v2)

## Context

Fase 4 requires a data-driven floor plan editor for the playón + galpón: the
admin creates/edits elements with an editor taxonomy (`playon | warehouse |
storage | scanner | scale | quarantine | seizure | corridor | door | other`),
physical dimensions (meters), capacity, visual properties (pixels), and
operational flags (`isActive`, `isLocked`). ADR 0004 already separates the
physical submodel (`locations`) from the visual submodel (`layout_elements`).

The Fase 3 draft placed only a coarse `kind` enum (`location_marker | shape |
label | decoration`) on `layout_elements`, gave locations no physical-dimension
columns, and forced every marker to link a location — incompatible with
architectural elements such as doors and corridors.

## Decision

1. **Editor taxonomy, not presentation kind.** `layout_elements.element_type`
   replaces the Fase 3 `kind` enum with the single editor taxonomy
   (`playon | warehouse | storage | scanner | scale | quarantine | seizure |
   corridor | door | other`).

2. **Place types link to a physical location; architectural types may not.**
   - `playon → locations.type='playon'`
   - `warehouse`, `storage`, `quarantine`, `seizure → locations.type='zone'`
     (quarantine/seizure zones also set `allows_hold = true`)
   - `scanner → locations.type='checkpoint' checkpoint_kind='scan'`
   - `scale → locations.type='checkpoint' checkpoint_kind='scale'`
   - `corridor`, `door`, `other → location_id optional (visual-only allowed)`
   - CHECK constraint: `(element_type in ('corridor','door','other')) OR
     location_id IS NOT NULL`.

3. **Physical and visual dimensions are disjoint and never auto-synced.**
   - Physical (real-world): `locations.physical_width/height/depth` in
     `physical_unit`; capacity `capacity_max_units/kg/volume_m3`.
   - Visual (map): `layout_elements.x/y/visual_width/visual_height/rotation/
     z_index/color/icon`.
   - The only bridge is `layouts.scale` (pixels per meter) used **read-side**
     for conversions (e.g., 10 m × 8 m and scale 22 → 220 px × 176 px).
     Resizing a box on canvas never writes physical dimensions; editing
     physical dimensions in the properties panel never moves the box.

4. **Operational flags split by layer:** `isActive` → `locations.active`;
   `isLocked` (protected from edits) and `is_visible` (show/hide) are editor
   state on `layout_elements`.

5. **Delete/duplicate semantics:** deleting an element never deletes its
   location (ADR 0004 rule 4 — deactivate instead). Duplicating a place
   element clones both the new element and a new location (code suffixed
   `-copy`).

## Consequences

- One taxonomy drives the editor, the link rule, and the icon/color defaults.
- The editor structurally cannot corrupt stock truth: no physical write can
  come from a visual gesture, and no visual write can come from a physical
  edit.
- Schema evolves from the Fase 3 draft to **v2** (recorded in DECISION LOG
  record 10); both documents are pre-implementation, so no migration is
  required.
- Read-side conversions need `layouts.scale`; maps without a defined scale
  fall back to 20 px/m.