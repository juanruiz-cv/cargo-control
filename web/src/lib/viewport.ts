/**
 * Viewport math for canvas maps (pure functions, no DOM).
 *
 * A viewport maps document coordinates (doc units) to screen pixels:
 *
 *   screen = doc * zoom + offset
 *
 * `x`/`y` are the screen-space offset of the document origin. Zoom is
 * clamped to [MIN_ZOOM, MAX_ZOOM] (25%–400%).
 */

export interface Viewport {
  zoom: number
  x: number
  y: number
}

export const MIN_ZOOM = 0.25
export const MAX_ZOOM = 4
export const MIN_DOC_SIZE = 100

export function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom))
}

export function pan(vp: Viewport, dx: number, dy: number): Viewport {
  return { zoom: vp.zoom, x: vp.x + dx, y: vp.y + dy }
}

/** Doc point → screen point. */
export function docToScreen(vp: Viewport, docX: number, docY: number): { x: number; y: number } {
  return { x: docX * vp.zoom + vp.x, y: docY * vp.zoom + vp.y }
}

/** Screen point → doc point. */
export function screenToDoc(vp: Viewport, px: number, py: number): { x: number; y: number } {
  return { x: (px - vp.x) / vp.zoom, y: (py - vp.y) / vp.zoom }
}

/**
 * Zoom keeping the document point under the cursor fixed. `factor > 1`
 * zooms in. Returns a new viewport whose `(px, py)` still maps to the
 * same document coordinates as before.
 */
export function zoomAtPoint(vp: Viewport, factor: number, px: number, py: number): Viewport {
  const zoom = clampZoom(vp.zoom * factor)
  const { x: dx, y: dy } = docToScreen(vp, (px - vp.x) / vp.zoom, (py - vp.y) / vp.zoom)
  return { zoom, x: px - dx, y: py - dy }
}

/**
 * Fit the full document into a container, centered, keeping zoom ≤ 1 so
 * the plan never renders larger than life by default.
 */
export function fitViewport(
  docWidth: number,
  docHeight: number,
  containerWidth: number,
  containerHeight: number,
  padding = 48,
): Viewport {
  const w = Math.max(docWidth, MIN_DOC_SIZE)
  const h = Math.max(docHeight, MIN_DOC_SIZE)
  const cw = Math.max(containerWidth - padding * 2, 1)
  const ch = Math.max(containerHeight - padding * 2, 1)
  const zoom = clampZoom(Math.min(cw / w, ch / h, 1))
  return {
    zoom,
    x: (containerWidth - w * zoom) / 2,
    y: (containerHeight - h * zoom) / 2,
  }
}

/** Bounding box of a document (for Fit and MiniMap). */
export function docBounds(vp: Viewport, docWidth: number, docHeight: number) {
  const tl = docToScreen(vp, 0, 0)
  const br = docToScreen(vp, docWidth, docHeight)
  return { left: tl.x, top: tl.y, width: br.x - tl.x, height: br.y - tl.y }
}

export function formatZoomPercent(zoom: number): string {
  return `${Math.round(zoom * 100)}%`
}