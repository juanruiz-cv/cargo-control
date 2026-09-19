# States — Cargo Control

Canonical state sets per entity. These map to the status enums in
`docs/domain/entities.md` and to the UI status mapping in
`docs/brand/colors.md`.

## user_role (roles.code)
`admin | supervisor | operator | scanner_operator | scale_operator | auditor | viewer`
(Fase 6 set; Fase 3 `guard` retired — scanner/scale halves inherit)

## truck_status
`available | in_playon | in_route | out_of_service | inspection`

### truck_status display map (Fase 7, ADR 0008)

The UI badge shows one of 13 display codes, **derived read-side** — never
stored. Precedence (first match wins), reading only: base `trucks.status`,
`movements`/`movement_items` (latest first), and **open**
`scanner_operations` / `scale_operations` / `quarantine_operations` /
`seizure_operations`.

| # | Display code | Source signal |
| -- | ------------ | ------------- |
| 1 | `RETAINED` | open `quarantine_operations` |
| 2 | `SEIZED` | open `seizure_operations` |
| 3 | `IN_SCANNER` | open `scanner_operations` |
| 4 | `IN_SCALE` | open `scale_operations` |
| 5 | `PARTIALLY_UNLOADED` | discharge/split movements exist **and** on-truck `item_lots` remain |
| 6 | `UNLOADED` | discharge/split complete, no on-truck lots |
| 7 | `IN_PROCESS` | latest movement is discharge/split/transfer/store and open |
| 8 | `READY_TO_EXIT` | base `available` + no open ops + cargo released |
| 9 | `WAITING` | base `available` + latest movement `arrival`, no open ops yet |
| 10 | `EXPECTED` | manifest exists, no `arrival` movement yet |
| 11 | `ARRIVED` | latest movement `arrival`, no subsequent movement |
| 12 | `IN_PLAYON` | base `in_playon` |
| 13 | `EXITED` | latest movement `egress` |
| — | `IN_ROUTE` / `OUT_OF_SERVICE` / `INSPECTION` | pass-through when no movement/op applies |

Entry/exit for display: ingreso = first `arrival` movement timestamp; egreso
= last `egress` movement timestamp (both derived, ADR 0008 §3).

Dashboard KPIs (Fase 12, ADR 0013) derive from this same display map:
"camiones dentro del predio" = arrived-without-egress codes; "esperando" =
`WAITING`; "descargas en proceso" = `IN_PROCESS`/`PARTIALLY_UNLOADED`.
No new stored or display state is introduced for the dashboard.

## driver_status
`active | disabled`

## cargo_item_status
`pending` (receives → `on_truck`) | `discharged` | `distributed` | `closed`

### cargo_item status display (Fase 8, ADR 0009)

The item `status` is stored state; the UI also renders **placements**
(currentLocation rollup) from active `item_lots` — never a separate
column. `pending` → `on_truck` after the truck's arrival is confirmed;
splits/transfers do not change the item status directly (they create
movements; rollup follows `flows.md`).

## item_lot_status
- `on_truck` — remnant still on the truck (remanente)
- `discharged` — discharged at playón/control
- `checked` — passed scanner
- `in_warehouse` — stored in a sector/bin of the facility
- `loaded_out` — left loaded on a truck (goods egress)
- Holds (superseding):
  - `in_quarantine` — **rezago** (warning)
  - `seized` — **secuestro** (blocked)
  - `released` — returned to the normal cycle after a hold

## item_lot placement
A lot is at rest in exactly one physical place (never both, never a layout):
- `current_location_id` → `locations` (playón, control, sector/bin)
- `current_truck_id` → `trucks` (on-truck remnant)

## location_type (locations.type)
`zone | bin | playon | checkpoint` (+ `checkpoint_kind`: `scan | scale | control`
when `type = checkpoint`; `facilities` cover the former `site` type)

## location visual state — mapa operativo (Fase 11, ADR 0012)
Five visual states rendered on the operational map. Precedence (first
match wins); all but one are derived read-side:

| Estado | Rule |
|---|---|
| `MANTENIMIENTO` | stored — `locations.maintenance = true` (admin-set, not derivable) |
| `BLOQUEADO` | derived — an open hold (rezago/secuestro) exists on a lot placed at this location (`hold_open`) |
| `OCUPADO` | derived — occupancy ≥ capacity on any known dimension |
| `PARCIAL` | derived — 0 < occupancy < capacity on at least one known dimension |
| `LIBRE` | derived — otherwise (occupancy 0 across known dimensions) |

Null capacity = unlimited → never forces OCUPADO (Fase 5 rule); missing
weight/volume lots are flagged, not treated as zero (D7 missing-data
rule) — state uses the known dimensions only.

## movement_kind (movements.kind)
`arrival | discharge | split | transfer | scan_in | scan_out | scale |
 store | load_out | quarantine | seizure | release | egress | correction |
 return_to_truck` (added Fase 9, ADR 0010 — remnant placed back on a truck,
manifest stays open; maps to `cargo.transfer`)

### movement status (Fase 9, ADR 0010)

A persisted movement is an **applied** fact — there is no `status`
column, the spine is append-only. Rejected attempts never persist as
movements; they are recorded in `audit_log` with outcome `failed` +
reason + `operation_key`. `operation_key` (nullable) is unique per
organization where present (idempotency; duplicate replay rejected,
ADR 0010).

## facility_type
`warehouse | site | plant`

## layout_status
`draft | published | archived`

## quarantine_operation_status (rezago)
`open | resolved | released`

- `open` **freezes** the lot (no movement of it; Fase 9 engine rejects).
- `resolved`/`released` after the server-side supervisor `release`
  flow (movement + status update); the case row is NEVER deleted
  (Fase 10, ADR 0011 — full history kept).

## seizure_operation_status (secuestro)
`open | resolved`

- `open` **blocks** the lot (no movement of it at all).
- `resolved` after the server-side supervisor `release` flow; case row
  NEVER deleted (Fase 10, ADR 0011). Legal docs live as `attachments`
  scoped to the case.

## scanner_result (scanner_operations.result)
`success | not_found | ambiguous | error`

- Every capture produces a row, including non-success results
  (historical fact; Fase 10).

## cargo_manifest rollup
`received | in_playon | in_control | discharging | discharged | distributed | closed`
(derived from item/lot states — see `flows.md`)

## Status → UI mapping

| Domain state          | Brand token |
| --------------------- | ----------- |
| `checked`, `released`, `closed` | Success |
| `in_warehouse`, `discharged`, `distributed`, `received` | Info |
| `in_quarantine` (rezago) | Warning |
| `seized` (secuestro) | Blocked |
| operation error       | Danger |