import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react"
import { Lock } from "lucide-react"
import type { LayoutElementRow } from "@/types"
import { docToScreen, screenToDoc, zoomAtPoint, wheelZoomFactor, type Viewport } from "@/lib/viewport"
import { ELEMENT_TYPE_META } from "@/components/map/shared/elementMeta"
import { editorStore, GRID_SIZE, useEditor } from "@/components/editor/editorStore"
import type { EditorElement } from "@/components/editor/editorStore"

export const MIN_ELEMENT_SIZE = 16

type ResizeHandle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w"
const HANDLES: ResizeHandle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"]

interface Vec2 {
  x: number
  y: number
}

interface GestureState {
  kind: "move" | "resize" | "rotate" | "pan"
  elementId?: string
  handle?: ResizeHandle
  startPointer: Vec2
  startElement?: EditorElement
  startViewport?: Viewport
  startAngle?: number
}

export function calcularBounds(elements: LayoutElementRow[]): { width: number; height: number } {
  let maxX = 0
  let maxY = 0
  for (const el of elements) {
    maxX = Math.max(maxX, el.x + (el.visual_width ?? 0))
    maxY = Math.max(maxY, el.y + (el.visual_height ?? 0))
  }
  const w = Math.max(maxX, 1000)
  const h = Math.max(maxY, 700)
  return { width: w, height: h }
}

export interface FloorPlanCanvasProps {
  /** read-only mode (preview): renders like the operational map, no handles. */
  readOnly?: boolean
  /** Shared viewport (page-owned: toolbar zoom + minimap use the same one). */
  viewport: Viewport
  setViewport: Dispatch<SetStateAction<Viewport>>
  fit: () => void
  /**
   * Optional external ref for the canvas container — lets a page-owned
   * viewport (useViewport) measure the real canvas size for Fit.
   */
  containerRef?: React.RefObject<HTMLDivElement | null>
}

/**
 * Interactive canvas for the floor-plan editor (docs/ux/floor-plan-editor.md
 * §5–§7): grid, snap, pan, zoom at cursor, move/resize/rotate gestures and
 * click-to-place from the picker.
 */
export function FloorPlanCanvas({ readOnly = false, viewport, setViewport, fit, containerRef: externalRef }: FloorPlanCanvasProps) {
  const elements = useEditor((s) => s.elements)
  const selection = useEditor((s) => s.selection)
  const snapEnabled = useEditor((s) => s.snapEnabled)
  const gridVisible = useEditor((s) => s.gridVisible)
  const mode = useEditor((s) => s.mode)
  const placingType = useEditor((s) => s.placingType)

  const bounds = calcularBounds(elements)
  const gestureRef = useRef<GestureState | null>(null)
  const cursorDocRef = useRef<Vec2 | null>(null)
  const [ghost, setGhost] = useState<Vec2 | null>(null)

  const internalRef = useRef<HTMLDivElement | null>(null)
  const containerRef = externalRef ?? internalRef

  // Fit once the container has a size (and whenever the document bounds change).
  const fittedRef = useRef<string | null>(null)
  const fitKey = `${bounds.width}x${bounds.height}`
  useEffect(() => {
    if (fittedRef.current !== fitKey) {
      fittedRef.current = fitKey
      if (containerRef.current && containerRef.current.clientWidth > 0) fit()
    }
  }, [fitKey, fit, containerRef])

  // Wheel zoom at cursor (React wheel listeners are passive; attach natively).

  // Wheel zoom at cursor (React wheel listeners are passive; attach natively).
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onWheel = (event: WheelEvent) => {
      if (readOnly) return
      event.preventDefault()
      const rect = el.getBoundingClientRect()
      const at = { x: event.clientX - rect.left, y: event.clientY - rect.top }
      setViewport((vp) => zoomAtPoint(vp, wheelZoomFactor(event.deltaY, event.deltaMode), at.x, at.y))
    }
    el.addEventListener("wheel", onWheel, { passive: false })
    return () => el.removeEventListener("wheel", onWheel)
  }, [containerRef, setViewport, readOnly])

  const toDoc = useCallback(
    (event: { clientX: number; clientY: number }): Vec2 => {
      const rect = containerRef.current?.getBoundingClientRect()
      return rect
        ? screenToDoc(viewport, event.clientX - rect.left, event.clientY - rect.top)
        : { x: 0, y: 0 }
    },
    [viewport, containerRef],
  )

  const startGesture = useCallback(
    (gesture: GestureState) => {
      gestureRef.current = gesture
      editorStore.beginGesture()
    },
    [],
  )

  const onPointerDown = useCallback(
    (event: React.PointerEvent) => {
      if (readOnly) return
      const point = toDoc(event)
      const target = event.target as HTMLElement
      const elementId = target.closest("[data-element-id]")?.getAttribute("data-element-id")
      const handle = target.getAttribute("data-handle") as ResizeHandle | null
      const rotating = target.hasAttribute("data-rotate-handle")

      // Placement drop
      if (mode === "place" && placingType) {
        editorStore.addElement(placingType, point.x, point.y)
        return
      }

      // Pan: space-hold, middle button, or pan mode
      if (mode === "pan" || event.button === 1) {
        startGesture({ kind: "pan", startPointer: { x: event.clientX, y: event.clientY }, startViewport: viewport })
        ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
        return
      }

      if (elementId) {
        const el = elements.find((e) => e.id === elementId)
        if (!el) return
        if (!event.shiftKey && !selection.includes(el.id)) editorStore.select([el.id])
        if (event.shiftKey) editorStore.select([el.id], true)

        if (rotating) {
          const center = { x: el.x + (el.visual_width ?? 0) / 2, y: el.y + (el.visual_height ?? 0) / 2 }
          const startAngle = (Math.atan2(point.y - center.y, point.x - center.x) * 180) / Math.PI
          startGesture({ kind: "rotate", elementId: el.id, startPointer: { x: event.clientX, y: event.clientY }, startElement: structuredClone(el), startAngle })
          ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
          return
        }
        if (handle) {
          startGesture({ kind: "resize", elementId: el.id, handle, startPointer: { x: event.clientX, y: event.clientY }, startElement: structuredClone(el) })
          ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
          return
        }
        startGesture({ kind: "move", elementId: el.id, startPointer: { x: event.clientX, y: event.clientY }, startElement: structuredClone(el) })
        ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
        return
      }

      // Empty canvas: start a pan (or drag-select box — out of scope v1).
      startGesture({ kind: "pan", startPointer: { x: event.clientX, y: event.clientY }, startViewport: viewport })
      ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
    },
    [readOnly, toDoc, mode, placingType, elements, selection, viewport, startGesture],
  )

  const onPointerMove = useCallback(
    (event: React.PointerEvent) => {
      const point = toDoc(event)
      cursorDocRef.current = point
      setGhost(readOnly ? null : point)

      const gesture = gestureRef.current
      if (!gesture) return

      if (gesture.kind === "pan") {
        const dx = event.clientX - gesture.startPointer.x
        const dy = event.clientY - gesture.startPointer.y
        setViewport((vp) => ({ zoom: vp.zoom, x: (gesture.startViewport?.x ?? 0) + dx, y: (gesture.startViewport?.y ?? 0) + dy }))
        return
      }

      if (gesture.kind === "move" && gesture.elementId) {
        const dx = (event.clientX - gesture.startPointer.x) / viewport.zoom
        const dy = (event.clientY - gesture.startPointer.y) / viewport.zoom
        editorStore.moveSelectedLive(dx, dy)
        return
      }

      if (gesture.kind === "resize" && gesture.elementId && gesture.startElement && gesture.handle) {
        const el = gesture.startElement
        const start = { x: el.x, y: el.y }
        const end = { x: el.x + (el.visual_width ?? 0), y: el.y + (el.visual_height ?? 0) }
        const dx = (event.clientX - gesture.startPointer.x) / viewport.zoom
        const dy = (event.clientY - gesture.startPointer.y) / viewport.zoom
        const h = gesture.handle
        let x1 = start.x
        let y1 = start.y
        let x2 = end.x
        let y2 = end.y
        if (h.includes("e")) x2 = end.x + dx
        if (h.includes("s")) y2 = end.y + dy
        if (h.includes("w")) x1 = start.x + dx
        if (h.includes("n")) y1 = start.y + dy

        let width = Math.max(x2 - x1, MIN_ELEMENT_SIZE)
        let height = Math.max(y2 - y1, MIN_ELEMENT_SIZE)
        if (h.includes("w")) x1 = x2 - width
        if (h.includes("n")) y1 = y2 - height
        if (snapEnabled) {
          width = Math.round(width / GRID_SIZE) * GRID_SIZE
          height = Math.round(height / GRID_SIZE) * GRID_SIZE
        }
        const patch: Partial<LayoutElementRow> = {
          x: Math.round(x1),
          y: Math.round(y1),
          visual_width: width,
          visual_height: height,
        }
        editorStore.updateElementLive(gesture.elementId, patch)
        return
      }

      if (gesture.kind === "rotate" && gesture.elementId && gesture.startElement && gesture.startAngle !== undefined) {
        const el = gesture.startElement
        const center = { x: el.x + (el.visual_width ?? 0) / 2, y: el.y + (el.visual_height ?? 0) / 2 }
        const angle = (Math.atan2(point.y - center.y, point.x - center.x) * 180) / Math.PI
        let delta = angle - gesture.startAngle
        if (event.shiftKey) delta = Math.round(delta / 15) * 15
        editorStore.updateElementLive(gesture.elementId, { rotation: Math.round(((el.rotation ?? 0) + delta) * 10) / 10 })
      }
    },
    [readOnly, toDoc, setViewport, viewport, snapEnabled],
  )

  const onPointerUp = useCallback((event: React.PointerEvent) => {
    gestureRef.current = null
    ;(event.currentTarget as HTMLElement).releasePointerCapture?.(event.pointerId)
  }, [])

  // Space key → temporary pan mode (handled via mode already in page shortcuts).
  const placeGhost = mode === "place" && placingType && ghost && !readOnly
  const ghostMeta = placingType ? ELEMENT_TYPE_META[placingType] : null

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full touch-none overflow-hidden select-none"
      style={{
        backgroundImage: gridVisible
          ? "linear-gradient(to right, rgb(203 213 225 / 0.5) 1px, transparent 1px), linear-gradient(to bottom, rgb(203 213 225 / 0.5) 1px, transparent 1px)"
          : undefined,
        backgroundSize: `${GRID_SIZE * viewport.zoom}px ${GRID_SIZE * viewport.zoom}px`,
        cursor: mode === "place" ? "crosshair" : mode === "pan" ? "grab" : "default",
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
    >
      <div className="absolute top-0 left-0" style={{ transform: `translate(${viewport.x}px, ${viewport.y}px)` }}>
        {elements
          .filter((el) => el.is_visible)
          .map((el) => (
            <CanvasElement
              key={el.id}
              el={el}
              viewport={viewport}
              selected={selection.includes(el.id)}
              readOnly={readOnly}
            />
          ))}

        {placeGhost && ghostMeta ? (
          <div
            aria-hidden
            className="pointer-events-none absolute flex items-center justify-center rounded-[5px] border-2 border-dashed border-primary/70"
            style={{
              left: ghost.x,
              top: ghost.y,
              width: ghostMeta.defaultWidth,
              height: ghostMeta.defaultHeight,
              backgroundColor: "color-mix(in srgb, " + ghostMeta.color + " 25%, white)",
            }}
          >
            <span className="px-1 text-center text-[10px] font-medium text-muted-foreground">{ghostMeta.labelEs}</span>
          </div>
        ) : null}
      </div>

      {mode === "place" && !readOnly ? (
        <div className="pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 rounded-full border bg-background px-3 py-1 text-xs text-muted-foreground shadow-sm">
          Click en el plano para colocar · Esc para cancelar
        </div>
      ) : null}
    </div>
  )
}

interface CanvasElementProps {
  el: EditorElement
  viewport: Viewport
  selected: boolean
  readOnly: boolean
}

function CanvasElement({ el, viewport, selected, readOnly }: CanvasElementProps) {
  const meta = ELEMENT_TYPE_META[el.element_type]
  const s = docToScreen(viewport, el.x, el.y)
  const w = (el.visual_width ?? meta.defaultWidth) * viewport.zoom
  const h = (el.visual_height ?? meta.defaultHeight) * viewport.zoom
  const showHandles = selected && !readOnly && !el.is_locked && viewport.zoom > 0.4

  const label = el.name ?? el.code ?? meta.labelEs
  const fontSize = Math.max(8, 11 * viewport.zoom)

  return (
    <div
      data-element-id={el.id}
      role="button"
      tabIndex={selected ? 0 : -1}
      aria-label={`${meta.labelEs} ${label}`}
      className="absolute cursor-move focus-visible:outline-none"
      style={{
        left: s.x,
        top: s.y,
        width: w,
        height: h,
        transform: `rotate(${el.rotation ?? 0}deg)`,
        backgroundColor: `color-mix(in srgb, ${el.color ?? meta.color} 38%, white)`,
        border: el.is_locked
          ? "1.5px dashed rgb(100 116 139 / 0.7)"
          : selected
            ? "2px solid #1F4E5F"
            : "1px solid rgb(100 116 139 / 0.55)",
        borderRadius: 5,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      <span
        className="pointer-events-none truncate px-1 font-medium"
        style={{ fontSize, color: "rgb(31 41 51 / 0.85)", transform: `rotate(${-(el.rotation ?? 0)}deg)` }}
      >
        {label}
      </span>

      {el.is_locked && !readOnly ? (
        <Lock className="pointer-events-none absolute top-1 left-1 size-3 text-muted-foreground" />
      ) : null}

      {showHandles ? (
        <>
          {HANDLES.map((handle) => {
            const pos: React.CSSProperties = {}
            if (handle.includes("n")) pos.top = -5
            if (handle.includes("s")) pos.bottom = -5
            if (handle.includes("w")) pos.left = -5
            if (handle.includes("e")) pos.right = -5
            if (handle === "n" || handle === "s") {
              pos.left = "50%"
              pos.marginLeft = -4
            }
            if (handle === "w" || handle === "e") {
              pos.top = "50%"
              pos.marginTop = -4
            }
            return (
              <span
                key={handle}
                data-handle={handle}
                className="absolute z-10 size-2 cursor-nwse-resize rounded-[2px] border border-white bg-[#1F4E5F]"
                style={pos}
              />
            )
          })}
          {/* Rotate handle */}
          <span
            data-rotate-handle
            className="absolute z-10 flex cursor-grab items-center justify-center"
            style={{ top: -22, left: "50%", marginLeft: -6, width: 12, height: 12 }}
          >
            <span className="block h-4 w-px bg-[#1F4E5F]" style={{ position: "absolute", top: 4 }} />
            <span className="block size-2.5 rounded-full border border-white bg-[#1F4E5F]" />
          </span>
        </>
      ) : null}
    </div>
  )
}