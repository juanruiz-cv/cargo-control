# Special Operational Areas — Architecture Specification (Fase 10 / Prompt 11)

Four operational areas: **SCANNER**, **BALANZA**, **REZAGO**, **SECUESTRO**.
Two are special locations (checkpoints); two are holds on the lot. All
history is append-only; nothing is ever deleted.

## Model positioning

| Area | Kind | Table | Physical? | Effect |
| ---- | ---- | ----- | --------- | ------ |
| SCANNER | checkpoint `scan` | `scanner_operations` | yes (station) | code read; `scan_in`/`scan_out` movements |
| BALANZA | checkpoint `scale` | `scale_operations` | yes (station) | weight record; `scale` movement |
| REZAGO | hold (not a location) | `quarantine_operations` | no | **freezes** lot; `quarantine`/`release` movements |
| SECUESTRO | legal hold (not a location) | `seizure_operations` | no | **blocks** lot; `seizure`/`release` movements |

Locations table already constrains `type = checkpoint` →
`checkpoint_kind in ('scan','scale','control')` (Fase 4; `control`
remaining).

## SCANNER

**Pending queue (derived, never stored).** A lot is *pending scan* when
its current placement is at a `scan` checkpoint and no `scanner_operation`
has completed for that placement (a successful/last `result` for the
placement). Read-side view (schema v6): lots at scan checkpoints awaiting
capture, joined with item + manifest for the operator.

**Performed operations** = `scanner_operations` rows (append-only):

| Prompt field | Column |
| ------------ | ------ |
| mercadería | `item_lot_id` (→ item + manifest) |
| resultado | `result (success|not_found|ambiguous|error)` |
| fecha | `scanned_at` |
| usuario | `operator_id` |
| (code) | `scanned_code`, `device_id`, `payload` |

Each capture is linked to a `scan_in`/`scan_out` movement (`movement_id`)
so it lands in the engines timeline and audit.

## BALANZA

**Pending weight** = lots placed at a `scale` checkpoint without a
completed `scale_operation` for the placement (derived view).

**Weigh records** = `scale_operations` rows (append-only):

| Prompt field | Column |
| ------------ | ------ |
| camión | derived from lot placement / manifest truck (not a column) |
| peso bruto | `gross_kg` |
| tara | `tare_kg` |
| peso neto | `net_kg` (recorded or computed gross − tare) |
| unidad | kilogram (kg); item uom shown alongside |
| fecha | `weighed_at` |
| usuario | `operator_id` |

Tolerance: `expected_kg`, `tolerance_kg`, `within_tolerance` drive the
Fase 5 tolerance checks; a weighing creates a `scale` movement and is
part of the timeline.

## REZAGO (hold)

`quarantine_operations` (lifecycle `open → resolved → released`):

| Prompt field | Column |
| ------------ | ------ |
| mercadería | `item_lot_id` (→ item + manifest) |
| cantidad | derived: Σ leaf lots of the item at the held placement |
| motivo | `reason` (required) |
| fecha | `opened_at` |
| usuario | `opened_by` |
| observaciones | `resolution_note` (filled on resolution; free text) |

Opening a case creates a `quarantine` movement, requires supervisor
permission, and **freezes** the lot — the movement engine rejects any
further movement of it until release. Resolution: server-side supervisor
flow emits a `release` movement and updates the case status; the case
row is NEVER deleted. History = movements + case row.

## SECUESTRO (legal hold)

`seizure_operations` (lifecycle `open → resolved`):

| Prompt field | Column |
| ------------ | ------ |
| mercadería | `item_lot_id` |
| cantidad | derived (as rezago) |
| motivo | `legal_ref` (legal reference, required) |
| fecha | `opened_at` |
| usuario | `opened_by` |
| estado | `status (open|resolved)` |
| documentación | `attachments` where `entity_type = 'seizure_operation'` (files in Storage; already supported) |
| observaciones | `resolution_note` |

Opening a case creates a `seizure` movement and **blocks** the lot (no
movements of it at all). Resolution: server-side supervisor flow emits a
`release` movement and updates status; case row never deleted. Legal
documents attach to the case via the polymorphic `attachments` table.

## History / no-delete doctrine

- `scanner_operations`, `scale_operations`: append-only; no UPDATE/DELETE
  grants (RLS, ADR 0007).
- `quarantine_operations`, `seizure_operations`: case status updated only
  by the server-side resolution flow (inside a `release` transaction,
  Fase 9 engine); DELETE blocked.
- Full history = movement spine (timeline) + operation rows + audit.
- Rejected attempts (e.g. ambiguous scan) still write an operation row
  with `result = error|ambiguous` — they are historical facts, not
  transient failures.

## Derived views (schema v6)

Read-side only, no new columns:

1. `station_queue` — lots currently placed at scan/scale checkpoints
   without a completed operation for the placement, with item/manifest
   context (feeds pending queues).
2. Optionally `hold_open` — open rezago/secuestro cases with lot/item
   context for dashboards (frozen/blocked visibility).

Both are consistent with the derived-state doctrine (ADR 0008 trucks
display states, ADR 0009 currentLocation).

## Permissions

No new codes. Reads: `scanner.read`, `scale.read`,
`quarantine.read`, `seizure.read`. Writes: `scanner.create`,
`scale.create`, `quarantine.create`, `seizure.create`; hold resolution
flows remain server-side supervisor actions (`release` movement via the
Fase 9 engine). RLS/RBAC unchanged (asserted in `rls.md`/`rbac.md`).