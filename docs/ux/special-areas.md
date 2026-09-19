# Special Operational Areas — UX Specification (Fase 10 / Prompt 11)

Four operator-facing areas: Scanner, Balanza, Rezago, Secuestro. All data
comes from the movement spine + specialized operation tables
(`docs/architecture/special-areas.md`); nothing is ever deleted and the
UI never offers delete.

## Route guard

| Route | Required permission |
| ----- | ------------------- |
| `/areas/scanner` | `scanner.read` (queues + results) |
| `/areas/balanza` | `scale.read` |
| `/areas/rezago` | `quarantine.read` |
| `/areas/secuestro` | `seizure.read` |
| write actions (capture, weigh, open case) | `scanner.create` / `scale.create` / `quarantine.create` / `seizure.create` |
| hold resolution | server-side supervisor flow (`release` via engine) |

No new permission codes.

## ScannerStation

Two-column layout:

- **Pending queue** (left) — derived from `station_queue` where
  `checkpoint_kind = scan`: cards of lots awaiting capture showing item
  description/sku, quantity + uom, manifest ref, truck plate (if
  relevant). Each card has **Capture** action (opens ScanDialog).
- **Performed operations** (right) — table/cards of `scanner_operations`,
  newest first: scanned code, result badge (success / not_found /
  ambiguous / error), item, date (`scanned_at`), user (`operator_id`).
  History never empties; pagination with "Cargar más".

### ScanDialog

- Barcode/QR input (device focus optional via `device_id`), code shown,
  "Registrar" button.
- Result states: success → moves lot along (scan_in/scan_out movement);
  not_found / ambiguous / error → still records the operation row with
  that result + operator note; operator can retry or route the lot
  elsewhere.
- Disabled without `scanner.create`.

## ScaleStation

- **Pending queue** (left) — from `station_queue` where
  `checkpoint_kind = scale`.
- **Weigh form** (center) — selects truck (derived from lot placement;
  shows plate), then reads/entry: gross_kg, tare_kg, net_kg (gross −
  tare), unit (kg) with item uom shown, date, user auto-filled.
  Tolerance: expected_kg + tolerance_kg shown; within_tolerance badge
  (green/red) at save time.
- **Weigh history** (right) — `scale_operations`, newest first: truck,
  gross/tare/net, unit, date, user; history never empties.
- Save disabled without `scale.create`; validation rejects non-positive
  net (CHECK + engine).

## RezagoPanel

- **Open cases** (default tab) — `quarantine_operations` with
  `status = open`: item, quantity (derived), reason, opened_by,
  opened_at, observaciones; each has a **freeze** badge (lot cannot
  move).
- **History** (tab) — ALL cases (open + resolved + released) newest
  first: same fields + resolved_by/resolved_at/resolution_note. Never
  emptied.
- **RezagoDialog** (open case) — item_lot, quantity shown (derived),
  motivo (`reason`, required), observaciones (free text → notes shown
  on the case). Requires `quarantine.create`.
- Resolution: **server-side** flow (supervisor) emits `release` and
  updates case; panel only shows status, never a delete button.

## SecuestroPanel

- **Open cases** (default tab) — `seizure_operations` with
  `status = open`: item, quantity (derived), motivo/`legal_ref`,
  opened_by, opened_at, estado, observaciones, and **documentación**
  (attachment chips: name, mime, size, uploaded_by; click to view).
- **History** (tab) — ALL cases (open + resolved): same fields +
  resolved_by/resolved_at/resolution_note.
- **SecuestroDialog** (open case) — item_lot, quantity shown (derived),
  motivo (`legal_ref`, required, e.g. court reference), observaciones;
  **Agregar documento** (upload → `attachments` with
  `entity_type = seizure_operation`); requires `seizure.create`.
- Resolution: server-side supervisor flow; status shown, never deleted.

## Shared interaction notes

- All lists lazy-load (page 20, "Cargar más"); queues are live-refreshed
  (poll/push when available).
- No optimistic writes on operations: rows appear after the engine
  commits; rejected attempts surface as toast with audit reason.
- History is read-only in every area — no edit, no delete, no "limpiar".

## Accessibility

- Queues are `<ol role="list">`; result/status badges carry text labels
  (color never sole signal); dialogs focus-trapped; forms label inputs.