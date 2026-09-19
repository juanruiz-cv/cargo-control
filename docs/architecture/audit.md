# Audit System — Architecture Specification (Fase 13 / Prompt 14)

`audit_log` is the single append-only spine for every critical action.
The UI is a read-only projection; operators cannot modify or delete
logs.

## AuditLog shape (prompt mapping)

| Prompt field | Column | Notes |
| ------------ | ------ | ----- |
| id | `audit_log.id` | bigint identity |
| userId | `actor_id` | null for trigger/system writes, else `users.id` |
| action | `action` | canonical `entity.verb` code (catalog below) |
| entity | `entity_type` | table/entity name |
| entityId | `entity_id` | natural or uuid ref of the entity |
| timestamp | `created_at` | immutable insert time |
| previousData | `before` | jsonb snapshot before change (null on create) |
| newData | `after` | jsonb snapshot after change (null on delete) |
| metadata | `metadata` | **new** jsonb nullable (schema v9): structured context |

`organization_id` + `reason` keep their existing roles: org-scoping for
RLS and free-text reason on sensitive kinds.

## Action catalog (16 critical actions, Prompt 14)

Canonical `entity.verb` codes. The writer determines the code; the
catalog standardizes the naming so filters and reports are stable.

| Code | Prompt action | Writer |
| ---- | ------------- | ------ |
| `truck.create` | crear | trucks module create flow |
| `truck.arrival` | ingresar camión | movement engine `arrival` |
| `truck.egress` | egresar camión | movement engine `egress` |
| `cargo.create` | crear (mercadería) | cargo create flow |
| `cargo.edit` | editar | cargo edit flow |
| `cargo.delete` | eliminar | cargo delete flow (archive-style, no hard delete) |
| `movement.transfer` | transferir | engine `transfer` |
| `movement.discharge` | descargar | engine `discharge` |
| `operation.load` | cargar | engine `load_out` / store flow |
| `operation.scale` | pesar | `scale_operations` |
| `operation.scan` | escanear | `scanner_operations` |
| `operation.quarantine` | rezagar | engine `quarantine` |
| `operation.seizure` | secuestrar | engine `seizure` |
| `capacity.set` | modificar capacidad | `locations_capacity_audit` trigger (exists) |
| `layout.edit` | modificar layout | layouts/layout_elements editors |
| `permission.change` | modificar permisos | roles/permissions admin flows |

Fase 14 extension (ADR 0015): `layout.create`, `layout.publish`,
`layout.restore` — layout version operations are administrative audit
rows; they never write `movements` (visual ≠ logistic doctrine).
Capacity changes keep `capacity.set` and their validation guard.

Convention: `user.invite`, `role.change`, `attachment.add` remain valid
extension codes. `action` is free text enforced by convention now; a
future CHECK over the catalog can be added without breaking the spine.

## Registration doctrine

- **Writes are trigger/engine-only.** No client INSERT/UPDATE/DELETE on
  `audit_log`; RLS grants no write policy (Fase 6 matrix).
- Rejected operations write nothing (attempt ≠ change; ADR 0006 note).
- `before`/`after` hold the state at the change; `metadata` carries
  structured context (e.g. `{operation_key, source, session_id}`)
  without duplicating snapshots.
- Sensitive kinds (quarantine/seizure/release/egress) require `reason`
  (existing rule) and are always audited.

## Retention & no-delete

- History is never deleted through the UI (there is no delete action in
  AuditList/Details/Timeline).
- Retention/archival (if ever required) is operational maintenance
  outside the application, approved per policy, and out of the client's
  reach.

## Permissions

- `audit.read` → admin + auditor (existing matrix). The UI guards every
  route with it; normal operators and viewers see no audit screen.
- Filters resolve against entities the user can already read where
  applicable; the audit screen itself requires `audit.read` globally.

## Query design (filters)

| Filter | Query shape |
| ------ | ----------- |
| Usuario | `actor_id = $1` |
| Acción | `action = $1` (catalog code) |
| Entidad | `entity_type = $1` |
| Fecha | `created_at >= $1 AND created_at < $2` (facility timezone day bucket, ADR 0013 helper) |
| Camión | `entity_type='truck' AND entity_id = <id>` (also resolves plate→id server-side) |
| Mercadería | `entity_type IN ('cargo_item','item_lot','cargo_manifest') AND entity_id = <id>` |

All queries are bounded (page size, window cap) and aggregated
server-side; the client never loads unbounded history.

## Related

- Spine & partitions: `docs/architecture/database.md` §4.7/§4.9.
- Permissions: `docs/security/rbac.md`; enforcement:
  `docs/security/rls.md`.