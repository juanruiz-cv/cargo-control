import { useCallback, useRef, useState, type Dispatch, type SetStateAction } from "react"
import { fitViewport, MAX_ZOOM, MIN_ZOOM, zoomAtPoint, type Viewport } from "@/lib/viewport"

export const ZOOM_STEP = 1.25

export interface UseViewportOptions {
  /** Document size in doc units (for Fit). */
  docWidth?: number
  docHeight?: number
  initial?: Viewport
}

export interface UseViewportResult {
  containerRef: React.RefObject<HTMLDivElement | null>
  viewport: Viewport
  setViewport: Dispatch<SetStateAction<Viewport>>
  zoomIn: (at?: { x: number; y: number }) => void
  zoomOut: (at?: { x: number; y: number }) => void
  fit: () => void
  reset: () => void
  atMinZoom: boolean
  atMaxZoom: boolean
}

/**
 * Viewport state + zoom helpers for canvas-based maps and the floor-plan
 * editor. Panning is handled by whoever owns the pointer gestures; this
 * hook only owns the numeric viewport and the zoom/fit commands.
 */
export function useViewport(options: UseViewportOptions = {}): UseViewportResult {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [viewport, setViewport] = useState<Viewport>(() => options.initial ?? { zoom: 1, x: 0, y: 0 })

  const zoomIn = useCallback(
    (at?: { x: number; y: number }) => {
      setViewport((vp) =>
        zoomAtPoint(
          vp,
          ZOOM_STEP,
          at?.x ?? (containerRef.current?.clientWidth ?? 0) / 2,
          at?.y ?? (containerRef.current?.clientHeight ?? 0) / 2,
        ),
      )
    },
    [],
  )

  const zoomOut = useCallback(
    (at?: { x: number; y: number }) => {
      setViewport((vp) =>
        zoomAtPoint(
          vp,
          1 / ZOOM_STEP,
          at?.x ?? (containerRef.current?.clientWidth ?? 0) / 2,
          at?.y ?? (containerRef.current?.clientHeight ?? 0) / 2,
        ),
      )
    },
    [],
  )

  const fit = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    setViewport(
      fitViewport(
        options.docWidth ?? 0,
        options.docHeight ?? 0,
        el.clientWidth,
        el.clientHeight,
      ),
    )
  }, [options.docWidth, options.docHeight])

  const reset = useCallback(() => {
    setViewport(options.initial ?? { zoom: 1, x: 0, y: 0 })
  }, [options.initial])

  return {
    containerRef,
    viewport,
    setViewport,
    zoomIn,
    zoomOut,
    fit,
    reset,
    atMinZoom: viewport.zoom <= MIN_ZOOM,
    atMaxZoom: viewport.zoom >= MAX_ZOOM,
  }
}