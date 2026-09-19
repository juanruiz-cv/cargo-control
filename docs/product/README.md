# Product — Cargo Control

Platform for the control and traceability of shipments and goods. Operators track
trucks, drivers, carriers, cargos, merchandise items, locations, and movements —
from arrival to departure — with scanner, scale, quarantine (rezago) and seizure
(secuestro) checkpoints and full auditability.

## Goal

A single source of truth for where every load is, what state it is in, and who
did what and when — including quantity-level splitting and merchandise that can
stay on the truck (partial discharge).

## Main flow

```
INGRESO DEL CAMIÓN
        ↓
      PLAYÓN
        ↓
     CONTROL
        ↓
DESCARGA TOTAL O PARCIAL
        ↓
ALMACENAMIENTO / SCANNER / BALANZA / REZAGO / SECUESTRO
        ↓
    MOVIMIENTOS
        ↓
      EGRESO
```

- A truck can keep part of its merchandise (`on_truck` remnant).
- Merchandise items can be split into tracked lots in any quantity
  (example: 1000 units → 300 Sector 3, 250 Sector 8, 150 Scanner, 100 Balanza,
  100 Rezago, 100 camión) and any lot can be split or transferred again.
- Every operation is traceable through an append-only event trail.

## Modules

| Module       | Functions                                                                 |
| ------------ | ------------------------------------------------------------------------- |
| Dashboard    | KPIs (cargo in playón, pending rezago/seizure, alerts), summary widgets    |
| Trucks       | Fleet registry, carrier, driver, capacity, current status and location     |
| Cargo        | Cargo headers and merchandise items, lifecycle states, code lookup         |
| Warehouse    | Locations/zones/bins, lot stock by location, lot transfer                 |
| Scanner      | Barcode/QR scan of lots at checkpoints                                     |
| Scale        | Weighing at checkpoints, tolerance validation, readings attached to lots   |
| Quarantine   | **Rezago** cases: open/resolve, evidence, release                          |
| Seizure      | **Secuestro** records: blocked/frozen lots, resolution                     |
| Movements    | Browse the immutable checkpoint event trail for any cargo/item/lot         |
| Reports      | Operational and traceability reports (exportable)                         |
| Audit        | Browse audit log of sensitive/admin actions                                |
| Settings     | Users & roles, org config, catalogs (parties, drivers, locations, enums)   |

## Product docs (Fase 2)

- `personas.md` — 8 profiles (playón, scanner, balanza, supervisor, admin, auditor, driver, carrier)
- `user-journeys.md` — 5 end-to-end journeys including the canonical split
- `epics-and-user-stories.md` — 10 epics with prioritized stories (P0/P1/P2)
- `acceptance-criteria.md` — Given/When/Then criteria for critical stories
- `mvp-vs-future.md` — MVP scope and future features

## Non-goals

- Fake data that could be confused with production data.
- Complex features ahead of their domain definition.