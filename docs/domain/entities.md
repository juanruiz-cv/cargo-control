# Domain Model — Cargo Control (Fase 3)

The domain is modelled so the **data layer is the source of truth**. Entities,
cardinalities, enums and invariants below are the contract for the schema in
`docs/architecture/database.md` (25 tables).

Merchandise follows a **quantity + lots** model (ADR 0003): an item carries a
total quantity; quantities are allocated into tracked **lots** that can be split
or transferred. State lives at lot level; a manifest's status is a rollup.

## Groups

- **Tenancy:** `organization`, `facility`
- **Physical vs visual (ADR 0004):** `location` (operational) · `layout`,
  `layout_element` (presentation)
- **Identity & access:** `user`, `role`, `permission`
- **Fleet:** `transport_company`, `driver`, `truck`
- **Cargo:** `cargo_manifest`, `cargo_item`, `item_lot`, `party`
- **Traceability:** `movement`, `movement_item`, `scanner_operation`,
  `scale_operation`, `quarantine_operation`, `seizure_operation`
- **Support:** `attachment`, `audit_log`

## Entity reference

### Tenancy

- **organization** — multi-tenant root. `id`, `name`, `status`.
  - 1─N `facilities`, 1─N `users`, 1─N everything (RLS boundary).
- **facility** — a physical site/warehouse. `id`, `organization_id`, `code`
  (unique per org), `name`, `type (warehouse|site|plant)`, `status`.
  - 1─N `locations`, 1─N `layouts`, 1─N `cargo_manifests`
    (arrival facility), 1─N `movements` (where it happened).
  - Future multi-warehouse = one facility per warehouse; no schema change.

### Physical vs visual (ADR 0004)

- **location** — operational node: `id`, `organization_id`, `facility_id`,
  `parent_id` (zone → bin tree), `type (zone|bin|playon|checkpoint)`,
  `checkpoint_kind (scan|scale|control)` when type=checkpoint, `code` (unique
  per facility), `capacity_qty`, `capacity_kg`, `allows_hold`,
  `requires_authorization`, `notes`, `active`.
  - **Owns:** capacity + operational rules. **Derives:** occupancy and
    inventory from `item_lots` — never stored.
  - **Has no visual fields.** Cardinality: N : (0..1) `parent_id` (self).
- **layout** — a named, versioned map: `id`, `facility_id`, `name`, `version`,
  `status (draft|published|archived)`, `background jsonb`.
  - 1─N `layout_elements`; 1─N per facility.
- **layout_element** — presentation record: `id`, `layout_id`, `location_id`
  (nullable; markers only), `kind (location_marker|shape|label|decoration)`,
  `x`, `y`, `width`, `height`, `rotation`, `color`, `icon`, `z_index`, `label`.
  - N : (0..1) `locations`. A location may appear in **zero or many** layouts;
    a layout may contain decorative elements with no location link.
  - Deleting/archiving a location never removes its markers.

### Identity & access

- **user** — profile of an internal platform user (identity in `auth.users`):
  `id`, `organization_id`, `auth_user_id` (1:1), `email`, `full_name`, `status`.
  - 1─N via `user_roles` to `roles`; MVP: one org per user (multi-org
    membership is a future join table).
- **role** — `id`, `code` (unique; `admin|supervisor|operator|guard|auditor`),
  `name`, `description`.
- **permission** — capability catalog: `id`, `code` (unique, e.g.
  `cargo.read`, `quarantine.resolve`), `name`, `description`.
- Cardinalities: `user >─< role` through `user_roles`; `role >─< permission`
  through `role_permissions`.

### Fleet

- **transport_company** — carrier registry (was `party type=carrier`):
  `id`, `organization_id`, `name`, `tax_id`, `contacts`, `status`.
  - 1─N `trucks`, 1─N `drivers`, 1─N `cargo_manifests` (as carrier).
- **driver** — external catalog, not an app user: `id`, `organization_id`,
  `transport_company_id` (employer, 0..1), `full_name`, `document_id`,
  `license_no`, `phone`, `status (active|disabled)`. Reusable across manifests.
- **truck** — `id`, `organization_id`, `transport_company_id` (0..1), `plate`
  (unique), `capacity_kg`, `status
  (available|in_playon|in_route|out_of_service|inspection)`.
  - 1─N `cargo_manifests`; holds on-truck remnants via `item_lots.current_truck_id`.

### Cargo

- **cargo_manifest** (was `cargo`) — one truck arrival tracked as a load:
  `id`, `organization_id`, `facility_id`, `code` (unique, human-readable),
  `truck_id` (0..1), `driver_id` (0..1), `transport_company_id` (0..1),
  `shipper_party_id` / `client_party_id` (0..1 each → `parties`), `origin`,
  `destination`, `expected_weight_kg`, `arrival_date`, `departure_date`,
  `status` (rollup), `notes`, `created_by`.
  - 1─N `cargo_items`; 1─N `item_lots`; 1─N `movements`.
- **party** — shipper/client catalog: `id`, `organization_id`,
  `type (shipper|client)`, `name`, `tax_id`, `contacts`, `status`.
  (Carriers live in `transport_companies`, not here.)
- **cargo_item** — merchandise line with total quantity: `id`, `manifest_id`,
  `line_number`, `sku`, `description`, `total_quantity` (>0), `uom`,
  `unit_weight_kg`, `status (pending|on_truck|discharged|distributed|closed)`.
  - **Invariant:** Σ leaf lot quantities = `total_quantity` (trigger, ADR 0003).
- **item_lot** — the traceability quantum: `id`, `manifest_id`, `cargo_item_id`,
  `parent_lot_id` (chained splits), `quantity` (>0), `uom`, `status`, physical
  placement `current_location_id` **or** `current_truck_id` (never both),
  `unit_weight_kg` override, `created_via_movement_id`.
  - Placed at a physical `location` or on a `truck`; never in a layout.

### Traceability

- **movement** (was `checkpoint_event`) — append-only spine event:
  `id` (bigint identity), `organization_id`, `facility_id`, `kind`, `manifest_id`,
  `operator_id`, `location_id`, `occurred_at`, `created_at`, `reason`,
  `previous_movement_id` (corrections), `payload`.
  - Kinds: `arrival | discharge | split | transfer | scan_in | scan_out | scale |
    store | load_out | quarantine | seizure | release | egress | correction`.
  - 1─N `movement_items`; 1─N specialized operations (below).
- **movement_item** — per-lot detail of a movement: `id`, `movement_id`,
  `item_lot_id`, `quantity` (>0), `from_location_id`/`to_location_id`,
  `from_truck_id`/`to_truck_id`, `notes`. One movement can affect several lots.
- **scanner_operation** — barcode/QR capture: `id`, `movement_id`,
  `item_lot_id`, `scanned_code`, `device_id`, `result
  (success|not_found|ambiguous|error)`, `payload`, `scanned_at`, `operator_id`.
- **scale_operation** (was `scale_reading`) — weight record: `id`,
  `movement_id`, `item_lot_id`, `gross_kg`, `tare_kg`, `net_kg`,
  `expected_kg`, `tolerance_kg`, `within_tolerance`, `device_id`,
  `weighed_at`, `operator_id`.
- **quarantine_operation** (rezago; was `quarantine_case`) — hold with
  lifecycle: `id`, `movement_id` (opening movement), `item_lot_id`, `reason`,
  `status (open|resolved|released)`, `opened_by`, `opened_at`, `resolved_by`,
  `resolved_at`, `resolution_note`. Open case **freezes** the lot.
- **seizure_operation** (secuestro; was `seizure_record`) — legal hold:
  `id`, `movement_id`, `item_lot_id`, `legal_ref`, `status (open|resolved)`,
  `opened_by`, `opened_at`, `resolved_by`, `resolved_at`, `resolution_note`.
  Open record **blocks** the lot.

### Support

- **attachment** (was `document`) — file in Storage: `id`, `organization_id`,
  `entity_type`, `entity_id` (polymorphic ref, see §4.5 in `database.md`),
  `storage_path`, `mime`, `size`, `uploaded_by`, `created_at`.
- **audit_log** — admin/sensitive actions: `id` (bigint identity),
  `organization_id`, `actor_id`, `action`, `entity_type`, `entity_id`,
  `before jsonb`, `after jsonb`, `reason`, `created_at`. Append-only.

## Cardinality highlights

| Relationship | Cardinality |
| ------------ | ----------- |
| organization → facility | 1:N |
| facility → location (tree via `parent_id`) | 1:N, N:(0..1) self |
| facility → layout → layout_element → location | 1:N, 1:N, N:(0..1) |
| user ↔ role | M:N via `user_roles` |
| role ↔ permission | M:N via `role_permissions` |
| transport_company → truck / driver | 1:N |
| cargo_manifest → truck / driver / transport_company | N:(0..1) each |
| cargo_manifest → cargo_item → item_lot (splits via `parent_lot_id`) | 1:N, 1:N |
| item_lot → location / truck (placement) | N:(0..1) each, never both |
| movement → movement_item → item_lot | 1:N, N:1 |
| movement → scanner/scale/quarantine/seizure operations | 1:N |

## Lot states (item_lot_status)

`on_truck` → `discharged` (playón) → `checked` → `in_warehouse` → `loaded_out`,
plus superseding holds `in_quarantine` (warning/rezago) and `seized`
(blocked/secuestro), and `released` (return from a hold). Corrections never
rewrite history. See `flows.md` for guards.

## Key enums

`operator_role` (now `roles.code`), `party_type`, `truck_status`, `driver_status`,
`facility_type`, `location_type` (`locations.type`), `checkpoint_kind`,
`layout_status`, `movement_kind` (unchanged from `checkpoint_kind`),
`cargo_manifest_status` (rollup), `cargo_item_status`, `item_lot_status`,
`quarantine_status` (now on `quarantine_operations.status`), `seizure_status`.

## Invariants summary

- **Quantity balance:** Σ leaf lot quantities per item = `total_quantity`
  (DB-trigger enforced after every split/transfer, ADR 0003).
- **Placement:** a lot is at exactly one physical place — a `location` or a
  `truck`; never both, never a layout.
- **Location/layout separation (ADR 0004):** locations carry no visual data;
  layout elements carry no operational data.
- **Immutable spine:** movements/audit rows are never updated or deleted;
  corrections reference the original.
- Partial discharge keeps the remainder as an `on_truck` lot (remanente).
- Quarantined or seized lots are frozen for normal stock movements; sensitive
  transitions require `reason` + supervisor.
- Every table carries `organization_id`; RLS scopes access by org.

## Fase 0–2 → Fase 3 rename map

Full table-level map: `docs/architecture/database.md` §7. Enum-level: enums
keep their values; the tables hosting them changed (`operator_role` →
`roles.code`, `warehouse_location_type` → `locations.type` +
`checkpoint_kind`, `quarantine_case_status` → `quarantine_operations.status`,
`checkpoint_kind(event)` → `movements.kind`). `docs/domain/flows.md` and
`docs/domain/states.md` still use the Fase 2 names and remain valid via this map.

Enforcement lives in PostgreSQL (constraints/triggers) + RLS; the frontend only
mirrors rules for UX. State machines: `docs/domain/flows.md`,
`docs/domain/states.md`. Operational rules: `docs/domain/business-rules.md`.
Schema: `docs/architecture/database.md`. Decision: `docs/adr/0004-location-vs-layout-separation.md`.