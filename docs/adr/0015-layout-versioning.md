# ADR 0015 — Layout versioning: row = version, restore never mutates

- **Status:** Accepted
- **Date:** 2026-09-19
- **Fase:** 14 — Editor visual avanzado (Prompt 15)

## Context

Fase 14 improves the floor plan editor with layout versioning: each
version records version, createdBy, createdAt, description and changes;
the operator can create/publish a version, view a previous version,
compare versions and restore a version. Restoring a visual layout must
NOT modify the movement history (a visual change is not a logistic
movement); a capacity change DOES require auditing and validations. A
visual change history is required, and publishing a new version requires
confirmation.

## Decisions

1. **A `layouts` row IS a version.** The existing
   `unique (facility_id, name, version)` (ADR 0005) is the version
   identity; `version int` + `status` already model the lifecycle.
   Schema **v10** adds only the missing per-version metadata:
   - `layouts.created_by uuid references users(id)` — createdBy;
   - `layouts.description text` — description;
   - `layouts.changes jsonb` — per-version structured change summary
     (list of element edits: element id, field, before/after) captured
     on save.
   `created_at` already covers createdAt. No separate version table.

2. **Operations:**
   - **Create version:** new row (same facility+name, version+1,
     status draft) from the current one; changes summary filled.
   - **Publish:** `status draft → published`; at most one published
     version per (facility_id, name); publish requires confirmation in
     the UI (explicit dialog) and an audit row `layout.publish`.
   - **View previous:** read-only query of any historical version row +
     its `layout_elements` (immutable bytes-form).
   - **Compare versions:** server-side diff of `layout_elements`
     between two versions (added/removed/changed fields, elements).
   - **Restore version:** creates a NEW draft version (version+1)
     whose `layout_elements` are a copy of the restored version —
     **never mutates the historical version's rows**. Restore never
     touches `movements`.

3. **Visual change ≠ logistic movement (doctrine).** Layout/layout
   element edits never write `movements`; the movement spine is
   logistics-only (moves of trucks/merchandise). Restore/compare/publish
   have zero effect on the movement history. Visual edits are recorded
   as **administrative audit** rows only (catalog extension:
   `layout.create`, `layout.publish`, `layout.restore`; `layout.edit`
   remains for element edits).

4. **Capacity change keeps its existing guard + audit (unchanged, ADR
   0006).** Capacity edits on `locations` are still rejected by trigger
   when reducing below current occupancy, still audited as
   `capacity.set`, and still validated server-side. Visual layout work
   never crosses into capacity fields.

5. **Publish confirmation is mandatory UX:** publishing a new version
   opens a confirmation dialog showing version number, description,
   change count and the resulting visual diff before committing.

## Consequences

- Schema v10: three nullable metadata columns on `layouts`; no other
  user-table DDL.
- Movement history is provably unaffected by layout operations
  (asserted in QA: restore path writes zero movement rows).
- Capacity stays protected by the existing trigger + audit; the
  doctrine is explicit so future UI work cannot blur "visual" and
  "capacidad".
- Permissions unchanged: `warehouse.configure` (admin/supervisor) for
  create/publish/restore; `warehouse.read` for view/compare. RLS/RBAC
  asserted.

## References

- ADR 0005 (layout_elements/physical-visual), ADR 0006 (capacity guard
  + audit), ADR 0014 (audit catalog).