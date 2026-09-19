# User Journeys — Cargo Control

Five end-to-end journeys around the main flow:

`INGRESO DEL CAMIÓN → PLAYÓN → CONTROL → DESCARGA TOTAL O PARCIAL → ALMACENAMIENTO / SCANNER / BALANZA / REZAGO / SECUESTRO → MOVIMIENTOS → EGRESO`

## Journey 1 — Truck arrival and yard check-in

1. Conductor arrives at the gate with manifest.
2. Operador de playón registers the truck (plate), driver, and carrier company.
3. System creates the cargo (manifest items with quantities) and records the
   **arrival** event.
4. Truck is guided to the playón; status `in_playon`, items `on_truck`.
5. Auditor sees arrival event immediately (traceability starts here).

## Journey 2 — Control and full/partial discharge

1. Operador de playón starts control/discharge.
2. If **partial discharge**: the operator records per item the quantity
   discharged; the remainder stays as an `on_truck` lot (remanente).
   Example: item `MER-A` with 1000 units → discharge 300 units; 700 remain
   on the truck (later split again).
3. If **total discharge**: all item quantities leave the truck.
4. Discharged quantities become lots staged at the playón/control checkpoint,
   awaiting scanning/weighing.

## Journey 3 — Distribution with splitting (the canonical example)

Item `MER-A`, 1000 units, is distributed into:

| Quantity | Destination      |
| -------- | ---------------- |
| 300      | Sector 3 (galpón)|
| 250      | Sector 8 (galpón)|
| 150      | Scanner          |
| 100      | Balanza          |
| 100      | Rezago           |
| 100      | Camión (remanente) |

1. Operador splits 1000 → lots (300, 250, 150, 100, 100, 100), each lot with
   destination location and status.
2. Each lot is a tracked allocation; any lot can be split again or transferred
   later.
3. Sum invariant: quantities of the leaf lots must equal the item total.

## Journey 4 — Remnant on truck and egress

1. Truck keeps the remaining 100 units (`on_truck` lot).
2. Conductor receives release; operator records **egress** for the truck.
3. Items fully discharged are not tied to the truck anymore; the truck is free
   to leave independent of cargo state.
4. If a truck must leave with merchandise still undischarged, the `on_truck`
   lots must be acknowledged (balance before egress).

## Journey 5 — Traceability and audit

1. Auditor opens any cargo/item/lot → complete event trail
   (arrival, splits, scans, weighings, holds, releases, transfers, egress).
2. Every event shows actor, timestamp, location, reason (when sensitive).
3. Corrections appear as linked events referencing the original — history is
   never rewritten.

## Secondary journeys (referenced in epics)

- **Rezago resolution:** supervisor opens case → item frozen → resolution or
  release → lot resumes normal lifecycle.
- **Seizure process:** supervisor opens seizure with legal reference → lot
  blocked (frozen) → evidence attached → resolution.
- **Admin setup:** administrator creates users, roles, zones, catalogs.