# Operational Map — Test Specification (Fase 11 / Prompt 12)

Executable as SQL scripts / RLS integration tests against Supabase local
(E2E cases against the web client when it exists). Builds on the Fase 4
layout spec (L-*), the Fase 5 capacity spec (C-*), the Fase 7 trucks
spec (T-*), the Fase 9 movement engine spec (ME-*) and the Fase 10
special areas spec (SA-*); names here are OM-*.

Fixture: org `o1` with `u_admin`, `u_op`, `u_viewer`, `u_supervisor`;
published layout `Mapa Patio` (scale 20) with `layout_elements`:
`PLAYON` (playon, link to playón location), `GALPON` (warehouse),
`SECTOR 1..12` (storage), `Scanner` (scanner), `Balanza` (scale),
`Rezago` (quarantine), `Secuestro` (seizure). Locations with capacities
as needed; truck `T1` with `status='in_playon'`; lots as needed.

## A. LAYOUT — loaded from Supabase (never hardcoded)

| ID | Scenario | Expected |
| -- | -------- | -------- |
| OM-01 | published layout exists | map renders elements from `layouts`/`layout_elements` (geometry from DB rows) |
| OM-02 | element without `location_id` (corridor/door/other) | rendered as visual-only marker; no occupancy/state badge |
| OM-03 | layout `status='draft'` | not shown as the operational map; draft flag surfaces; no fallback to stale client layout |
| OM-04 | no published layout for the facility | empty state + "Configurar mapa" action; client shows **no** baked-in arrangement |
| OM-05 | all element types present | playon, warehouse, storage, scanner, scale, quarantine, seizure each render per `element_type` |
| OM-06 | two layouts, one `published` | map uses the published one; versioned rows remain intact |

## B. DATA PER ELEMENT (name / code / estado / ocupación / capacidad)

| ID | Scenario | Expected |
| -- | -------- | -------- |
| OM-10 | element with `name` + linked location | shows layout element name (fallback location.name) + `location.code` |
| OM-11 | occupancy + capacity present | occupancy line (kg/m³/units) + capacity + % per known dimension |
| OM-12 | NULL capacity (unlimited) | capacity rendered `∞`; dimension never forces OCUPADO |

## C. VISUAL STATE DERIVATION (LIBRE / PARCIAL / OCUPADO / BLOQUEADO / MANTENIMIENTO)

| ID | Scenario | Expected |
| -- | -------- | -------- |
| OM-20 | occupancy = 0 on all known dimensions | `LIBRE` |
| OM-21 | 0 < occupancy < capacity on ≥1 known dimension | `PARCIAL` |
| OM-22 | occupancy ≥ capacity on any known dimension | `OCUPADO` |
| OM-23 | open hold (rezago/secuestro) on a lot at the location | `BLOQUEADO` (outranks occupancy) |
| OM-24 | `locations.maintenance = true` | `MANTENIMIENTO` (outranks everything) |
| OM-25 | maintenance flag toggled off + no holds + occupancy 0 | back to `LIBRE` (no stale cache) |
| OM-26 | missing weight/volume lots (D7) | flagged, not treated as zero; state uses known dimensions only |

## D. PLAYÓN — trucks present

| ID | Scenario | Expected |
| -- | -------- | -------- |
| OM-30 | truck with `status='in_playon'` | truck chip on playón: plate + derived state |
| OM-31 | truck `status='in_route'` | not shown on the playón |
| OM-32 | truck arrives → `in_playon` event | chip appears via incremental update (no full redraw) |
| OM-33 | truck egreso → status change | chip disappears via incremental update (no full redraw) |

## E. SELECTION PANELS

| ID | Scenario | Expected |
| -- | -------- | -------- |
| OM-40 | select truck | detail + merchandise + state + movements timeline + allowed actions (Fase 9 kind→permission map) |
| OM-41 | select truck → action without permission | action hidden/disabled (e.g. `truck.exit` for viewer) |
| OM-42 | select sector/galpón/playón | capacity + occupancy + current merchandise (currentLocation rollup) + movements filtered to that location |
| OM-43 | select Scanner | specific info: pending queue (`station_queue` kind=scan) + performed ops |
| OM-44 | select Balanza | specific info: pending queue (kind=scale) + weigh form + history |
| OM-45 | select Rezago | open quarantine holds + history + docs |
| OM-46 | select Secuestro | open seizure holds + history + docs (never deleted) |
| OM-47 | drawer opens | map stays interactive behind; focus trapped; close returns focus |

## F. VIEWPORT — zoom / pan / fit / legend / filters

| ID | Scenario | Expected |
| -- | -------- | -------- |
| OM-50 | zoom in/out (buttons + wheel/pinch) | bounded 25%–400%; canvas coherent |
| OM-51 | pan by drag / scroll when zoomed | viewport moves; no data mutation |
| OM-52 | fit to screen | viewport resets to layout bounds |
| OM-53 | legend toggle | legend shows 5 state colors + element icons; hides on second click |
| OM-54 | filter by element type | matching elements only; data untouched; clear restores |
| OM-55 | filter by state | e.g. only `BLOQUEADO` elements |
| OM-56 | filter combination | additive; clear resets all |

## G. LIVE UPDATE — no full redraw

| ID | Scenario | Expected |
| -- | -------- | -------- |
| OM-60 | movement event changes occupancy of one sector | only that element's badge/occupancy re-renders; other elements, filters, legend intact |
| OM-61 | hold opens on a lot | affected location flips to BLOQUEADO in place (keyed update) |
| OM-62 | maintenance flag toggled | affected element flips to MANTENIMIENTO in place |
| OM-63 | batch of events on N elements | N keyed element updates; page not reloaded; no layout reset |
| OM-64 | update source unavailable (realtime down) | short-poll fallback keeps states current; explicit error surfaced, never stale-forever |
| OM-65 | rapid consecutive updates | last committed state wins; no optimistic overlay |

## H. PERMISSIONS & ISOLATION

| ID | Scenario | Expected |
| -- | -------- | -------- |
| OM-70 | viewer with `warehouse.read` | sees map + elements, no action buttons |
| OM-71 | user without `warehouse.read` | map route denied |
| OM-72 | org B cannot read org A layout/occupancy/holds | row policies isolate; cross-org queries return no rows |
| OM-73 | `maintenance` update | admin-write flow only; regular operator cannot set it |
| OM-74 | scanner/scale panel for user without `scanner.read`/`scale.read` | panel content hidden; no data leak |
| OM-75 | holds panel for user without `quarantine.read`/`seizure.read` | panel content hidden; no data leak |

## I. EDGE CASES

| ID | Scenario | Expected |
| -- | -------- | -------- |
| OM-80 | layout element deleted after publish | element hidden (is_visible=false or gone); history intact |
| OM-81 | location archived while layout standing | marker remains rendered (ADR 0005); no location delete cascades |
| OM-82 | sector with capacity only in kg, volume NULL | occupancy computed on known dimension; no division by zero |
| OM-83 | org with 0 published layouts + 0 elements | empty state, no crash |