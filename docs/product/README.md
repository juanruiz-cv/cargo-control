# Product — Cargo Control

Platform for the control and traceability of shipments and goods. Operators track
trucks, cargo units, warehouse locations, and checkpoint events (scan and scale),
with support for quarantines and seizures and full auditability.

## Goal

A single source of truth for where every load is, what state it is in, and who
did what and when — from arrival to departure.

## Modules

| Module       | Functions                                                                 |
| ------------ | ------------------------------------------------------------------------- |
| Dashboard    | KPIs (cargo in transit, pending quarantine, alerts), summary widgets       |
| Trucks       | Fleet registry, carrier, capacity, current status and location             |
| Cargo        | Cargo headers and cargo units, lifecycle states, code lookup               |
| Warehouse    | Locations/zones/bins, stock by location, transfer                          |
| Scanner      | Barcode/QR scan of units at checkpoints to record check-in/check-out        |
| Scale        | Weighing at checkpoints, tolerance validation, readings attached to units   |
| Quarantine   | Create/resolve quarantine cases, evidence, release                          |
| Seizure      | Seizure records, frozen states, resolution                                  |
| Movements    | Browse the immutable checkpoint event trail for any cargo/unit              |
| Reports      | Operational and traceability reports (exportable)                           |
| Audit        | Browse audit log of sensitive/admin actions                                 |
| Settings     | Users & roles, org config, catalogs (parties, locations, enums)             |

## Out of scope (MVP)

- Route planning / geofencing (future)
- Billing and invoicing (future)
- Consumer-facing tracking portal (future)

## Non-goals

- Fake data that could be confused with production data. Environments use
  clearly marked sample data only where explicitly needed.
- Full workflow features in Fase 0 — this phase is constitution and design only.