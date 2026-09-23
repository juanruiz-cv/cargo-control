import { describe, expect, it } from "vitest"

import { createDemoState } from "@/services/demo/seed"
import {
  computarMetricasDemo,
  computarSnapshotOcupacionDemo,
  computarSerieDemo,
  dayBucketKey,
} from "@/services/demo/dashboardAggregates"
import { computarTotalAuditoriaDemo, demoLotes } from "@/services/demo/reportAggregates"

/**
 * Golden invariants for the dashboard/report aggregate mirrors
 * (0005_views.sql lines 219-390) against the demo seed.
 *
 * Seed state (seed.ts) drives these expectations:
 *   - lot-1-2 quantity 50 in_quarantine (loc-rezago)
 *   - lot-2-1 quantity 200 seized (loc-secuestro)
 *   - lot-1-4 quantity 500 @3.2kg in_warehouse (loc-sector-01)
 *   - lot-1-5 quantity 300 @8.1kg in_warehouse (loc-sector-02)
 *   - lot-1-3 discharged at loc-scanner (scan queue pending)
 *   - truck-2 / truck-3 arrived with no egress → yard
 */

describe("computarMetricasDemo (dashboard_metrics mirror)", () => {
  it("computes stored, retained and station quantities from lots", () => {
    const state = createDemoState()
    const m = computarMetricasDemo(state)

    // in_warehouse lots: 500 + 300 units; 500*3.2 + 300*8.1 = 4030 kg
    expect(m.merchandise_stored).toBe(800)
    expect(m.merchandise_stored_weight_kg).toBe(4030)

    // open holds: 50 quarantine + 200 seized
    expect(m.merchandise_in_quarantine).toBe(50)
    expect(m.merchandise_seized).toBe(200)

    // scanner queue: lot-1-3 discharged@scanner (30 units)
    expect(m.merchandise_in_scanner).toBe(30)
    expect(m.merchandise_in_scale).toBe(0)
  })

  it("counts arrived trucks in the yard and stored sectors as occupied", () => {
    const state = createDemoState()
    const m = computarMetricasDemo(state)

    expect(m.trucks_in_yard).toBeGreaterThanOrEqual(2) // truck-2 + truck-3
    // three stored/sector rows: sector-01 (full), sector-02 (partial) + retains/scanner
    expect(m.sectors_occupied).toBeGreaterThanOrEqual(2)
    expect(m.sectors_free).toBeGreaterThan(0)
  })
})

describe("serie + occupancy mirrors", () => {
  it("dayBucketKey groups ISO instants by UTC day", () => {
    expect(dayBucketKey("2026-09-18T10:05:00.000Z")).toBe("2026-09-18")
    expect(dayBucketKey("2026-09-19T23:59:59.999Z")).toBe("2026-09-19")
  })

  it("snapshot occupancy reports seated and free sectors from location_occupancy", () => {
    const state = createDemoState()
    const snapshot = computarSnapshotOcupacionDemo(state)
    expect(snapshot).toBeInstanceOf(Array)
    expect(snapshot.length).toBeGreaterThan(0)
    // sector-01 carries lot-1-4 (500u) → 500 units occupied
    const sector01 = snapshot.find((s) => s.location_id === "loc-sector-01")
    expect(sector01?.occupancy_units).toBe(500)
  })

  it("computes an arrivals series over the demo window", () => {
    const state = createDemoState()
    const serie = computarSerieDemo(state, "arrivals", { desde: "2026-09-01" })
    expect(serie).toBeInstanceOf(Array)
    const llegadas = serie.filter((f) => "arrivals" in f)
    expect(llegadas.length).toBeGreaterThanOrEqual(2) // manifest-1 + manifest-2 arrivals
    // seed movements happen 2026-09-18/19 → inside the window
  })

  it("computes a merchandise_processed series summing movement item quantities", () => {
    const state = createDemoState()
    const serie = computarSerieDemo(state, "merchandise_processed", { desde: "2026-09-01" })
    const total = serie.reduce((acc, f) => acc + ("merchandise_processed" in f ? f.merchandise_processed : 0), 0)
    expect(total).toBeGreaterThan(0)
  })
})

describe("report aggregates mirrors", () => {
  it("demoLotes maps every lot by id", () => {
    const state = createDemoState()
    const lotes = demoLotes(state)
    expect(lotes.get("lot-1-1")?.quantity).toBe(100)
    expect(lotes.get("lot-2-1")?.status).toBe("seized")
  })

  it("audit totals count seed log events", () => {
    const state = createDemoState()
    const total = computarTotalAuditoriaDemo(state)
    expect(total).toBeGreaterThan(0)
    expect(Number.isInteger(total)).toBe(true)
  })
})