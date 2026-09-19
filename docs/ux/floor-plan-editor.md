# Floor Plan Editor — UX Specification (Fase 4)

User-facing behavior of the floor plan editor. Architecture, data model and
component contracts: `docs/architecture/floor-plan-editor.md`.

## Routes

```
/settings/layouts                 — layout manager (list, create, duplicate, archive)
/settings/layouts/:id/edit        — the editor (this spec)
/settings/facilities/:facilityId  — facility detail; link to its layouts
```

Entry points: Settings > Layouts, or the warehouse module's "Open map" action
on a facility.

## Screen layout

```
┌────────────────────────────────────────────────────────────────┐
│ FloorPlanToolbar                                               │
│ [Agregar] [Guardar] [Deshacer] [Rehacer] | [Zoom+] [Zoom-]     │
│ [Reset] [Grilla] [Alinear] [Duplicar] | [Vista previa]         │
├──────────────┬─────────────────────────────────┬───────────────┤
│ LayerPanel   │ FloorPlanCanvas (grid + elements│ Properties    │
│ (z-order,    │ + selection + handles)          │ Panel         │
│ lock, hide)  │                                 │               │
│              │                                 │               │
├──────────────┴──────────┬──────────────────────┴───────────────┤
│ MiniMap                  │ ZoomControls                        │
└──────────────────────────┴─────────────────────────────────────┘
```

- Toolbar: top, always visible. Save reflects dirty state (label + dot).
- Left panel: layer list. Right panel: properties of the selection.
- Bottom bar: mini map + zoom controls; status text (saved/saving/error,
  element count, zoom %).

## Toolbar

| Button | Behavior |
| ------ | -------- |
| **Agregar** | Opens the element picker (places then architectural types); click on canvas places it; **checkpoint types** place a checkpoint location |
| **Guardar** | Saves layout + elements + locations in one transaction (dirty → saving → saved); disabled when clean |
| **Deshacer** | Undo last committed action (Ctrl/Cmd+Z); disabled when empty |
| **Rehacer** | Redo (Ctrl/Cmd+Y / Ctrl+Shift+Z); disabled when empty |
| **Zoom + / −** | Step zoom (10–400%); Ctrl+wheel equivalent |
| **Reset** | Reset to 100 % and center view (fit-to-view optional) |
| **Grilla** | Toggles grid render + snap; long-press opens grid size (10/20 px) |
| **Alinear** | Aligns selected elements (left/center/right/top/middle/bottom); enabled with ≥2 selected |
| **Duplicar** | Clones selection (+ location with `-copy` code for places) immediately below/right |
| **Vista previa** | Toggles read-only projection of the current document |

## Canvas interactions

| Gesture | Action |
| ------- | ------ |
| Click element | select (Ctrl/Cmd = multi-select, Shift = extend) |
| Click empty | deselect |
| Drag element | move (snaps when grid on); locked elements ignore |
| Drag empty | marquee select (left button) |
| Drag empty + Space / middle mouse | pan |
| Wheel | vertical scroll; **Ctrl+wheel** = zoom centered on cursor |
| Resize handles (selected) | resize `visualWidth/Height`; Shift locks aspect |
| Rotate handle (selected) | rotate; Shift snaps 15° |
| Double-click element | rename (inline label edit, commits to name) |
| Right-click | context menu: duplicate, lock/unlock, hide, delete, bring to front |

## Add flow

1. **Agregar** → picker grouped by **Places** (playon, warehouse, storage,
   scanner, scale, quarantine, seizure) and **Architectural** (corridor, door,
   other).
2. Choose type → ghost preview follows the cursor with default size per type
   (from `layouts.scale` and location defaults).
3. Click to place: places create the physical `location` (code auto-generated
   `TIPO-001`, editable in properties) + visual element; architectural types
   create the element only.

## Properties panel

Shown for the selection (multi-select: visual fields apply to all; identity/
physical/capacity disabled). Groups and behavior:

| Group | Fields | Commit |
| ----- | ------ | ------ |
| Identity | code, name, description | blur/Enter |
| Physical | width, height, depth, unit (m/cm/ft) | blur/Enter |
| Capacity | max weight (kg), max volume (m³), max units | blur/Enter |
| Visual | x, y, visualWidth, visualHeight, rotation, zIndex, color, icon, label | drag sliders live; inputs on blur |
| Operation | active, locked, visible | toggle, immediate |

Scale hint: the panel shows the derived physical↔visual conversion
("10 m × 8 m · scale 22 → 220 px × 176 px") to make the separation obvious.

## Layer panel

Rows in z-order (top = front). Per row: type icon, name/code, lock toggle,
visibility toggle. Row actions: duplicate, delete, move up/down. Deleting a
place element asks "just the marker, or archive the location too?" — default:
marker only.

## Zoom controls & mini map

- Buttons: **+ / − / 1:1 / Fit**; zoom % label.
- MiniMap: full-layout thumbnail; viewport rectangle draggable; click navigates.

## Keyboard shortcuts

| Shortcut | Action |
| -------- | ------ |
| Ctrl/Cmd + Z | undo |
| Ctrl/Cmd + Y / Ctrl+Shift+Z | redo |
| Ctrl/Cmd + D | duplicate |
| Delete / Backspace | delete selection |
| Arrows | nudge 1 px (Shift = 10 px) |
| Ctrl/Cmd + A | select all |
| Escape | deselect / close picker |
| Ctrl/Cmd + S | save |
| Ctrl/Cmd + 0 / 1 | fit / 100% |

## States

| State | UI |
| ----- | -- |
| Loading | skeleton canvas + panels; buttons disabled |
| Empty layout | centered empty state: "This layout has no elements" + **Agregar** |
| Dirty | toolbar dot + "Unsaved changes"; route-leave prompt |
| Saving | spinner on Save button; panels disabled |
| Saved | toast "Layout saved"; dirty clears |
| Save error | banner with reason; document kept in memory (no data loss) |
| Locked element | reduced opacity + lock badge; no handles |

## Accessibility

- All toolbar buttons have labels + aria-keyshortcuts for the shortcuts above.
- Selection changes announce "N elements selected"; canvas has a roving
  tabindex; elements are keyboard-reachable in layer panel order.
- Property inputs are labeled; color/icon pickers accessible (no color-only
  indication — icon + name always present).

## Component inventory

| Component | File (proposed) |
| --------- | --------------- |
| FloorPlanToolbar | `components/map/editor/FloorPlanToolbar.tsx` |
| FloorPlanCanvas | `components/map/editor/FloorPlanCanvas.tsx` |
| FloorPlanElement | `components/map/editor/FloorPlanElement.tsx` |
| FloorPlanGrid | `components/map/editor/FloorPlanGrid.tsx` |
| PropertiesPanel | `components/map/editor/PropertiesPanel.tsx` |
| LayerPanel | `components/map/editor/LayerPanel.tsx` |
| ZoomControls | `components/map/editor/ZoomControls.tsx` |
| MiniMap | `components/map/editor/MiniMap.tsx` |
| ElementPicker | `components/map/editor/ElementPicker.tsx` (add flow) |
| page | `pages/settings/LayoutEditorPage.tsx` |

House style: existing shell/panel primitives from `components/ui` and
`components/layout`; editor-specific state lives only in the editor store
(Zustand) — see the architecture doc §6.