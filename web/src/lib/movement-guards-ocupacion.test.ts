import { describe, expect, it } from "vitest"

import { computarOcupaciones } from "@/lib/movement-guards"
import type { CargoItemRow, ItemLotRow, LocationRow } from "@/types"

function location(id: string, code: string, caps: { units?: number | null; kg?: number | null; m3?: number | null } = {}): LocationRow {
  return {
    id,
    organization_id: "org-1",
    facility_id: "fac-1",
    parent_id: null,
    type: "bin",
    checkpoint_kind: null,
    code,
    name: null,
    physical_width: null,
    physical_height: null,
    physical_depth: null,
    physical_unit: "m",
    capacity_max_units: caps.units ?? null,
    capacity_max_kg: caps.kg ?? null,
    capacity_max_volume_m3: caps.m3 ?? null,
    allows_hold: false,
    requires_authorization: false,
    notes: null,
    active: true,
    maintenance: false,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  }
}

function lot(id: string, quantity: number, uom: string, cargoItemId: string, locationId: string | null, weight?: number | null, volume?: number | null): ItemLotRow {
  return {
    id,
    organization_id: "org-1",
    manifest_id: "man-1",
    cargo_item_id: cargoItemId,
    parent_lot_id: null,
    quantity,
    uom,
    status: "in_warehouse",
    current_location_id: locationId,
    current_truck_id: null,
    unit_weight_kg: weight ?? null,
    unit_volume_m3: volume ?? null,
    created_via_movement_id: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  }
}

function item(id: string, total: number, uom: string, weight?: number | null, volume?: number | null): CargoItemRow {
  return {
    id,
    organization_id: "org-1",
    manifest_id: "man-1",
    line_number: 1,
    sku: null,
    description: "Item",
    category: null,
    total_quantity: total,
    uom,
    unit_weight_kg: weight ?? null,
    unit_volume_m3: volume ?? null,
    status: "distributed",
    observations: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  }
}

describe("computarOcupaciones — location_occupancy view semantics", () => {
  it("sums kg/m³ = qty × COALESCE(lot, item) and counts units only for uom='unit'", () => {
    const locA = location("loc-a", "A", { kg: 1000, units: 10 })
    const lots = [
      lot("l1", 3, "unit", "i1", "loc-a", 5), // 3 units × 5 kg = 15 kg
      lot("l2", 2, "kg", "i2", "loc-a", 7), // 2 × 7 = 14 kg, 0 units
    ]
    const items = [item("i1", 3, "unit", 5), item("i2", 2, "kg", 7)]
    const occ = computarOcupaciones([locA], lots, items).get("loc-a")!

    expect(occ.occupancy_kg).toBe(29)
    expect(occ.occupancy_m3).toBe(0)
    expect(occ.occupancy_units).toBe(3)
    expect(occ.missing_weight_lots).toBe(0)
    expect(occ.pct_kg).toBe(3) // Math.round(29/1000*100)
    expect(occ.pct_units).toBe(30)
  })

  it("lots on a truck never count against a location", () => {
    const locA = location("loc-a", "A", { kg: 1000 })
    const enCamion = { ...lot("l1", 4, "kg", "i1", null, 10), current_truck_id: "t1" }
    const occ = computarOcupaciones([locA], [enCamion], []).get("loc-a")!
    expect(occ.occupancy_kg).toBe(0)
  })

  it("holds DO count (they are placed lots)", () => {
    const locA = location("loc-a", "A", { kg: 1000 })
    const retenido = { ...lot("l1", 5, "kg", "i1", "loc-a", 2), status: "in_quarantine" as const }
    const occ = computarOcupaciones([locA], [retenido], []).get("loc-a")!
    expect(occ.occupancy_kg).toBe(10)
  })

  it("missing weight/volume is flagged, not zeroed", () => {
    const locA = location("loc-a", "A", { kg: 1000 })
    const sinPeso = lot("l1", 2, "kg", "i1", "loc-a", null)
    const occ = computarOcupaciones([locA], [sinPeso], []).get("loc-a")!
    expect(occ.occupancy_kg).toBe(0)
    expect(occ.missing_weight_lots).toBe(1)
  })

  it("lot-level unit overrides item-level fallback", () => {
    const locA = location("loc-a", "A")
    const conOverride = lot("l1", 2, "kg", "i1", "loc-a", 100) // lot weight wins
    const items = [item("i1", 2, "kg", 3)]
    const occ = computarOcupaciones([locA], [conOverride], items).get("loc-a")!
    expect(occ.occupancy_kg).toBe(200)
  })

  it("item-level weight is the fallback when the lot has none", () => {
    const locA = location("loc-a", "A")
    const sinOverride = lot("l1", 2, "kg", "i1", "loc-a", null)
    const items = [item("i1", 2, "kg", 3)]
    const occ = computarOcupaciones([locA], [sinOverride], items).get("loc-a")!
    expect(occ.occupancy_kg).toBe(6)
  })

  it("available = max(cap - used, 0); percent null when capacity null", () => {
    const sinCap = location("loc-b", "B")
    const conCap = location("loc-c", "C", { kg: 100 })
    const lots = [lot("l1", 10, "kg", "i1", "loc-c", 5)]
    const occs = computarOcupaciones([sinCap, conCap], lots, [])
    const b = occs.get("loc-b")!
    const c = occs.get("loc-c")!
    expect(b.pct_kg).toBeNull()
    expect(b.available_kg).toBeNull()
    expect(c.available_kg).toBe(50)
    expect(c.pct_kg).toBe(50)
  })

  it("over-capacity occupancy still mirrors the view (no clamp on used)", () => {
    const conCap = location("loc-d", "D", { kg: 10 })
    const lots = [lot("l1", 3, "kg", "i1", "loc-d", 5)]
    const occ = computarOcupaciones([conCap], lots, []).get("loc-d")!
    expect(occ.occupancy_kg).toBe(15)
    expect(occ.pct_kg).toBe(150)
    expect(occ.available_kg).toBe(0)
  })
})