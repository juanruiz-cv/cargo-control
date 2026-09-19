# Audit System — Test Specification (Fase 13 / Prompt 14)

Executable as SQL scripts / RLS integration tests against Supabase local
(E2E cases against the web client when it exists). Builds on the Fase 6
security spec (S-*), the Fase 9 movement engine spec (ME-*) and the
Fase 10 special areas spec (SA-*); names here are AU-*.

Fixture: org `o1` with `u_admin`, `u_op`, `u_viewer`, `u_auditor`;
facility with playón/sectors/checkpoints; truck `T1`; cargo item with
lots; scanner/scale; quarantine/seizure operations as needed.

## A. Action catalog — every critical action writes an audit row

| ID | Scenario | Expected |
| -- | -------- | -------- |
| AU-01 | create truck | `audit_log` row: `action='truck.create'`, entity_type='truck', after=snapshot |
| AU-02 | edit truck (plate/company) | row `truck.edit`: before + after differ in the changed fields |
| AU-03 | arrival movement | row `truck.arrival` with timestamp = arrival time |
| AU-04 | egress movement | row `truck.egress` |
| AU-05 | create cargo item | row `cargo.create` |
| AU-06 | edit cargo item | row `cargo.edit`: before/after diff |
| AU-07 | delete/archive cargo item | row `cargo.delete` (no hard delete; after=null semantics for deletion) |
| AU-08 | transfer movement | row `movement.transfer` (operation_key in metadata, if any) |
| AU-09 | discharge movement | row `movement.discharge` |
| AU-10 | load/store movement | row `operation.load` (load_out/store) |
| AU-11 | weigh at balanza | row `operation.scale` |
| AU-12 | scan at scanner | row `operation.scan` |
| AU-13 | quarantine (rezagar) | row `operation.quarantine` + required `reason` |
| AU-14 | seize (secuestrar) | row `operation.seizure` + required `reason` |
| AU-15 | capacity change | trigger writes `capacity.set` with before/after capacity snapshots |
| AU-16 | layout/element edit or publish | row `layout.edit` (layout or layout_element) |
| AU-17 | permission/role change | row `permission.change` (before/after role_permissions) |

## B. Shape & metadata

| ID | Scenario | Expected |
| -- | -------- | -------- |
| AU-20 | row exposes the prompt shape | id, actor_id (userId), action, entity_type (entity), entity_id, created_at (timestamp), before (previousData), after (newData), metadata |
| AU-21 | metadata set by writer | `metadata` jsonb contains supplied context (e.g. operation_key/source/session_id) |
| AU-22 | metadata null | omitted/null when writer supplies none — row still valid |
| AU-23 | create with no before | `before=null`; after has the new snapshot |
| AU-24 | delete with no after | `after=null`; before has the prior snapshot |
| AU-25 | system/trigger write | `actor_id` null allowed (capacity trigger); action still recorded |

## C. Append-only & immutability

| ID | Scenario | Expected |
| -- | -------- | -------- |
| AU-30 | UPDATE on `audit_log` | **permission denied** |
| AU-31 | DELETE on `audit_log` | **permission denied** |
| AU-32 | client INSERT on `audit_log` | **permission denied** (trigger/engine-only) |
| AU-33 | UI shows delete/edit affordance | **absent** for every role, including admin (no clear history) |
| AU-34 | audit row after attempted tamper | unchanged; failure logged (no new row fabricated) |

## D. Filters

| ID | Scenario | Expected |
| -- | -------- | -------- |
| AU-40 | filter by usuario | rows where actor_id = selected user only |
| AU-41 | filter by acción | rows with selected catalog code |
| AU-42 | filter by entidad | rows where entity_type = selected |
| AU-43 | filter by fecha (range/day) | rows in facility-timezone day window |
| AU-44 | filter by camión | entity_type='truck' + entity_id = truck (plate resolves server-side) |
| AU-45 | filter by mercadería | entity_type in (cargo_item, item_lot, cargo_manifest) + entity_id |
| AU-46 | combined filters | additive AND of predicates |
| AU-47 | "Limpiar" resets | all filters cleared; list returns unfiltered (bounded) |
| AU-48 | no client-side filtering | filters are server-side predicates; client never buckets loaded rows |

## E. UI components

| ID | Scenario | Expected |
| -- | -------- | -------- |
| AU-50 | AuditList renders | paginated newest-first table; row has no actions (read-only) |
| AU-51 | AuditDetails renders | header + metadata + before/after diff; null side shows "—" |
| AU-52 | AuditTimeline renders | groups by entity, newest first within group; node click → details |
| AU-53 | empty org | "Sin eventos de auditoría"; no fake rows |

## F. Permissions & isolation

| ID | Scenario | Expected |
| -- | -------- | -------- |
| AU-60 | auditor with `audit.read` | full read: list, details, timeline, filters |
| AU-61 | admin | full read (audit.read in matrix) |
| AU-62 | operator / scanner / scale | no audit.read → /audit denied; not even an aggregate view |
| AU-63 | viewer | denied (no audit read) |
| AU-64 | org B actor | sees only org B rows; cross-org query returns nothing |
| AU-65 | disabled user | zero grants (isolation rule 2) |

## G. Edge cases

| ID | Scenario | Expected |
| -- | -------- | -------- |
| AU-70 | rejected operation (attempt ≠ change) | no audit row written (ADR 0006 doctrine) |
| AU-71 | high-volume audit | list page bounded; no full-history pull; index usage asserted |
| AU-72 | missing actor on historical rows | rendered as "sistema" in UI, no crash |