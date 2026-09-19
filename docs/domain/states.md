# States — Cargo Control

Canonical state sets per entity. These map to the status enums in
`docs/domain/entities.md` and to the UI status mapping in
`docs/brand/colors.md`.

## operator_role
`admin | supervisor | operator | guard | auditor`

## truck_status
`available | in_playon | in_route | out_of_service | inspection`

## driver_status
`active | disabled`

## cargo_item_status
`pending` (receives → `on_truck`) | `discharged` | `distributed` | `closed`

## item_lot_status
- `on_truck` — remanente que aún viaja con el camión
- `discharged` — bajado del camión, en playón/control
- `checked` — pasó scanner
- `in_warehouse` — en sector/ubicación del galpón
- `loaded_out` — salió cargado en un camión (egreso de mercadería)
- Holds (superseding):
  - `in_quarantine` — **rezago** (warning)
  - `seized` — **secuestro** (blocked)
  - `released` — retornado a ciclo normal tras un hold

## location_type (item_lot)
`playon | warehouse | checkpoint | truck`

## warehouse_location_type
`site | zone | bin` (+ functional checkpoints `scanner | balanza | control`)

## checkpoint_kind (event)
`arrival | discharge | split | transfer | scan_in | scan_out | scale |
 store | load_out | quarantine | seizure | release | egress | correction`

## quarantine_case_status (rezago)
`open | resolved | released`

## seizure_status (secuestro)
`open | resolved`

## cargo rollup
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