# Domain Model — Cargo Control

The domain is modelled so the **data layer is the source of truth**. Entities,
enums and relations below are the contract for the schema
(`docs/architecture/database.md`).

Merchandise follows a **quantity + lots** model (ADR 0003): an item carries a
total quantity; quantities are allocated into tracked **lots** that can be split
or transferred. State lives at lot level; a cargo's status is a rollup.

## Aggregates and entities

### org
Multi-tenancy boundary (company operating the control).
- `id uuid (PK)`, `name`, `config jsonb` (optional).

### operator
Internal platform user.
- `id uuid` (PK), `user_id uuid` → `auth.users`, `org_id`, `role`
  (`admin | supervisor | operator | guard | auditor`), `status`, timestamps.
- Rules: identity never trusted from the client; role resolved server-side.

### party
Counterparty catalog (carrier, shipper, client).
- `id`, `org_id`, `type (carrier|shipper|client)`, `name`, `tax_id`, `contacts jsonb`.

### driver
External conductor registry (catalog, not an app user).
- `id`, `org_id`, `party_id → party(carrier)` (employing company), `full_name`,
  `document_id`, `license_no`, `phone`, `status (active|disabled)`.
- A driver is reusable across trucks/arrivals.

### truck
Vehicle used to carry goods.
- `id`, `org_id`, `plate`, `carrier_party_id`, `capacity_kg`,
  `status (available|in_playon|in_route|out_of_service|inspection)`.

### cargo
Shipment/load being tracked (one per truck arrival).
- `id`, `org_id`, `code` (unique, human-readable), `truck_id`, `driver_id`,
  `shipper_party_id`, `client_party_id`, `origin`, `destination`,
  `arrival_date`, `departure_date`, `notes`.
- Rollup status derived from its items/lots.

### cargo_item
Line of merchandise with a total quantity.
- `id`, `cargo_id`, `line_number`, `sku`, `description`,
  `total_quantity` (numeric), `uom` (unidad de medida), `unit_weight_kg`,
  `status (pending|on_truck|discharged|distributed|closed)`.
- **Invariant:** sum of leaf lot quantities = `total_quantity`.

### item_lot
Quantized allocation of an item; the traceability target.
- `id`, `cargo_id`, `cargo_item_id`, `parent_lot_id` (chained splits),
  `quantity`, `uom`, `location_type (playon|warehouse|checkpoint|truck)`,
  `location_id → warehouse_location` (when warehouse),
  `truck_id` (when `on_truck`), `status`, `unit_weight_kg` (optional override),
  `created_via` (source event id).
- Splits create child lots; origin quantity is reduced by a `split` event.

### warehouse_location
Hierarchical storage: `site` → `zone` → `bin`; `type` adds
`playon` locations and checkpoint zones (`scanner`, `balanza`, `control`).
- `id`, `org_id`, `parent_id`, `type`, `code`, `name`, `active`.
- Special location: `on_truck` is represented via `item_lot.location_type=truck`
   + `truck_id`, not a warehouse row.

### checkpoint_event
Append-only traceability spine. Every mutation of merchandise produces one.
- `id`, `org_id`, `kind`:
  `arrival | discharge | split | transfer | scan_in | scan_out | scale |
   store | load_out | quarantine | seizure | release | egress | correction`,
  `cargo_id`, `cargo_item_id`, `item_lot_id`, `operator_id`, `location_id`,
  `occurred_at`, `quantity_delta|quantity`, `payload jsonb`, `reason`,
  `previous_event_id` (corrections).
- **Immutable:** rows are never updated or deleted.

### scale_reading
Weight record tied to a lot.
- `id`, `checkpoint_event_id`, `item_lot_id`, `gross_kg`, `tare_kg`, `net_kg`,
  `expected_kg`, `tolerance_kg`, `within_tolerance boolean`.

### quarantine_case (rezago)
Leftover/backlog goods held pending resolution.
- `id`, `org_id`, `item_lot_id`, `reason`, `status (open|resolved|released)`,
  `opened_by`, `opened_at`, `resolved_by`, `resolved_at`, `resolution_note`.
- An open case freezes the lot from normal stock movements.

### seizure_record (secuestro)
Goods seized (legal), blocked.
- `id`, `org_id`, `item_lot_id`, `legal_ref`, `status (open|resolved)`,
  `opened_by`, `opened_at`, `documents[]`.
- Open records freeze the lot: no stock movements except evidence transfer.

### document
File attachment (manifest, photo, resolution evidence).
- `id`, `org_id`, `entity_type`, `entity_id`, `storage_path`, `mime`, `size`, `uploaded_by`.

### audit_log
Admin/sensitive action trail.
- `id`, `org_id`, `actor_id`, `action`, `entity_type`, `entity_id`, `before jsonb`,
  `after jsonb`, `reason`, `created_at`.

## Lot states (item_lot_status)

`on_truck` → `discharged` (playón) → `checked` → `in_warehouse` → `loaded_out`,
plus superseding holds `in_quarantine` (warning) and `seized` (blocked), and
`released` (return from a hold). Corrections never rewrite history.

## Key enums

- `cargo_item_status`, `item_lot_status`, `location_type`, `checkpoint_kind`,
  `operator_role`, `party_type`, `truck_status`, `quarantine_status`,
  `seizure_status`, `warehouse_location_type`, `driver_status`.

## Invariants summary

- **Quantity balance:** Σ leaf lot quantities per item = `total_quantity`
  (DB-trigger enforced after every split/transfer, see ADR 0003).
- Partial discharge keeps the remainder as an `on_truck` lot (remanente).
- Released/egressed cargo requires lots balanced and holds resolved.
- Quarantined (rezago) or seized (secuestro) lots are frozen for stock movements.
- Events are append-only; corrections reference the original event.
- Sensitive state changes (quarantine, seizure, release) require `reason`.
- Every table carries `org_id`; RLS scopes access by org.

Enforcement lives in PostgreSQL (constraints/triggers) + RLS; the frontend only
mirrors rules for UX. State machines: `docs/domain/flows.md`,
`docs/domain/states.md`. Operational rules: `docs/domain/business-rules.md`.