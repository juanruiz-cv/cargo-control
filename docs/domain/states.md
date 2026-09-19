# States — Cargo Control

Canonical state sets per entity. These map to the status enums in
`docs/domain/entities.md` and to the UI status mapping in
`docs/brand/colors.md`.

## user_role (roles.code)
`admin | supervisor | operator | scanner_operator | scale_operator | auditor | viewer`
(Fase 6 set; Fase 3 `guard` retired — scanner/scale halves inherit)

## truck_status
`available | in_playon | in_route | out_of_service | inspection`

## driver_status
`active | disabled`

## cargo_item_status
`pending` (receives → `on_truck`) | `discharged` | `distributed` | `closed`

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

## movement_kind (movements.kind)
`arrival | discharge | split | transfer | scan_in | scan_out | scale |
 store | load_out | quarantine | seizure | release | egress | correction`

## facility_type
`warehouse | site | plant`

## layout_status
`draft | published | archived`

## quarantine_operation_status (rezago)
`open | resolved | released`

## seizure_operation_status (secuestro)
`open | resolved`

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