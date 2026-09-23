import { describe, expect, it } from "vitest"

import {
  clampZoom,
  docBounds,
  docToScreen,
  fitViewport,
  formatZoomPercent,
  MAX_ZOOM,
  MIN_ZOOM,
  MIN_DOC_SIZE,
  pan,
  screenToDoc,
  wheelZoomFactor,
  zoomAtPoint,
} from "@/lib/viewport"

describe("clampZoom", () => {
  it("clips below MIN_ZOOM", () => {
    expect(clampZoom(0.1)).toBe(MIN_ZOOM)
  })

  it("clips above MAX_ZOOM", () => {
    expect(clampZoom(9)).toBe(MAX_ZOOM)
  })

  it("keeps in-range values", () => {
    expect(clampZoom(1.5)).toBe(1.5)
  })
})

describe("wheelZoomFactor", () => {
  it("zooms OUT for positive deltaY (scroll down)", () => {
    expect(wheelZoomFactor(100, 0)).toBeLessThan(1)
  })

  it("zooms IN for negative deltaY", () => {
    expect(wheelZoomFactor(-100, 0)).toBeGreaterThan(1)
  })

  it("normalizes deltaMode lines to pixels", () => {
    // deltaMode 1 (lines): 16 px per line — 100 lines ≈ 1600 px, clamped to 320.
    const lineFactor = wheelZoomFactor(100, 1)
    const pixFactor = wheelZoomFactor(320, 0)
    expect(lineFactor).toBeCloseTo(pixFactor, 6)
  })

  it("clamps a fast wheel flick", () => {
    const big = wheelZoomFactor(10000, 0)
    const capped = wheelZoomFactor(320, 0)
    expect(big).toBe(capped)
  })

  it("is neutral for zero delta", () => {
    expect(wheelZoomFactor(0, 0)).toBe(1)
  })
})

describe("pan", () => {
  it("translates screen offsets without touching zoom", () => {
    const vp = { zoom: 2, x: 10, y: 20 }
    expect(pan(vp, 5, -7)).toEqual({ zoom: 2, x: 15, y: 13 })
  })

  it("returns a new object (immutable)", () => {
    const vp = { zoom: 1, x: 0, y: 0 }
    const next = pan(vp, 1, 1)
    expect(next).not.toBe(vp)
    expect(vp).toEqual({ zoom: 1, x: 0, y: 0 })
  })
})

describe("docToScreen / screenToDoc", () => {
  const vp = { zoom: 2, x: 100, y: 50 }

  it("maps doc -> screen -> doc round-trip", () => {
    const doc = { x: 30, y: 40 }
    const screen = docToScreen(vp, doc.x, doc.y)
    const back = screenToDoc(vp, screen.x, screen.y)
    expect(back.x).toBeCloseTo(doc.x, 6)
    expect(back.y).toBeCloseTo(doc.y, 6)
  })

  it("applies zoom and offset", () => {
    expect(docToScreen(vp, 10, 5)).toEqual({ x: 120, y: 60 })
  })
})

describe("zoomAtPoint", () => {
  it("keeps the cursor doc point fixed while zooming in", () => {
    const vp = { zoom: 1, x: 0, y: 0 }
    const cursor = { x: 150, y: 100 }
    const next = zoomAtPoint(vp, 2, cursor.x, cursor.y)
    expect(next.zoom).toBe(2)
    const docBefore = screenToDoc(vp, cursor.x, cursor.y)
    const docAfter = screenToDoc(next, cursor.x, cursor.y)
    expect(docAfter.x).toBeCloseTo(docBefore.x, 6)
    expect(docAfter.y).toBeCloseTo(docBefore.y, 6)
  })

  it("clamps zoom to MAX_ZOOM", () => {
    const vp = { zoom: 3, x: 0, y: 0 }
    expect(zoomAtPoint(vp, 10, 0, 0).zoom).toBe(MAX_ZOOM)
  })
})

describe("fitViewport", () => {
  it("fits the doc centered with zoom ≤ 1", () => {
    const vp = fitViewport(1000, 500, 1200, 800)
    expect(vp.zoom).toBeCloseTo(1.104 / 1.104, 1) // min(cw/w, ch/h, 1) = 1
    // With doc 1000x500 and container 1200x800 padding 48: cw=1104, ch=704.
    // zoom = min(1104/1000, 704/500, 1) = 1. Centered offsets:
    expect(vp.x).toBeCloseTo((1200 - 1000) / 2, 1)
    expect(vp.y).toBeCloseTo((800 - 500) / 2, 1)
  })

  it("never renders larger than life (zoom ≤ 1)", () => {
    const vp = fitViewport(100, 100, 600, 600)
    expect(vp.zoom).toBeLessThanOrEqual(1)
  })

  it("respects MIN_DOC_SIZE for tiny documents", () => {
    const vp = fitViewport(5, 5, 300, 300)
    // w = max(5, 100) = 100 → zoom = min(204/100, 204/100, 1) = 1
    expect(vp.zoom).toBeLessThanOrEqual(1)
    expect(vp.zoom).toBeCloseTo(MIN_DOC_SIZE / 100, 1)
  })
})

describe("docBounds / formatZoomPercent", () => {
  it("computes the doc bounding box in screen px", () => {
    const vp = { zoom: 2, x: 10, y: 20 }
    const b = docBounds(vp, 100, 50)
    expect(b.left).toBe(10)
    expect(b.top).toBe(20)
    expect(b.width).toBe(200)
    expect(b.height).toBe(100)
  })

  it("formats zoom as a percent", () => {
    expect(formatZoomPercent(1)).toBe("100%")
    expect(formatZoomPercent(0.25)).toBe("25%")
    expect(formatZoomPercent(1.5)).toBe("150%")
  })
})