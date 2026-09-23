import { describe, expect, it } from "vitest"

import { capacidadReadable, derivarEstadoOperativo, ESTADO_OPERATIVO } from "@/components/map/shared/estadoOperativo"
import type { LayoutElementRow, LocationRow, LocationOccupancyRow } from "@/types"

function elementoPorTipo(tipo: LayoutElementRow["element_type"], locationId: string | null): LayoutElementRow {
  return {
    id: "el-1",
    layout_id: "l1",
    location_id: locationId,
    element_type: tipo,
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
  }
}

function ubicacion(overrides: Partial<LocationRow> = {}): LocationRow {
  return {
    id: "loc-1",
    organization_id: "org-1",
    facility_id: "fac-1",
    parent_id: null,
    type: "bin",
    checkpoint_kind: null,
    code: "SECTOR-A",
    name: "Sector A",
    physical_width: null,
    physical_height: null,
    physical_depth: null,
    physical_unit: "m",
    capacity_max_units: null,
    capacity_max_kg: null,
    capacity_max_volume_m3: null,
    allows_hold: false,
    requires_authorization: false,
    notes: null,
    active: true,
    maintenance: false,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  }
}

function ocupacion(overrides: Partial<LocationOccupancyRow> = {}): LocationOccupancyRow {
  return {
    location_id: "loc-1",
    organization_id: "org-1",
    facility_id: "fac-1",
    code: "SECTOR-A",
    occupancy_kg: 0,
    occupancy_m3: 0,
    occupancy_units: 0,
    missing_weight_lots: 0,
    missing_volume_lots: 0,
    capacity_max_kg: null,
    capacity_max_volume_m3: null,
    capacity_max_units: null,
    available_kg: null,
    available_m3: null,
    available_units: null,
    pct_kg: null,
    pct_m3: null,
    pct_units: null,
    ...overrides,
  }
}

describe("derivarEstadoOperativo", () => {
  it("non-place elements are always LIBRE", () => {
    expect(derivarEstadoOperativo({ elemento: elementoPorTipo("corridor", null), ubicacion: null, ocupacion: null })).toBe(
      ESTADO_OPERATIVO.LIBRE,
    )
  })

  it("maintenance wins over occupancy", () => {
    const res = derivarEstadoOperativo({
      elemento: elementoPorTipo("storage", "loc-1"),
      ubicacion: ubicacion({ maintenance: true }),
      ocupacion: ocupacion({ pct_kg: 120 }),
    })
    expect(res).toBe(ESTADO_OPERATIVO.MANTENIMIENTO)
  })

  it("open hold beats full capacity", () => {
    const holds = new Set(["loc-1"])
    const res = derivarEstadoOperativo(
      {
        elemento: elementoPorTipo("storage", "loc-1"),
        ubicacion: ubicacion(),
        ocupacion: ocupacion({ pct_kg: 150 }),
      },
      holds,
    )
    expect(res).toBe(ESTADO_OPERATIVO.BLOQUEADO)
  })

  it("any dimension >= 100 is OCUPADO", () => {
    const res = derivarEstadoOperativo({
      elemento: elementoPorTipo("storage", "loc-1"),
      ubicacion: ubicacion(),
      ocupacion: ocupacion({ pct_units: 100, pct_kg: null }),
    })
    expect(res).toBe(ESTADO_OPERATIVO.OCUPADO)
  })

  it("partial (0 < pct < 100) is PARCIAL", () => {
    const res = derivarEstadoOperativo({
      elemento: elementoPorTipo("storage", "loc-1"),
      ubicacion: ubicacion(),
      ocupacion: ocupacion({ pct_kg: 40 }),
    })
    expect(res).toBe(ESTADO_OPERATIVO.PARCIAL)
  })

  it("null capacity means ∞: can never be OCUPADO", () => {
    const res = derivarEstadoOperativo({
      elemento: elementoPorTipo("storage", "loc-1"),
      ubicacion: ubicacion(),
      ocupacion: ocupacion(),
    })
    expect(res).toBe(ESTADO_OPERATIVO.LIBRE)
  })
})

describe("capacidadReadable", () => {
  it("renders '—' without occupancy", () => {
    expect(capacidadReadable(null)).toBe("—")
  })

  it("joins non-null percentages", () => {
    expect(capacidadReadable(ocupacion({ pct_units: 10, pct_kg: 80 }))).toBe("10% unidades · 80% kg")
  })

  it("reports unlimited capacity explicitly", () => {
    expect(capacidadReadable(ocupacion())).toBe("∞ capacidad")
  })
})