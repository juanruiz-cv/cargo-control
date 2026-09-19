# Floor Plan Editor — Versioning UX Specification (Fase 14 / Prompt 15)

Version-aware floor plan editor: create, publish (with confirmation),
view previous, compare and restore versions; visual history is always
available. Visual operations never affect movement history.

## Route

`/planta` → FloorPlanEditor (existing, Fase 4) extended with a
**version panel**. Edit operations require `warehouse.configure`;
viewing/compare require `warehouse.read`.

## Version panel (right sidebar within the editor)

Lists all versions of the current layout (facility + name):

| Column | Source |
| ------ | ------ |
| Versión | `version` |
| Estado | `status` badge (Borrador / Publicada / Archivada) |
| Creada | `created_at` (facility timezone) + user (created_by) |
| Cambios | description + change counts (added/removed/changed) |

Actions per row (only for `warehouse.configure`):
- **Crear versión** — new draft from current: button "Nueva versión";
  opens a form: description (required), then saves as version+1.
- **Publicar** — only for a draft; **always opens a confirmation
  dialog** (see Publish confirm) before committing.
- **Ver** — opens the selected version in **read-only mode** (no
  editing controls; banner "Versión N — solo lectura").
- **Comparar** — selection of two versions → opens the Compare view.
- **Restaurar** — confirm dialog "¿Restaurar versión N? Se creará una
  nueva versión borrador con ese estado visual. El historial de
  movimientos no se modifica." → creates new draft (version+1) with
  copied elements; lands in editable state on the new draft.

## Publish confirm (MANDATORY dialog)

Before `draft → published`:

- Header: "Publicar versión N".
- Shows: version, description, change counts, and a mini visual diff
  preview (elements changed vs the current published version).
- Primary: "Publicar"; secondary: "Cancelar". Cancel does nothing.
- On success: toast "Versión N publicada", previous published becomes
  Archived, panel refreshes.

## Compare view

- Two-version picker (V1, V2) defaulting to latest vs published.
- Server-side diff rendered as a table: element code/name, field,
  before → after; added/removed rows highlighted.
- "Ver en mapa" opens read-only canvas overlay of V2 with diff dots.
- No write operations in compare mode.

## Restore confirm

- "Restaurar versión N" dialog: explains the copy-to-new-draft
  semantics and the no-movement guarantee; requires confirmation.
- Creates the new draft and navigates the editor to it (editable).

## Visual history

- Same list as the version panel but pre-grouped as a timeline
  (versions by date); satisfies "historial visual de cambios".
- Each entry expands to show its `changes` summary (per-element
  before/after list).

## Doctrine in the UI

- No layout action ever surfaces movement data; the editor never shows
  "movimientos" as a consequence of visual actions.
- Capacity editing (a distinct flow with guard/audit, ADR 0006) is
  never presented as part of visual drag-drop; it opens its own
  validated form.
- No delete affordance for versions; history rows are immutable in the
  UI (archiving via publish is the only status transition).