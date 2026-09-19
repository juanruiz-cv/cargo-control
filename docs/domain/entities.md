# Domain Model — Cargo Control

The domain is modelled so the **data layer is the source of truth**. Entities,
enums and relations below are the contract for the schema
(`docs/architecture/database.md`).

## Aggregates and entities

### operator
Internal platform user.
- `id uuid` (PK), `user_id uuid` → `auth.users`, `org_id`, `role`
  (`admin | supervisor | operator | guard | auditor`), `status`, timestamps.
- Rules: identity never trusted from the client; role resolved server-side.

### org
Multi-tenancy boundary (company operating the control).
- `id uuid (PK)`, `name`, `config jsonb` (optional).

### party
Counterparty catalog (carrier, shipper, client).
- `id`, `org_id`, `type (carrier|shipper|client)`, `name`, `tax_id`, `contacts jsonb`.

### truck
Vehicle used to carry goods.
- `id`, `org_id`, `plate`, `carrier_party_id`, `capacity_kg`, `status (available|in_transit|out_of_service|inspection)`.

### cargo
Shipment/load being tracked.
- `id`, `org_id`, `code` (unique, human-readable), `shipper_party_id`,
  `client_party_id`, `origin`, `destination`, `status`,
  `expected_weight_kg`, `arrival_date`, `departure_date`, `notes`.
- Status flow (`cargo_status`): `received → staging → checked → in_warehouse → released → loaded_out`, plus `in_quarantine` and `seized` (flags/superseding states).

### cargo_unit
A physical unit belonging to a cargo; the scan/scale target.
- `id`, `cargo_id`, `unit_code`, `barcode` (scan key), `weight_kg`,
  `status (pending|checked|in_warehouse|in_quarantine|seized|released|loaded_out)`,
  `current_location_id → warehouse_location`, `checked_at`.

### warehouse_location
Hierarchical storage: `site` → `zone` → `bin`.
- `id`, `org_id`, `parent_id`, `type`, `code`, `name`, `active`.

### checkpoint_event
Append-only traceability spine.
- `id`, `org_id`, `kind (scan_in|scan_out|scale|check_in|check_out|quarantine|seizure|release|correction)`,
  `cargo_id`, `cargo_unit_id`, `operator_id`, `location_id`, `occurred_at`,
  `payload jsonb`, `reason`, `previous_event_id` (for corrections).
- **Immutable**: rows are never updated or deleted.

### scale_reading
Weight record.
- `id`, `checkpoint_event_id`, `cargo_unit_id`, `gross_kg`, `tare_kg`, `net_kg`,
  `expected_kg`, `tolerance_kg`, `within_tolerance boolean`.

### quarantine_case
Goods held pending resolution.
- `id`, `org_id`, `cargo_unit_id(s)`/`cargo_id`, `reason`, `status (open|resolved|released)`,
  `opened_by`, `opened_at`, `resolved_by`, `resolved_at`, `resolution_note`.

### seizure_record
Goods seized (legal).
- `id`, `org_id`, `cargo_unit_id(s)`/`cargo_id`, `legal_ref`, `status (open|resolved)`,
  `opened_by`, `opened_at`, `documents[]`. Seized units are frozen for stock movement.

### document
File attachment (manifest, photo, resolution evidence).
- `id`, `org_id`, `entity_type`, `entity_id`, `storage_path`, `mime`, `size`, `uploaded_by`.

### audit_log
Admin/sensitive action trail.
- `id`, `org_id`, `actor_id`, `action`, `entity_type`, `entity_id`, `before jsonb`,
  `after jsonb`, `reason`, `created_at`.

## Key enums

- `cargo_status`, `cargo_unit_status`, `checkpoint_kind`, `operator_role`,
  `party_type`, `truck_status`, `quarantine_status`, `seizure_status`,
  `warehouse_location_type`.

## Invariants summary

- Released cargo requires all units to have passed required checkpoints.
- Quarantined or seized units are frozen for stock movements.
- Events are append-only; corrections reference the original event.
- Sensitive state changes (quarantine, seizure, release) require `reason`.
- Every table carries `org_id`; RLS scopes access by org.

Enforcement lives in PostgreSQL (constraints/triggers) + RLS; the frontend only
mirrors rules for UX.