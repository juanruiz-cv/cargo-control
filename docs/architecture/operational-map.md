# Operational Map — Architecture Specification (Fase 11 / Prompt 12)

The main screen is a **read projection** of the published layout plus
occupancy, trucks and holds. It composes existing module specs; it adds
no new domain model beyond one flag.

## Map load

- Source: `layouts` with `status = 'published'` for the facility, joined
  with `layout_elements` (geometry in px; ADR 0005).
- **Never hardcoded.** If no published layout exists, the map renders an
  empty state + "configurar mapa" action; the client never falls back to
  a baked-in arrangement.
- Element binding: `layout_elements.location_id` → `locations` (code,
  name, capacity); `element_type` drives rendering+info defaults
  (playon/warehouse/storage/scanner/scale/quarantine/seizure/…).

## Element data

Per element the map shows:

| Field | Source |
| ----- | ------ |
| nombre | `layout_elements.name` (fallback `location.name`) |
| código | `location.code` |
| estado | derived visual state (below) |
| ocupación | `location_occupancy.occupancy_*` (kg/m³/units) |
| capacidad | `location_occupancy.capacity_*` (+ %) |

## Visual state derivation (read-side, deterministic)

Rule precedence (first match wins):

1. **MANTENIMIENTO** — `locations.maintenance = true` (only stored
   state).
2. **BLOQUEADO** — an open hold (`quarantine_operations` / open
   `seizure_operations`) exists on a lot placed at this location.
3. **OCUPADO** — any known dimension occupancy ≥ capacity.
4. **PARCIAL** — 0 < occupancy < capacity on at least one known
   dimension.
5. **LIBRE** — otherwise (occupancy 0 across known dimensions).

Null capacity = unlimited → the dimension never forces OCUPADO (Fase 5
rule). Missing weight/volume lots are flagged, not treated as zero (D7
missing-data rule) — state uses the *known* dimension only.

## Playón — trucks present

`trucks.status = 'in_playon'` lists trucks on the playón; each truck
card on the map shows plate + derived state (ADR 0008). Selecting opens
the trucks detail (merchandise via cargo manifests/lots, movements via
timeline, allowed actions via kind→permission map — Fase 9).

## Detail panels (reuse existing specs)

| Selection | Shows | Spec |
| --------- | ----- | ---- |
| Truck | detail, merchandise, state, movements, allowed actions | trucks module (Fase 7), timeline (Fase 9) |
| Sector / galpón | capacity, occupancy, merchandise, movements | capacity-occupancy (Fase 5), cargo (Fase 8), timeline (Fase 9) |
| Scanner / Balanza | queues + performed ops | special areas (Fase 10) |
| Rezago / Secuestro | open holds + history + docs | special areas (Fase 10) |

No duplicated logic; panels are the same components the module routes
expose, embedded in the map.

## Update model (no full redraw)

- The map holds a per-element state map keyed by
  `layout_element_id | location_id`.
- Change signals (Supabase Realtime subscriptions / short poll where
  realtime is unavailable) deliver incremental events: occupancy
  changes, movement events, hold open/resolve, truck arrival/departure,
  maintenance flag change.
- On event, only the affected element re-renders (keyed React node,
  derived color/badge recomputed); the canvas, other elements, filters
  and legends remain untouched. **No full application refresh.**

## Permissions

- Map read: `warehouse.read` (facilities, locations, layouts).
- Truck detail: `truck.read`; cargo/merchandise: `cargo.read`;
  scanner/scale: `scanner.read` / `scale.read`; holds:
  `quarantine.read` / `seizure.read`.
- Actions in panels: existing kind→permission map (Fase 9). No new
  codes; RLS/RBAC unchanged (asserted in `rls.md`/`rbac.md`).

## Schema v7

Only delta: `locations.maintenance boolean not null default false`
(ADR 0012). No other DDL, no renames.