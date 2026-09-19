# Flows — Cargo Control

State machines for the main flow. Guards validate transitions; every transition
emits an append-only `checkpoint_event`.

## Overall flow

```
INGRESO DEL CAMIÓN
        ↓  (cargo + manifest, items on_truck)
      PLAYÓN
        ↓  (truck arrives at yard bay)
     CONTROL
        ↓  (verification vs manifest)
DESCARGA TOTAL O PARCIAL
        ↓  (quantity → lots at control checkpoint; remainder on_truck)
ALMACENAMIENTO / SCANNER / BALANZA / REZAGO / SECUESTRO
        ↓  (lots stored, scanned, weighed, held, seized)
    MOVIMIENTOS
        ↓
      EGRESO
```

## Cargo (rollup)

`received` → `in_playon` → `in_control` → `discharging` → `discharged`
→ `distributed` → `closed` (all quantities handled and truck egressed)

- Cargo status is a **rollup** of its item/lot states; a cargo is `closed` when
  balance holds, holds are resolved, and the truck egressed.

## Item

`pending` (on truck) → `discharged` → `distributed` → `closed`
with flags: `has_rezago`, `has_seizure`.

## Lot state machine

```
on_truck ──discharge──▶ discharged (playón) ──store──▶ in_warehouse
   │                          │                          │
   │                          ├──scan──▶ checked          ├──transfer──▶ (another location)
   │                          └──scale──▶ (weight recorded)
   │
   │──split──▶ child lots (chained splits anytime)
   │
   ├─quarantine─▶ in_quarantine ──release──▶ released ──▶ (prior state)
   ├─seizure────▶ seized (blocked) ──resolve──▶ released ──▶ (prior state)
   │
   └─load_out──▶ loaded_out (leaves via truck)
```

## Guard table (lot transitions)

| From            | Event              | Guard                                             |
| --------------- | ------------------ | ------------------------------------------------- |
| `on_truck`      | `discharge`        | cargo `in_playon`; qty ≤ current lot              |
| `discharged`    | `scan`             | lot at scanner checkpoint                         |
| `discharged`    | `scale`            | lot at scale checkpoint; tolerance checked        |
| `discharged`    | `store`            | lot at control checkpoint; qty balanced           |
| `in_warehouse`  | `transfer`         | target location active; not frozen                |
| any full lot    | `split`            | Σ invariant holds after split                     |
| any            | `quarantine`       | supervisor; reason required                       |
| any            | `seizure`          | supervisor; legal_ref required                    |
| `in_quarantine`/`seized` | `release` | supervisor; resolution note required        |
| any            | `load_out`         | not frozen; egress acknowledged                   |

## Egress

- Truck egress records departure time and acknowledges any `on_truck`
  remnants; `egress` event closes the truck journey and the cargo when
  balances and holds are resolved.