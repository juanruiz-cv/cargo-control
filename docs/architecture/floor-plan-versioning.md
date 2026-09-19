# Floor Plan Editor — Versioning Specification (Fase 14 / Prompt 15)

Layout versioning built on the existing `layouts` model: **a row is a
version**. Restoring a visual layout never touches movement history;
capacity changes keep their existing guard + audit.

## Version model

```
layouts (per facility + name):
  id, organization_id, facility_id, name,
  version   int        -- version number (1, 2, …); unique per facility+name
  status    draft|published|archived
  created_by uuid references users(id)   -- v10 (createdBy)
  description text                        -- v10 (human description)
  changes   jsonb                         -- v10 (change summary)
  scale, background, created_at, updated_at
```

`created_at` = createdAt. `layout_elements` rows belong to the layout
version through `layout_id`, so every version has its own immutable
element set.

### `changes` shape (per-version summary)

```json
{
  "from_version": 2,
  "elements": [
    {"element_id": "...", "field": "x", "before": 100, "after": 140},
    {"element_id": "...", "action": "added"},
    {"element_id": "...", "action": "removed"}
  ],
  "counts": {"added": 1, "removed": 1, "changed": 1}
}
```

Written on save by the editor; used by the compare view and the visual
history.

## Operations

| Operation | Semantics | Audit |
| --------- | --------- | ----- |
| Create version | INSERT new row (version+1, draft), copying current elements | `layout.create` |
| Publish | draft → published (enforce one published per facility+name); confirmation required | `layout.publish` |
| View previous | read-only historical row + its elements | — |
| Compare versions | server-side diff between two versions' element sets | — |
| Restore version | INSERT new draft (version+1) copying the restored version's elements; no mutation of history | `layout.restore` |
| Edit elements | UPDATE elements within a draft version | `layout.edit` |

- **Publish uniqueness:** the app/business rule keeps at most one
  `published` layout per (facility_id, name); publishing a newer draft
  archives the previous published row (`published → archived`) in the
  same transaction; confirm dialog precedes it.
- **Restore is imperative:** always creates a NEW draft version with
  copied elements; it never rewrites the restored version's rows and
  never inserts into `movements`.

## Visual history

Query: all versions for (facility_id, name) ordered by version; each
row shows version, createdAt, createdBy (join users), description,
status, change counts. Rendering a previous version opens it read-only
(no directional editing of history).

## Doctrine — visual ≠ logistic

- Writing/restoring a layout or its elements never creates a row in
  `movements`/`movement_items`. The movement spine records logistics
  (trucks, merchandise, holds) only.
- Layout operations are administrative actions recorded in `audit_log`
  (catalog extension ADR 0015: `layout.create`, `layout.publish`,
  `layout.restore`, plus existing `layout.edit`).
- QA asserts: a full restore/publish cycle produces **zero** movement
  rows.

## Capacity separation

- Capacity lives on `locations`, not on layouts. Visual editing never
  touches `locations.capacity_*`.
- Capacity changes remain guarded (reduction below occupancy rejected
  by trigger) and audited (`capacity.set`), unchanged from ADR 0006.
- The editor UI exposes capacity as a distinct action with its own
  validation/audit flow — never as a visual drag-drop.

## Permissions

- Create/publish/restore/edit: `warehouse.configure` (admin, supervisor).
- View versions / compare: `warehouse.read` (all authenticated
  operational roles).
- Audit rules unchanged: `audit.read` for audit rows.
- No new permission codes; RLS/RBAC asserted.

## Compare algorithm (server-side)

Input: two `layouts` rows (same facility+name). Output rows:
- element present in both → field-level diff (x, y, width, height,
  rotation, color, icon, label, is_visible, location_id);
- present only in newer → `added`; only in older → `removed`.
Diff runs on `layout_elements` joined by stable element id; the client
renders the returned diff — it never compares downloaded element sets.