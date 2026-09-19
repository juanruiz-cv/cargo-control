# Audit System — UX Specification (Fase 13 / Prompt 14)

Read-only audit interface: AuditList, AuditDetails, AuditFilters,
AuditTimeline. **No delete, no edit, no "clear history" — ever.**

## Route

`/audit` → AuditScreen. Guard: `audit.read` (admin + auditor). All
child components are read-only projections of `audit_log`.

## AuditList

Paginated table of audit rows (newest first, server-side page cursor):

| Column | Source |
| ------ | ------ |
| Fecha/hora | `created_at` (facility timezone) |
| Usuario | `actor_id` → user name/email |
| Acción | `action` (catalog code, humanized label) |
| Entidad | `entity_type` |
| Entidad ID | `entity_id` |
| Razón | `reason` (if any) |

- Row click → AuditDetails (drawer/dialog).
- Row hover reveals no actions (read-only); there is **no** delete/edit
  affordance anywhere.
- Empty state: "Sin eventos de auditoría" — never fake rows.
- Error state: retry; never a fabricated list.

## AuditDetails

Shows one full audit row:

- Header: action label + humanized entity (`User`, `Truck`, `Cargo
  item`, …) + entity id.
- Metadata: timestamp, actor, reason, `metadata` JSON rendered as a
  readable key/value list (or collapsed raw JSON).
- **Before/After diff:** `before` vs `after` rendered as a side-by-side
  diff (changed fields highlighted); null side renders "—" (created /
  deleted).
- Related link: when the entity has a route (`/trucks/:id`,
  `/cargamentos/:id`), a "Ver entidad" link opens it in a new context —
  still read-only roles permitting.

## AuditFilters

Filter bar (applies to AuditList + AuditTimeline):

| Filter | Control |
| ------ | ------- |
| Usuario | user select (from users in org) |
| Acción | action select from the catalog (16 codes + any custom) |
| Entidad | entity_type select |
| Fecha | date range (single day or range) in facility timezone |
| Camión | truck picker (plate) → resolves to truck id → `entity_id` filter |
| Mercadería | item/lot/manifest picker → entity filter |

- Filters combine additively; "Limpiar" resets.
- Every filter is a server-side predicate — the client never filters a
  downloaded history.
- URL-syncable (query params) for shareable audit slices.

## AuditTimeline

Grouped timeline by entity (selected filter or a chosen entity):
- Groups events under their entity (`camión X`, `sector Y`, `lote Z`),
  newest first within each group.
- Renders the same rows as AuditList but grouped; clicking a node opens
  AuditDetails.
- Timeline respects the same filters and pagination; never loads the
  full history.

## Accessibility & states

- Table/timeline are keyboard-reachable; diff view has text form
  (not color-only).
- Loading skeletons; empty state; error with retry — all consistent
  with Fase 12 conventions.
- No optimistic UI: data is committed audit history.