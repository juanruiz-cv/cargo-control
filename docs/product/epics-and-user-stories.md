# Epics and User Stories — Cargo Control

Story format: `As a <persona>, I want <capability>, so that <value>`.
Priority: **P0** (MVP), **P1** (short-term), **P2** (future).

## E1 — Trucks, drivers, and transport companies

- **E1-1 (P0):** As an Operador de playón, I want to register truck plates and
  carrier companies, so that arrivals are identified correctly.
- **E1-2 (P0):** As an Operador de playón, I want to search/register drivers,
  so that each arrival records its conductor.
- **E1-3 (P0):** As an Operador, I want to see a truck's status and current
  location, so that the yard queue is visible.
- **E1-4 (P1):** As an Operador, I want truck capacity and current load, so
  that partial discharge is planned.

## E2 — Arrival, playón, control, and discharge

- **E2-1 (P0):** As an Operador de playón, I want to register arrival of a
  truck with its manifest (cargo + items + quantities), so that goods are
  identified from the start.
- **E2-2 (P0):** As an Operador de playón, I want to discharge **total** or
  **partial** quantities per item, so that a truck can keep merchandise.
- **E2-3 (P0):** As an Operador, I want the remnant (`on_truck`) visible per
  item, so that re-discharge is possible.
- **E2-4 (P0):** As an Operador, I want to record egress of a truck, so that
  its journey closes.
- **E2-5 (P1):** As an Operador, I want control checks (verification vs
  manifest) recorded, so that discrepancies are flagged.

## E3 — Storage and item splitting

- **E3-1 (P0):** As an Operador, I want to split an item quantity into lots
  with destination location, so that 1000 units → 300/250/150/100/100/100
  works.
- **E3-2 (P0):** As an Operador, I want to transfer a lot to another location,
  so that merchandise can be reorganized.
- **E3-3 (P1):** As an Operador, I want to view stock per location and per
  item, so that occupancy is clear.
- **E3-4 (P1):** As an Operador, I want to split an existing lot again, so that
  quantities remain divisible (chained splits).

## E4 — Scanner

- **E4-1 (P0):** As an Operador scanner, I want to scan/enter a lot at a
  checkpoint, so that checkpoints record identity quickly.
- **E4-2 (P1):** As an Operador scanner, I want barcode/QR scanning with
  damaged-code manual entry, so that workflow continues without blocking.
- **E4-3 (P2):** As a Supervisor, I want scan mismatch alerts, so that
  discrepancies surface immediately.

## E5 — Scale (balanza)

- **E5-1 (P0):** As an Operador balanza, I want to attach weight readings to
  lots with tolerance validation, so that overweight/underweight is caught.
- **E5-2 (P0):** As an Operador balanza, I want out-of-tolerance readings to
  raise an alert instead of silently accepting, so that data stays trustworthy.
- **E5-3 (P1):** As an Auditor, I want scale history per lot, so that weight
  evidence is reproducible.

## E6 — Rezago (leftover/backlog hold)

- **E6-1 (P0):** As a Supervisor, I want to open a rezago case on a lot with a
  reason, so that the lot is visibly held.
- **E6-2 (P0):** As a Supervisor, I want to resolve/release a rezago case, so
  that the lot resumes normal flow.
- **E6-3 (P0):** As an Operator, I want lots under rezago to be frozen for
  normal movements, so that integrity is preserved.

## E7 — Secuestro (seizure, blocked)

- **E7-1 (P0):** As a Supervisor, I want to open a seizure record with legal
  reference, so that lots are blocked.
- **E7-2 (P0):** As a Supervisor, I want blocked lots to be frozen from stock
  movements, so that seized goods cannot circulate.
- **E7-3 (P1):** As a Supervisor, I want evidence documents attached, so that
  the case has support.

## E8 — Movements and traceability

- **E8-1 (P0):** As an Auditor, I want the full event trail of any cargo/item/
  lot (immutable), so that every step is verifiable.
- **E8-2 (P0):** As an Operator, I want movement history by location and by
  lot, so that current state and history are both available.
- **E8-3 (P0):** As an Auditor, I want corrections to appear as linked events,
  so that history is never rewritten.

## E9 — Audit, users, roles, permissions

- **E9-1 (P0):** As an Admin, I want user CRUD and role assignment
  (admin/supervisor/operator/guard/auditor), so that access is controlled.
- **E9-2 (P0):** As an Admin, I want every sensitive action audit-logged with
  actor and reason, so that accountability holds.
- **E9-3 (P1):** As an Auditor, I want a read-only audit browse view, so that
  reviews do not require direct DB access.

## E10 — Reports and dashboard

- **E10-1 (P1):** As a Supervisor, I want KPIs (cargo in playón, open rezago,
  open seizures), so that operations overview is instant.
- **E10-2 (P1):** As an Auditor, I want exportable traceability reports, so
  that evidence can be shared.

## Traceability guarantee (cross-cutting)

Every story that mutates merchandise implicitly requires an append-only
`checkpoint_event` with actor, timestamp, location, quantity (delta or
absolute), and reason when sensitive.