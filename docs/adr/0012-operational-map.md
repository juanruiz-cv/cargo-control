# ADR 0012 — Operational Map: live read projection of the layout

- **Status:** Accepted
- **Date:** 2026-09-19
- **Fase:** 11 — Mapa operativo (Prompt 12)

## Context

Fase 11 builds the main screen — MAPA OPERATIVO — representing PLAYÓN,
GALPÓN, SECTORES 1-12, SCANNER, BALANZA, REZAGO, SECUESTRO. The layout
must be loaded from Supabase (not hardcoded); each element shows name,
code, status, occupancy and capacity; the playón shows present trucks;
selecting a truck shows detail, merchandise, state, movements and
allowed actions; a sector shows capacity, occupancy, merchandise and
movements; the special areas show their specific info.
Zoom/pan/fit-to-screen, legend and filters are required. Visual states:
LIBRE, PARCIAL, OCUPADO, BLOQUEADO, MANTENIMIENTO. The interface must
update states without redrawing the whole application.

The platform already models every piece: `layouts` + `layout_elements`
with `element_type` (playon/warehouse/storage/scanner/scale/quarantine/
seizure/…) from Fase 4 (ADR 0005); `location_occupancy` view with
capacity + occupancy per dimension from Fase 5 (ADR 0006); trucks with
`status = 'in_playon'` from Fase 7 (ADR 0008); holds from Fase 10
(ADR 0011).

## Decisions

1. **The map is a read projection, not a new model.** The map renders
   the published `layout` for the facility, joined with
   `location_occupancy`, trucks, and open holds. NO new geometry or
   occupancy model; `layout_elements.element_type` already covers every
   element the prompt lists.

2. **Layout comes from Supabase, never hardcoded.** The map loads
   `layouts.status = 'published'` with its `layout_elements`; if no
   published layout exists, the map shows an empty state and the setup
   prompt — it never falls back to a stale client-side arrangement.

3. **Five visual states — four derived, one stored.** The states are a
   read-side projection (consistent with ADR 0008 display-state
   doctrine):
   - LIBRE: occupancy = 0 across known dimensions;
   - PARCIAL: 0 < occupancy < capacity on at least one dimension;
   - OCUPADO: occupancy ≥ capacity on any known dimension;
   - BLOQUEADO: an open hold (rezago/secuestro) exists on a lot placed
     at the location;
   - MANTENIMIENTO: the only stored state — new
     `locations.maintenance boolean not null default false`
     (schema v7). Maintenance is a first-class operational condition,
     not derivable from occupancy, and must be administratively set.

4. **Trucks on the playón come from `trucks.status = 'in_playon'`;**
   their detail reuses the trucks module projection (ADR 0008) and the
   movements timeline (Fase 9).

5. **Selection panels reuse existing module specs:** truck → trucks
   detail + timeline; sector → location_occupancy + merchandise (cargo
   module) + timeline; scanner/balanza/rezago/secuestro → special areas
   spec (Fase 10, ADR 0011). No duplicated screen logic.

6. **Updates without redrawing the whole app:** the map subscribes to
   incremental change signals (Realtime/polling) per element key; a
   state change updates only that element's card badge and derived
   color, never a full application refresh. Derived state stays
   client-side over a change feed, matching the source-of-truth-in-DB
   principle.

7. **Permissions reuse the catalog:** map read = `warehouse.read`
   (facilities, locations, layouts); detail panels use the module read
   permissions they belong to (trucks/cargo/scanner/scale/quarantine/
   seizure). No new codes; RLS/RBAC unchanged (asserted).

## Consequences

- Schema v7 = one new column (`locations.maintenance`); no other DDL,
  no migration beyond that flag.
- The main screen is composition over existing specs — no new domain
  tables, no duplicated queries.
- State derivation is documented as a precise rule so tests can assert
  each of the 5 states deterministically.
- Map QA covers the no-hardcoding requirement, state derivation, live
  update without full redraw, permissions and org isolation.

## References

- ADR 0005 (floor plan editor / layout elements), ADR 0006 (capacity &
  occupancy), ADR 0008 (trucks), ADR 0011 (special areas),
  ADR 0010 (movement engine/timeline).