import { act, renderHook } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { useViewport, ZOOM_STEP } from "@/hooks/useViewport"
import { MAX_ZOOM, MIN_ZOOM } from "@/lib/viewport"

describe("useViewport", () => {
  it("starts at zoom 1, origin 0,0 by default", () => {
    const { result } = renderHook(() => useViewport())
    expect(result.current.viewport).toEqual({ zoom: 1, x: 0, y: 0 })
    expect(result.current.atMinZoom).toBe(false)
    expect(result.current.atMaxZoom).toBe(false)
  })

  it("respects the initial viewport", () => {
    const initial = { zoom: 2.5, x: 40, y: -10 }
    const { result } = renderHook(() => useViewport({ initial }))
    expect(result.current.viewport).toEqual(initial)
  })

  it("zoomIn scales by ZOOM_STEP around the container center", () => {
    const { result } = renderHook(() => useViewport())
    act(() => {
      result.current.zoomIn()
    })
    expect(result.current.viewport.zoom).toBe(ZOOM_STEP)
    // jsdom container has no layout (0×0), so the anchor is the origin (0,0):
    // the doc point (0,0) must stay at screen (0,0), hence x=y=0.
    expect(result.current.viewport.x).toBe(0)
    expect(result.current.viewport.y).toBe(0)
  })

  it("zoomIn at a point keeps the anchored doc point fixed", () => {
    const { result } = renderHook(() => useViewport({ initial: { zoom: 1, x: 0, y: 0 } }))
    act(() => {
      result.current.zoomIn({ x: 100, y: 50 })
    })
    const vp = result.current.viewport
    // zoomAtPoint(1,0,0, STEP, 100,50): zoom=STEP; x=px - docX*zoom = 100 - 100*STEP
    expect(vp.zoom).toBe(ZOOM_STEP)
    expect(vp.x).toBeCloseTo(100 - 100 * ZOOM_STEP, 6)
    expect(vp.y).toBeCloseTo(50 - 50 * ZOOM_STEP, 6)
  })

  it("clamps at MAX_ZOOM and reports atMaxZoom", () => {
    const { result } = renderHook(() => useViewport({ initial: { zoom: MAX_ZOOM, x: 0, y: 0 } }))
    act(() => {
      result.current.zoomIn()
    })
    expect(result.current.viewport.zoom).toBe(MAX_ZOOM)
    expect(result.current.atMaxZoom).toBe(true)
  })

  it("clamps at MIN_ZOOM and reports atMinZoom", () => {
    const { result } = renderHook(() => useViewport({ initial: { zoom: MIN_ZOOM, x: 0, y: 0 } }))
    act(() => {
      result.current.zoomOut()
    })
    expect(result.current.viewport.zoom).toBe(MIN_ZOOM)
    expect(result.current.atMinZoom).toBe(true)
  })

  it("reset returns to the initial viewport", () => {
    const initial = { zoom: 1.5, x: 10, y: 20 }
    const { result } = renderHook(() => useViewport({ initial }))
    act(() => {
      result.current.setViewport({ zoom: 3, x: 0, y: 0 })
    })
    expect(result.current.viewport.zoom).toBe(3)
    act(() => {
      result.current.reset()
    })
    expect(result.current.viewport).toEqual(initial)
  })
})