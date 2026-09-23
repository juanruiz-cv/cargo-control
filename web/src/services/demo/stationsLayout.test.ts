import { describe, expect, it } from "vitest"

import { createDemoServices } from "@/services/demo/adapters"
import {
  CAMPOS_DIFF_LAYOUT,
  computarDiffLayout,
  claveEstableLayoutElement,
} from "@/services/layoutService"
import type { LayoutElementRow } from "@/types"

/**
 * Station queues + layout diff engine (pure) + demo layout version flow.
 *
 * Seed state: lot-1-3 discharged at loc-scanner (scan queue pending),
 * lot-1-5 in_warehouse at loc-sector-02; layout-planta-v1/v2 exist.
 */

function element(overrides: Partial<LayoutElementRow> = {}): LayoutElementRow {
  return {
    id: overrides.id ?? "el-1",
    layout_id: "layout-planta-v1",
    location_id: null,
    element_type: "corridor",
    code: null,
    name: null,
    description: null,
    x: 0,
    y: 0,
    visual_width: null,
    visual_height: null,
    rotation: 0,
    color: null,
    icon: null,
    z_index: 0,
    label: null,
    is_locked: false,
    is_visible: true,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  }
}

describe("claveEstableLayoutElement", () => {
  it("uses location_id as the stable key for place elements", () => {
    const el = element({ location_id: "loc-galpon", element_type: "warehouse" })
    expect(claveEstableLayoutElement(el)).toBe("place:loc-galpon")
  })

  it("falls back to visual type + name (case-insensitive) when no location", () => {
    const el = element({ element_type: "door", name: "Puerta Norte" })
    expect(claveEstableLayoutElement(el)).toBe("visual:door:name:puerta norte")
  })

  it("returns null for visual elements without name/code", () => {
    const el = element({ element_type: "other" })
    expect(claveEstableLayoutElement(el)).toBeNull()
  })
})

describe("computarDiffLayout", () => {
  const ctx = { facilityId: "fac-demo", name: "planta", fromVersion: 1, toVersion: 2 }

  it("reports added/removed/changed with stable identity across versions", () => {
    const from = [
      element({ id: "a", location_id: "loc-1", x: 10, y: 20 }),
      element({ id: "b", location_id: "loc-2", x: 0, y: 0 }),
    ]
    const to = [
      element({ id: "a2", location_id: "loc-1", x: 30, y: 20 }), // moved x
      element({ id: "c", location_id: "loc-3", x: 0, y: 0 }), // added
    ]
    const diff = computarDiffLayout(from, to, ctx)

    expect(diff.counts.added).toBe(1)
    expect(diff.counts.removed).toBe(1)
    expect(diff.counts.changed).toBe(1)

    expect(diff.added[0].element_id).toBe("c")
    expect(diff.removed[0].element_id).toBe("b")
    expect(diff.changed[0]).toMatchObject({ element_id: "a2", field: "x", before: 10, after: 30 })
    // Render ref for the changed element resolves to the NEW version row
    expect(diff.elementos.find((r) => r.element_id === "a2")).toMatchObject({
      layout_version: 2,
      element_type: "corridor",
    })
  })

  it("empty diff when both versions carry the same stable keys and fields", () => {
    const a = element({ id: "a", location_id: "loc-1", x: 10 })
    const b = element({ id: "a2", location_id: "loc-1", x: 10 })
    const diff = computarDiffLayout([a], [b], ctx)
    expect(diff.counts).toEqual({ added: 0, removed: 0, changed: 0 })
    expect(diff.elementos).toEqual([])
  })

  it("counts one change per differing field (moved element = 2 field changes)", () => {
    const from = [element({ id: "a", location_id: "loc-1", x: 10, y: 20 })]
    const to = [element({ id: "a2", location_id: "loc-1", x: 15, y: 25 })]
    const diff = computarDiffLayout(from, to, ctx)
    expect(diff.counts.changed).toBe(2)
    const campos = diff.changed.map((c) => c.field)
    expect(campos).toContain("x")
    expect(campos).toContain("y")
  })

  it("diffs exactly the ten documented fields", () => {
    expect(CAMPOS_DIFF_LAYOUT).toEqual([
      "x",
      "y",
      "width",
      "height",
      "rotation",
      "color",
      "icon",
      "label",
      "is_visible",
      "location_id",
    ])
  })
})

describe("demo stations", () => {
  it("lists the seed pending scan queue (lot-1-3 discharged at scanner)", async () => {
    const svc = createDemoServices()
    const cola = await svc.stations.obtenerColaPendiente("scan")
    const entry = cola.find((q) => q.item_lot_id === "lot-1-3")
    expect(entry).toBeDefined()
    expect(entry?.queue_kind).toBe("scan")
  })

  it("creates a scan_in operation and advances the lot to checked", async () => {
    const svc = createDemoServices()
    const op = await svc.stations.scanner.crearOperacionScan({
      itemLotId: "lot-1-3",
      scannedCode: "REP-2002",
      operatorId: "user-demo",
    })
    expect(op.result).toBe("success")
    expect(op.movement_id).toBeGreaterThan(0)

    const despues = await svc.cargo.obtenerManifest("manifest-1")
    const lot = despues?.items.flatMap((x) => x.lots).find((l) => l.id === "lot-1-3")
    expect(lot?.status).toBe("checked")
  })

  it("non-success scan keeps the lot pending (SBF-05: append-only row, no advance)", async () => {
    const svc = createDemoServices()
    const op = await svc.stations.scanner.crearOperacionScan({
      itemLotId: "lot-1-3",
      scannedCode: "DESCONOCIDO",
      result: "not_found",
    })
    expect(op.result).toBe("not_found")

    const despues = await svc.cargo.obtenerManifest("manifest-1")
    const lot = despues?.items.flatMap((x) => x.lots).find((l) => l.id === "lot-1-3")
    expect(lot?.status).toBe("discharged") // unchanged
  })

  it("creates a scale operation with tolerance verdict", async () => {
    const svc = createDemoServices()
    const op = await svc.stations.escala.crearOperacionEscala({
      itemLotId: "lot-1-3",
      grossKg: 12,
      tareKg: 0.4,
      netKg: 11.6,
      expectedKg: 12,
      toleranceKg: 0.5,
      withinTolerance: true,
    })
    expect(op.within_tolerance).toBe(true)
    expect(op.net_kg).toBe(11.6)
    expect(op.movement_id).toBeGreaterThan(0)
  })
})

describe("demo layout versions", () => {
  it("creates a new draft version by copying the published base", async () => {
    const svc = createDemoServices()
    const publicado = await svc.layouts.obtenerLayoutPublicado("fac-demo")
    expect(publicado).not.toBeNull()

    const nueva = await svc.layouts.crearVersion({
      facilityId: "fac-demo",
      name: publicado!.layout.name,
      baseVersionId: publicado!.layout.id,
      description: "copia test",
    })
    expect(nueva.layout.status).toBe("draft")
    // Version numbering scans ALL versions of (facility, name): seed has v1
    // published + v2 draft → the new draft is v3, one ABOVE the max.
    expect(nueva.layout.version).toBeGreaterThan(publicado!.layout.version)
    expect(nueva.elementos.length).toBe(publicado!.elementos.length)
  })

  it("publishes a draft and archives the previous published version", async () => {
    const svc = createDemoServices()
    const versiones = await svc.layouts.listarVersiones({ facilidadId: "fac-demo" })
    const draft = versiones.find((l) => l.status === "draft")
    expect(draft).toBeDefined()

    const publicada = await svc.layouts.publicarVersion(draft!.id, null, "user-demo")
    expect(publicada.status).toBe("published")

    const despues = await svc.layouts.listarVersiones({ facilidadId: "fac-demo" })
    const publicadas = despues.filter((l) => l.status === "published")
    expect(publicadas).toHaveLength(1)
    expect(publicadas[0].id).toBe(draft!.id)
    // the old published v1 became archived
    expect(despues.filter((l) => l.status === "archived")).toHaveLength(1)
  })

  it("restores a version as a fresh draft copying its elements", async () => {
    const svc = createDemoServices()
    const publicado = await svc.layouts.obtenerLayoutPublicado("fac-demo")
    const restaurada = await svc.layouts.restaurarVersion(publicado!.layout.id, "user-demo")

    expect(restaurada.layout.status).toBe("draft")
    expect(restaurada.layout.description).toBe(`Restaurado desde versión ${publicado!.layout.version}`)
    expect(restaurada.elementos.length).toBe(publicado!.elementos.length)
  })
})