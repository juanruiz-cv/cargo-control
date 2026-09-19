# Floor Plan Editor — Architecture (Fase 4)

Deliverable of **Fase 4 / Prompt 05**. A data-driven visual editor for the
playón + galpón: administrators configure the warehouse map **without writing
code** — the layout is data in Supabase, rendered by reusable React components.

This module is the authoring tool for the Fase 3 visual submodel
(`layouts` + `layout_elements`) while the physical submodel (`locations`)
remains the operational truth (ADR 0004). The editor taxonomy and the
physical/visual sync rule are fixed by ADR 0005 and reflected in the schema
**v2** (see `docs/architecture/database.md` §4.2–4.3).

## 1. Overview

- The app never ships a hardcoded map and never renders fixed HTML for the
  warehouse. The canvas renders **data** (`layout_elements` rows) through
  presentational components.
- Every element carries **identity**, **physical dimensions**, **capacity**,
  **visual properties** and **operational flags** — but those concerns are
  split across two records, never mixed (ADR 0005).
- Editing the map is a **presentation** action. Stock, occupancy and computed
  inventory can never be altered from the editor.

## 2. Data model — the element split

An editor element is the **visual record** (`layout_elements`); when it
represents a physically tracked place, it owns a link to the **physical
record** (`locations`).

| Concern | Column(s) | Lives on |
| ------- | --------- | -------- |
| Identity | `id`; `code`, `name`, `description` (places inherit from location; visual-only elements keep their own) | element + location |
| Physical dimensions | `physical_width/height/depth`, `physical_unit` | `locations` |
| Capacity | `capacity_max_units/kg/volume_m3` | `locations` |
| Visual | `x`, `y`, `visual_width`, `visual_height`, `rotation`, `z_index`, `color`, `icon` | `layout_elements` |
| Operation | `isActive` → `locations.active`; `isLocked`, `is_visible` (editor state) | both, by layer |

**Physical vs visual — the canonical example:** a sector of 10 m × 8 m
(`physical_width=10`, `physical_height=8`, `physical_unit='m'`) on a layout
with `scale=22` px/m renders as `visual_width=220`, `visual_height=176`
(≈ 220 px × 170 px). The conversion is **read-side only**; resizing the box
never rewrites the meters, and editing meters never moves the box.

### 2.1 Editor taxonomy → physical mapping (ADR 0005)

| Element type | `locations.type` | `checkpoint_kind` | Flags | `location_id` |
| ------------ | ---------------- | ----------------- | ----- | ------------- |
| `playon` | `playon` | — | — | required |
| `warehouse` | `zone` | — | building zone | required |
| `storage` | `zone` | — | — | required |
| `scanner` | `checkpoint` | `scan` | — | required |
| `scale` | `checkpoint` | `scale` | — | required |
| `quarantine` | `zone` | — | `allows_hold=true` | required |
| `seizure` | `zone` | — | `allows_hold=true` | required |
| `corridor` | any/`zone` | — | — | optional |
| `door` | — | — | architectural | optional |
| `other` | — | — | — | optional |

Constraint: `(element_type in ('corridor','door','other')) OR location_id IS
NOT NULL`. One marker per location per layout (partial unique index).

## 3. Coordinate system & scale

Three coordinate layers, kept explicit:

1. **Physical (world meters)** — `locations.physical_*`; used for capacity and
   real-world reasoning.
2. **Document (layout px)** — `layout_elements.x/y/visual_width/visual_height`;
   the persisted design space. Origin top-left, y grows downward (screen
   convention), rotation in degrees around the element center.
3. **Viewport (camera)** — zoom + pan applied **only during render**, never
   persisted:
   `render(x) = document(x) * zoom + pan`.

Scale bridge: `visual = physical * layouts.scale` (px/m). Defaults to 20.

## 4. Rendering pipeline

```
layout_elements ──(join locations)──▶ typed element model
        │
        ▼
FloorPlanCanvas (viewport: transform translate(pan) scale(zoom))
   ├─ FloorPlanGrid  (optional background grid, snap-aware)
   └─ [FloorPlanElement × N]  — absolutely positioned divs or SVG shapes
        (shape + icon + name label, styled from color/icon/rotation/zIndex)
```

- **No fixed HTML:** one generic `FloorPlanElement` renders any element from
  its data (`element_type` → shape/icon defaults from brand tokens; color
  override per element) — the map is a projection of the table, not markup.
- **Interaction layer:** selection box, resize handles and rotate handle are
  only attached to the **selected** element; in preview mode they are absent.
- **Performance:** fine to ~300 elements; above that, move to an SVG canvas or
  `react-konva`/Canvas adapter (see §12).

## 5. Component architecture

```
pages/settings/LayoutEditorPage
└── FloorPlanToolbar
│   FloorPlanCanvas
│   ├── FloorPlanGrid
│   ├── FloorPlanElement (× N)     ← selection + handles inside
│   └── marquee/selection overlay
FloorPlanEditorPage has:
│   PropertiesPanel  (right)
│   LayerPanel       (left)
│   ZoomControls     (bottom-right)
│   MiniMap          (bottom-left)
│   Preview toggle   (read-only mode)
```

All components are presentational + event-emitting; the **editor store**
(section 6) owns state. No component holds global state.

| Component | Props (input) | Emits | Owns |
| --------- | ------------- | ----- | ---- |
| `FloorPlanCanvas` | elements, viewport, selection, grid, locked | `onSelect`, `onMarquee`, `onViewportChange`, `onDrop` | pointer math, pan/zoom gestures |
| `FloorPlanElement` | element data, selected, locked, visible | `onSelect`, `onMove`, `onResize`, `onRotate` | its own handle markup while selected |
| `FloorPlanGrid` | size, snap, visible | — | grid rendering |
| `FloorPlanToolbar` | dirty, canUndo, canRedo, tool state | `onAdd`, `onSave`, `onUndo`, `onRedo`, `onZoomIn/Out`, `onReset`, `onToggleGrid`, `onAlign`, `onDuplicate` | none |
| `PropertiesPanel` | element (visual + linked location) | `onUpdateElement`, `onUpdateLocation` | form state, debounced commits |
| `LayerPanel` | elements (z-order), selection | `onSelect`, `onToggleLock`, `onToggleVisible`, `onReorder`, `onDuplicate`, `onDelete` | none |
| `ZoomControls` | zoom | `onZoomIn/Out`, `onReset`, `onFit` | none |
| `MiniMap` | elements, viewport | `onNavigate` | reduced render |

## 6. State management & history

**Editor store** (Zustand recommended; lightweight and canvas-friendly) with
slices that map to the layers above:

| Slice | Contents | Persisted |
| ----- | -------- | --------- |
| `document` | layout meta + `elements[]` (the working model) | on Save |
| `selection` | `selectedIds[]`, active tool | no |
| `viewport` | zoom, pan | no |
| `history` | `past[]`/`future[]` snapshots | no |
| `ui` | grid on/off, snap on/off, preview mode, dirty flag | no |

**Undo/Redo — MVP (snapshot-based):**
- History records snapshots of `document` at **gesture commit**, not per
  mousemove: drag/resize/rotate commit on pointer-up; property edits commit on
  blur/Enter; discrete actions (add, delete, align, duplicate, reorder)
  commit immediately.
- `undo()`/`redo()` swap snapshots (deep clone via structured clone; safe to
  ~500 elements).
- **Future:** command pattern (`do/undo` per command) for granular steps and
  multi-element undo — the snapshot scheme is a deliberate MVP shortcut.

## 7. Persistence (Supabase)

**Load:** `GET` layout by id + `layout_elements` by layout_id + linked
`locations` (same facility) — three services in the `services/` layer; the
page composes them.

**Save — one transaction:** click **Guardar** → Edge Function
`save_layout({ layout, elements, locations })`:

```
BEGIN
  upsert layouts        (meta: name, version, status, scale, background)
  upsert locations      (physical/capacity/active — only when element is a place)
  upsert layout_elements (visual fields + location_id)
  soft-delete removed elements (is_visible=false or delete markers)
COMMIT
```

Rules:
- **Places:** creating/editing an element upserts its location in the same
  transaction (code uniqueness enforced by the `unique (facility_id, code)`
  constraint).
- **Publish:** setting status `published` bumps `version`; drafts may be saved
  repeatedly without a version bump.
- **Concurrency:** last-writer-wins on `updated_at` for the MVP; optimistic
  check (compare `updated_at` before write) is the first upgrade.
- **Dirty guard:** leaving the route with unsaved changes prompts
  discard/cancel — never silent data loss.

## 8. Tool behaviors

| Tool | Behavior | History commit | Notes |
| ---- | -------- | -------------- | ----- |
| Drag | move element by pointer delta; **snap to grid** when enabled | on pointer-up | locked elements are ignored |
| Resize | 8 handles adjust `visual_width/height` | on pointer-up | **never touches physical dims** |
| Rotate | rotation handle; snap 15° with Shift | on pointer-up | degrees, around center |
| Zoom | viewport only: wheel (cursor-centered), buttons 10–400% | — | never persisted |
| Pan | drag empty canvas / middle-mouse / space+drag | — | — |
| Grid | toggle render; snap threshold = grid size (10/20 px) | — | stored in `ui` slice |
| Snap | snap drag/resize to grid when grid on | with the gesture | disabled on locked |
| Align | align selected to left/center/right/top/middle/bottom | immediate | operates on visual x/y |
| Duplicate | clone element (+ new location with `-copy` code for places) | immediate | — |
| Lock / Unlock | `is_locked` toggle (LayerPanel or properties) | immediate | locked: no select/move/resize/rotate |
| Show / Hide | `is_visible` toggle; hidden keeps data, skips render | immediate | — |
| Delete | removes the element; **location stays** (deactivate separately) | immediate | places: offer "archive location" |

Add flow: **Agregar** opens a type picker (grouped: places / architectural).
Places create `location` + `element` together; `corridor|door|other` create an
element only. Default color/icon per type come from the Fase 1 brand mapping,
overridable per element.

## 9. Properties panel contract (right side)

| Group | Fields |
| ----- | ------ |
| Identity | code, name, type (read-only), description |
| Physical (place elements) | width, height, depth, unit; max weight, max volume, max units |
| Visual | x, y, visualWidth, visualHeight, rotation, zIndex, color (picker), icon (Lucide picker), label |
| Operation | active (↔ `locations.active`), locked, visible |

Edits are debounced and committed to history on blur/Enter. Physical fields
edit `locations`; visual fields edit the element; they **never** cross.

## 10. Layer panel, zoom controls, mini map, preview

- **LayerPanel (left):** element list in z-order with type icon, name/code,
  lock and visibility toggles; selection synced with canvas; z-order up/down;
  duplicate/delete actions.
- **ZoomControls:** + / − / 1:1 / fit-to-view.
- **MiniMap:** reduced render of the full layout with a viewport rectangle;
  click/drag to navigate.
- **Preview:** read-only projection of the saved layout (no handles, no
  selection); toggled from the toolbar; used to check the map before
  publishing.

## 11. Invariants — what the editor can and cannot do

| Can | Cannot |
| --- | ------ |
| Create/edit/delete **visual** elements as data | Write occupancy/inventory (derived) |
| Edit **physical** dims, capacity, active flag | Auto-sync physical and visual, either direction |
| Lock, hide, duplicate, align, reorder | Delete a physical location by deleting a marker |
| Save/publish versions of a layout | Change movement/lot/stock data |

## 12. Future evolution

- Command-pattern undo; multi-element transform operations; align helpers
  (distribute, same-size).
- SVG/Canvas renderer for >300 elements; snap guides and smart alignment lines.
- Optimistic conflict detection on save; collaborative editing (CRDT) later.
- Print/export of published layouts (floor map PDF).

## Files

- Schema: `docs/architecture/database.md` §4.1–4.3 (v2)
- Domain contract: `docs/domain/entities.md`
- Decisions: `docs/adr/0004-location-vs-layout-separation.md`,
  `docs/adr/0005-floor-plan-editor-taxonomy.md`
- UI specification: `docs/ux/floor-plan-editor.md`
- Routes & shell: `docs/ux/routes-and-components.md`