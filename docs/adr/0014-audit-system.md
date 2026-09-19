# ADR 0014 — Audit system: one append-only spine, a stable action catalog

- **Status:** Accepted
- **Date:** 2026-09-19
- **Fase:** 13 — Auditoría (Prompt 14)

## Context

Fase 13 builds the AUDITORÍA system. Critical actions must be
registered: create, edit, delete, transfer, discharge, load, weigh,
scan, quarantine (rezagar), seize (secuestrar), truck arrival (ingresar
camión), truck egress (egresar camión), capacity change, layout change,
permission change. The AuditLog row shape: id, userId, action, entity,
entityId, timestamp, previousData, newData, metadata. Regular operators
cannot modify logs. UI: AuditList, AuditDetails, AuditFilters,
AuditTimeline. Filters: usuario, acción, entidad, fecha, camión,
mercadería. Deleting audit history via the UI is forbidden.

## Decisions

1. **`audit_log` (existing Fase 3 spine) is the single audit source —
   no second table.** The prompt shape maps onto it:
   `id`→`id`, `userId`→`actor_id`, `action`→`action`,
   `entity`→`entity_type`, `entityId`→`entity_id`,
   `timestamp`→`created_at`, `previousData`→`before`,
   `newData`→`after`, `metadata`→new `metadata jsonb`.

2. **Schema v9 delta: add `audit_log.metadata jsonb` (nullable).**
   `reason` is free text for the mandatory reason on sensitive kinds;
   `metadata` carries structured context (session/device, operation
   key, source, related refs) without reshaping `before`/`after`.

3. **Stable action catalog — `entity.verb` codes.** The 16 critical
   actions become canonical codes (e.g. `truck.arrival`,
   `truck.egress`, `movement.transfer`, `capacity.set`, `layout.edit`,
   `permission.change`, `operation.scan`, `operation.scale`,
   `operation.quarantine`, `operation.seizure`, `truck.create`,
   `cargo.create`, `cargo.edit`, `cargo.delete`). Existing writers
   already emit codes (`capacity.set` trigger); the catalog
   standardizes naming; `action` stays free text checked by convention
   (a future CHECK could enforce it without breaking the spine).

4. **Append-only is final — operators cannot modify logs.** Same
   doctrine as movements: no UPDATE/DELETE grants; writes come from
   triggers/engine only; the client has read access via `audit.read`
   (admin + auditor) and never writes. The UI exposes no delete, no
   edit, no "clear history" action.

5. **UI is a read-only projection:** AuditList (paginated rows),
   AuditDetails (row + before/after diff), AuditFilters (usuario,
   acción, entidad, fecha, camión, mercadería), AuditTimeline
   (grouped-by-entity timeline). None mutate.

6. **Retention is an operational policy, not a UI feature.** Deletion
   (if ever required by law/ops) happens only through approved
   maintenance outside the application; the UI cannot delete history.

## Consequences

- One new column (`audit_log.metadata`); no other DDL.
- The action catalog gives filters a stable dimension
  (`action` codes, `entity_type` values).
- Operators/viewers can never tamper with or delete logs; the auditor
  role reads everything, admin reads everything, others see nothing.
- QA covers every critical action writing its audit row, append-only
  negative tests, filter correctness, permissions and isolation.

## References

- ADR 0003 (balance/audit triggers), ADR 0006 (capacity audit),
  ADR 0010 (movement engine — the writer of most audited actions),
  ADR 0013 (dashboard — server-side aggregation reuse for audit KPIs).