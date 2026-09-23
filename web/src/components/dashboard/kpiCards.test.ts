import { describe, expect, it } from "vitest"

import { KPI_CARDS, kpisVisibles } from "@/components/dashboard/kpiCards"
import type { DashboardMetricsRow, PermissionCode } from "@/types"

/**
 * Dashboard KPI registry — pure permission gate + es-AR formatting
 * (operational-dashboard.md §KPI grid; ADR 0013).
 */

const METRICAS: DashboardMetricsRow = {
  organization_id: "org-demo",
  trucks_in_yard: 3,
  trucks_waiting: 1,
  trucks_discharging: 1,
  merchandise_stored: 800,
  merchandise_stored_weight_kg: 4030,
  merchandise_in_scanner: 30,
  merchandise_in_scale: 0,
  merchandise_in_quarantine: 50,
  merchandise_seized: 200,
  sectors_occupied: 2,
  sectors_free: 8,
}

const puede = (...permisos: PermissionCode[]) => {
  const set = new Set(permisos)
  return (code: PermissionCode) => set.has(code)
}

describe("KPI_CARDS registry", () => {
  it("exposes exactly the ten operational cards", () => {
    expect(KPI_CARDS).toHaveLength(10)
    expect(KPI_CARDS.map((c) => c.id)).toEqual([
      "trucks_in_yard",
      "trucks_waiting",
      "trucks_discharging",
      "merchandise_stored",
      "merchandise_in_scanner",
      "merchandise_in_scale",
      "merchandise_in_quarantine",
      "merchandise_seized",
      "sectors_occupied",
      "sectors_free",
    ])
  })

  it("formats values with the es-AR locale conventions", () => {
    const stored = KPI_CARDS.find((c) => c.id === "merchandise_stored")!
    expect(stored.format(METRICAS)).toEqual({ valor: "800", detalle: "4.030 kg" })

    const scanner = KPI_CARDS.find((c) => c.id === "merchandise_in_scanner")!
    expect(scanner.format(METRICAS).valor).toBe("30")

    const free = KPI_CARDS.find((c) => c.id === "sectors_free")!
    expect(free.format(METRICAS).valor).toBe("8")
    expect(free.format(METRICAS).detalle).toBe("de 10")
  })

  it("renders a secondary detail for weight-backed cards", () => {
    const stored = KPI_CARDS.find((c) => c.id === "merchandise_stored")!
    expect(stored.format(METRICAS).detalle).toMatch(/4\.030 kg/i)

    const quarantine = KPI_CARDS.find((c) => c.id === "merchandise_in_quarantine")!
    expect(quarantine.format(METRICAS).detalle).toBe("unidades")
  })
})

describe("kpisVisibles", () => {
  it("hides every card without the dashboard base read", () => {
    expect(kpisVisibles(puede("truck.read"))).toHaveLength(0)
    expect(kpisVisibles(puede())).toHaveLength(0)
  })

  it("shows only the modules the session can read", () => {
    const visibles = kpisVisibles(
      puede("warehouse.read", "truck.read", "cargo.read", "scanner.read", "quarantine.read", "seizure.read"),
    )
    expect(visibles.map((c) => c.id).sort()).toEqual([
      "merchandise_in_quarantine",
      "merchandise_in_scanner",
      "merchandise_seized",
      "merchandise_stored",
      "sectors_free",
      "sectors_occupied",
      "trucks_discharging",
      "trucks_in_yard",
      "trucks_waiting",
    ])
    // scale.read missing → scale card hidden
    expect(visibles.map((c) => c.id)).not.toContain("merchandise_in_scale")
  })

  it("a card gated by a module read is hidden when that module is not readable", () => {
    const sinTrucks = kpisVisibles(puede("warehouse.read", "cargo.read"))
    expect(sinTrucks.map((c) => c.id)).not.toContain("trucks_in_yard")
    expect(sinTrucks.map((c) => c.id)).toContain("merchandise_stored")
  })
})