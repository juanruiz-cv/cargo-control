# Movements Timeline — UX Specification (Fase 9 / Prompt 10)

## Purpose

Show every movement the engine applied, newest first, with the five
fields the prompt requires — origin, destination, quantity, date, user —
plus filters and a detail drawer. The timeline is read-only; all
movement creation happens through the existing per-module dialogs
(cargo split/transfer, trucks entry/exit, scanner, scale, holds), which
are gated by the kind → permission map (ADR 0007).

## Route

`/movements` (global) and embedded per context:

- `/movements` — full timeline (facility-scoped)
- `/cargo/:manifestId` — MovementsTimeline inside manifest detail
  (already specified, Fase 8)
- `/cargo/items/:itemId` — MovementsTimeline inside item detail
- `/trucks/:truckId` — MovementsTimeline for a truck journey

## Route guard

| Route | Required permission |
| ----- | ------------------- |
| `/movements` | `cargo.read` (read of manifests/items/movements) |
| embedded timelines | read permission of the owning module (`cargo.read`, `truck.read`) |
| movement write actions | kind → permission map (ADR 0007) on the specific action |

No new permission codes are introduced.

## Components

### MovementsTimeline (route component)

Renders a vertical list of movement cards (event log style), newest
first.

Each card:

- **Movement type** — label from kind, humanized (e.g. `TRUCK_ENTRY`,
  `UNLOAD`, `RETURN_TO_TRUCK`) with a color/icon per group:
  - entry/exit: arrival, egress
  - transfer & placement: transfer, return_to_truck, load_out, discharge
  - scan/weigh: scan_in, scan_out, scale
  - holds: quarantine, seizure, release
- **Timestamp** — `occurred_at` (local, with tooltip UTC / full ISO)
- **User** — `operator_id` display name (avatar, name)
- **Origin → Destination** — from `movement_items`
  - location labels (name, optional code) or "Truck · PLATE"
  - arrow between them; several items render grouped
- **Quantity** — per item: `quantity` + uom (from the item)
- **Notes** — `reason` / item `notes` (truncated, expandable)
- **Cargo** — manifest reference (e.g. `MAN-240119-001`) and item
  description/sku as a link to the item detail

Actions on a card:

- Open **MovementDetail** drawer (read-only)
- Jump to item/manifest/truck via links

### MovementDetail (drawer)

Full record of the movement:

- Engine fields: id, kind, occurred_at, created_at, operator, facility,
  manifest, previous_movement_id (corrections), operation_key (badge),
  status = `applied`
- Movement items table: item, lot, quantity, origin, destination, notes
- Linked specialized operation (scanner_operation, scale_operation,
  quarantine_operation, seizure_operation) when present
- Audit trail link: open audit entry for this movement

### MovementFilters (toolbar)

- Kind: multi-select group (entry/exit, transfer/placement, scan/weigh,
  holds)
- Search: text over manifest ref, item description/sku, plate
- Truck: select (journey)
- User: select
- Date range: from / to (`occurred_at`)
- Clear all

### MovementWriteMenu (contextual, only when permitted)

A dropdown on the timeline / manifest detail surfaces the dialogs the
actor may use (split, transfer, return to truck, entry/exit, scan,
weigh, holds), each shown only when the kind → permission map grants the
action to that actor. The dialogs themselves are the per-module
specifications (Fase 7 trucks, Fase 8 cargo); nothing is created from
the timeline directly.

## Interaction notes

- Timeline loads lazily: page 20, "Cargar más" button (cursor-based).
- Filters debounce 300 ms; counting not required on filtered views
  (only on full-page context when useful).
- Optimistic updates: none. Movements appear only after the engine
  commits; a rejected attempt surfaces as a toast error with the audit
  reason (and the operator can retry with a fresh operation).

## Accessibility

- Timeline is a `<ol role="list">`; each card is a `<li>` with tabindex
  0; drawer is a focus-trapped dialog; color is never the only signal
  (type has text label).