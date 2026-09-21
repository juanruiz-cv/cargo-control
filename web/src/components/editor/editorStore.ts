import { useSyncExternalStore } from "react"
import type { LayoutElementRow, LayoutElementType } from "@/types"
import { ELEMENT_TYPE_META } from "@/components/map/shared/elementMeta"

/**
 * Floor-plan editor state (docs/ux/floor-plan-editor.md §4).
 *
 * Module singleton + useSyncExternalStore — deliberately dependency-free
 * (no zustand): one editor instance per app, snaps are cheap, and the
 * store must survive page-level state resets across the draft lifecycle.
 *
 * Undo/redo is snapshot-based: every mutating action pushes a
 * {elements, selection} snapshot (capped), preserving the exact visual
 * state including selection.
 */
export interface EditorElement extends LayoutElementRow {}

export type EditorMode = "select" | "place" | "pan"

export interface EditorState {
  elements: EditorElement[]
  selection: string[]
  snapEnabled: boolean
  gridVisible: boolean
  metricUnits: boolean
  mode: EditorMode
  placingType: LayoutElementType | null
  dirty: boolean
  /** Bumped on every commit; lets toolbars re-read canUndo()/canRedo() reactively. */
  historyVersion: number
}

export const GRID_SIZE = 20

const HISTORY_LIMIT = 50

function initialState(): EditorState {
  return {
    elements: [],
    selection: [],
    snapEnabled: true,
    gridVisible: true,
    metricUnits: true,
    mode: "select",
    placingType: null,
    dirty: false,
    historyVersion: 0,
  }
}

let state: EditorState = initialState()
let past: { elements: EditorElement[]; selection: string[] }[] = []
let future: { elements: EditorElement[]; selection: string[] }[] = []
const listeners = new Set<() => void>()

function emit(): void {
  for (const listener of listeners) listener()
}

function snapshot(): { elements: EditorElement[]; selection: string[] } {
  return {
    elements: structuredClone(state.elements),
    selection: [...state.selection],
  }
}

/** Push pre-mutation snapshot onto undo history. */
function pushHistory(): void {
  past.push(snapshot())
  if (past.length > HISTORY_LIMIT) past.shift()
  future = []
}

function commit(next: EditorState): void {
  state = { ...next, historyVersion: next.historyVersion + 1 }
  emit()
}

function cloneElements(): EditorElement[] {
  return structuredClone(state.elements)
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

function snapValue(value: number): number {
  if (!state.snapEnabled) return value
  return Math.round(value / GRID_SIZE) * GRID_SIZE
}

export const editorStore = {
  subscribe(listener: () => void): () => void {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },

  getSnapshot(): EditorState {
    return state
  },

  /** Load a draft's element set; clears selection and history, marks clean. */
  load(elements: LayoutElementRow[]): void {
    state = { ...state, elements: structuredClone(elements), selection: [], dirty: false, mode: "select", placingType: null }
    past = []
    future = []
    emit()
  },

  markClean(): void {
    if (state.dirty) commit({ ...state, dirty: false })
  },

  markDirty(): void {
    if (!state.dirty) commit({ ...state, dirty: true })
  },

  setSnap(enabled: boolean): void {
    commit({ ...state, snapEnabled: enabled })
  },

  setGrid(visible: boolean): void {
    commit({ ...state, gridVisible: visible })
  },

  setMetric(metric: boolean): void {
    commit({ ...state, metricUnits: metric })
  },

  setMode(mode: EditorMode): void {
    commit({ ...state, mode, placingType: mode === "place" ? state.placingType : null })
  },

  startPlacement(type: LayoutElementType): void {
    commit({ ...state, mode: "place", placingType: type, selection: [] })
  },

  cancelPlacement(): void {
    commit({ ...state, mode: "select", placingType: null })
  },

  /** Drop a new element (picker → canvas click). Place elements get a
   *  linked location only via crearElemento (server-side); the editor
   *  drafts locally first. */
  addElement(type: LayoutElementType, x: number, y: number): string {
    const meta = ELEMENT_TYPE_META[type]
    const x1 = snapValue(x)
    const y1 = snapValue(y)
    const id = `editor-new-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
    const maxZ = state.elements.reduce((max, e) => Math.max(max, e.z_index ?? 0), 0)
    const elemento: EditorElement = {
      id,
      layout_id: "",
      location_id: null,
      element_type: type,
      code: null,
      name: null,
      description: null,
      x: x1,
      y: y1,
      visual_width: meta.defaultWidth,
      visual_height: meta.defaultHeight,
      rotation: 0,
      color: meta.color,
      icon: null,
      z_index: maxZ + 1,
      label: null,
      is_locked: false,
      is_visible: true,
      created_at: "",
      updated_at: "",
    }
    pushHistory()
    commit({
      ...state,
      elements: [...state.elements, elemento],
      selection: [id],
      dirty: true,
    })
    return id
  },

  select(ids: string[], additive = false): void {
    const selection = additive ? Array.from(new Set([...state.selection, ...ids])) : [...ids]
    commit({ ...state, selection })
  },

  moveSelected(dx: number, dy: number): void {
    if (state.selection.length === 0) return
    pushHistory()
    this.moveSelectedLive(dx, dy)
  },

  /** Move selected without pushing history (for continuous pointer gestures). */
  moveSelectedLive(dx: number, dy: number): void {
    if (state.selection.length === 0) return
    const elements = cloneElements()
    for (const el of elements) {
      if (!state.selection.includes(el.id) || el.is_locked) continue
      el.x = snapValue(el.x + dx)
      el.y = snapValue(el.y + dy)
    }
    commit({ ...state, elements, dirty: true })
  },

  /** Single snapshot for multi-move pointer gestures (undo = whole gesture). */
  beginGesture(): void {
    pushHistory()
  },

  updateElement(id: string, patch: Partial<EditorElement>): void {
    const elements = cloneElements()
    const el = elements.find((e) => e.id === id)
    if (!el || el.is_locked) return
    pushHistory()
    Object.assign(el, patch, { updated_at: new Date().toISOString() })
    commit({ ...state, elements, dirty: true })
  },

  /** Apply a patch without pushing history (pointer gestures). */
  updateElementLive(id: string, patch: Partial<EditorElement>): void {
    const elements = cloneElements()
    const el = elements.find((e) => e.id === id)
    if (!el || el.is_locked) return
    Object.assign(el, patch, { updated_at: new Date().toISOString() })
    commit({ ...state, elements, dirty: true })
  },

  resizeSelected(id: string, width: number, height: number): void {
    const elements = cloneElements()
    const el = elements.find((e) => e.id === id)
    if (!el || el.is_locked) return
    pushHistory()
    el.visual_width = clamp(Math.max(width, 16), 16, 4000)
    el.visual_height = clamp(Math.max(height, 16), 16, 4000)
    commit({ ...state, elements, dirty: true })
  },

  rotateSelected(id: string, rotation: number): void {
    const elements = cloneElements()
    const el = elements.find((e) => e.id === id)
    if (!el || el.is_locked) return
    pushHistory()
    const deg = rotation % 360
    el.rotation = deg < 0 ? deg + 360 : deg
    commit({ ...state, elements, dirty: true })
  },

  setLock(ids: string[], locked: boolean): void {
    pushHistory()
    const elements = cloneElements()
    for (const el of elements) {
      if (ids.includes(el.id)) el.is_locked = locked
    }
    commit({ ...state, elements, dirty: true })
  },

  deleteSelection(): void {
    if (state.selection.length === 0) return
    pushHistory()
    const elements = cloneElements()
    for (const el of elements) {
      if (state.selection.includes(el.id)) el.is_visible = false
    }
    const selection = state.selection.filter((id) => !elements.some((e) => e.id === id && !e.is_visible))
    commit({ ...state, elements, selection, dirty: true })
  },

  /** Restore hidden-by-delete elements (undo-friendly soft delete). */
  restoreHidden(ids: string[]): void {
    pushHistory()
    const elements = cloneElements()
    for (const el of elements) {
      if (ids.includes(el.id)) el.is_visible = true
    }
    commit({ ...state, elements, dirty: true })
  },

  duplicateSelection(): void {
    if (state.selection.length === 0) return
    pushHistory()
    let offset = 0
    const elements = cloneElements()
    const newIds: string[] = []
    for (const source of state.elements) {
      if (!state.selection.includes(source.id)) continue
      offset += GRID_SIZE
      const id = `editor-new-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
      newIds.push(id)
      elements.push({
        ...structuredClone(source),
        id,
        x: source.x + offset,
        y: source.y + offset,
        z_index: (source.z_index ?? 0) + offset,
        is_visible: true,
      })
    }
    commit({
      ...state,
      elements,
      selection: newIds,
      dirty: true,
      mode: "select",
      placingType: null,
    })
  },

  /** Layering (z-order). */
  orderSelection(direction: "front" | "back" | "forward" | "backward"): void {
    if (state.selection.length === 0) return
    pushHistory()
    const elements = cloneElements()
    const selected = elements.filter((el) => state.selection.includes(el.id) && !el.is_locked)
    if (selected.length === 0) return
    const others = elements.filter((el) => !state.selection.includes(el.id) && !el.is_locked)

    // Rebuild the z sequence with the selected set at the requested spot.
    if (direction === "front") {
      selected.forEach((el, i) => {
        el.z_index = others.length + i + 1
      })
    } else if (direction === "back") {
      selected.forEach((el, i) => {
        el.z_index = i + 1
      })
      others.forEach((el, i) => {
        el.z_index = selected.length + i + 1
      })
    } else {
      const step = direction === "forward" ? 1 : -1
      for (const el of selected) el.z_index = clamp((el.z_index ?? 0) + step, 1, elements.length)
    }
    // Normalize to consecutive z values so rendering order is deterministic.
    const order = elements
      .map((el, index) => ({ el, index }))
      .sort((a, b) => a.el.z_index! - b.el.z_index! || a.index - b.index)
    order.forEach(({ el }, i) => {
      el.z_index = i + 1
    })
    commit({ ...state, elements, dirty: true })
  },

  undo(): void {
    const prev = past.pop()
    if (!prev) return
    future.push(snapshot())
    state = { ...state, elements: prev.elements, selection: prev.selection }
    emit()
  },

  redo(): void {
    const next = future.pop()
    if (!next) return
    past.push(snapshot())
    state = { ...state, elements: next.elements, selection: next.selection }
    emit()
  },

  canUndo(): boolean {
    return past.length > 0
  },

  canRedo(): boolean {
    return future.length > 0
  },
}

/** Reactive selector hook for React components. */
export function useEditor<T>(selector: (s: EditorState) => T): T {
  return useSyncExternalStore(editorStore.subscribe, () => selector(editorStore.getSnapshot()))
}