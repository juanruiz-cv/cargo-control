import { describe, expect, it } from "vitest"

import {
  esReplayDuplicado,
  fallosDe,
  hayFallos,
  KINDS_CON_ITEMS,
  LOTES_CONGELADOS,
  MOTIVO_OBLIGATORIO,
  MOVEMENT_KIND_PERMISSION,
  validarMovimiento,
  type EngineCandidate,
  type EngineCandidateItem,
  type ValidationContext,
} from "@/lib/movement-guards"
import type { CargoItemRow, ItemLotRow, LocationRow, MovementRow } from "@/types"

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ORG = "org-1"
const FAC = "fac-1"

function lot(overrides: Partial<ItemLotRow> = {}): ItemLotRow {
  return {
    id: "lot-1",
    organization_id: ORG,
    manifest_id: "man-1",
    cargo_item_id: "item-1",
    parent_lot_id: null,
    quantity: 100,
    uom: "kg",
    status: "in_warehouse",
    current_location_id: "loc-a",
    current_truck_id: null,
    unit_weight_kg: 1,
    unit_volume_m3: null,
    created_via_movement_id: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  }
}

function item(overrides: Partial<CargoItemRow> = {}): CargoItemRow {
  return {
    id: "item-1",
    organization_id: ORG,
    manifest_id: "man-1",
    line_number: 1,
    sku: null,
    description: "Caja",
    category: null,
    total_quantity: 100,
    uom: "kg",
    unit_weight_kg: 1,
    unit_volume_m3: null,
    status: "distributed",
    observations: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  }
}

function loc(overrides: Partial<LocationRow> = {}): LocationRow {
  return {
    id: "loc-a",
    organization_id: ORG,
    facility_id: FAC,
    parent_id: null,
    type: "bin",
    checkpoint_kind: null,
    code: "A-1",
    name: null,
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

function ctx(overrides: Partial<ValidationContext> = {}): ValidationContext {
  return {
    permisos: ["cargo.update", "cargo.transfer"],
    roles: ["operator"],
    lotes: new Map([["lot-1", lot()]]),
    lotesDelItem: new Map([["item-1", [lot()]]]),
    items: new Map([["item-1", item()]]),
    manifests: new Map(),
    locations: new Map([["loc-a", loc()]]),
    ocupacion: new Map(),
    movimientos: [],
    existentePorOperationKey: null,
    holdsAbiertos: { quarantine: new Map(), seizure: new Map() },
    ...overrides,
  }
}

function itemLote(it: Partial<EngineCandidateItem> = {}): EngineCandidateItem {
  return {
    itemLotId: "lot-1",
    cantidad: 10,
    origenLocationId: "loc-a",
    destinoLocationId: "loc-b",
    ...it,
  }
}

function candidato(overrides: Partial<EngineCandidate> = {}): EngineCandidate {
  return {
    kind: "transfer",
    manifestId: "man-1",
    facilityId: FAC,
    locationId: null,
    items: [itemLote()],
    ...overrides,
  }
}

function okCtx(): ValidationContext {
  return ctx({
    lotes: new Map([["lot-1", lot()]]),
    locations: new Map([
      ["loc-a", loc()],
      ["loc-b", loc({ id: "loc-b", code: "B-1", capacity_max_kg: 1000 })],
    ]),
    ocupacion: new Map([
      [
        "loc-b",
        {
          location_id: "loc-b",
          organization_id: ORG,
          facility_id: FAC,
          code: "B-1",
          occupancy_kg: 0,
          occupancy_m3: 0,
          occupancy_units: 0,
          missing_weight_lots: 0,
          missing_volume_lots: 0,
          capacity_max_kg: 1000,
          capacity_max_volume_m3: null,
          capacity_max_units: null,
          available_kg: 1000,
          available_m3: null,
          available_units: null,
          pct_kg: 0,
          pct_m3: null,
          pct_units: null,
        },
      ],
    ]),
  })
}

// ---------------------------------------------------------------------------
// Tablas del contrato
// ---------------------------------------------------------------------------

describe("contrato del motor (tablas)", () => {
  it("cubre las 15 kinds con su permiso (ADR 0007 transpose)", () => {
    expect(Object.keys(MOVEMENT_KIND_PERMISSION).sort()).toEqual([
      "arrival",
      "correction",
      "discharge",
      "egress",
      "load_out",
      "quarantine",
      "release",
      "return_to_truck",
      "scale",
      "scan_in",
      "scan_out",
      "seizure",
      "split",
      "store",
      "transfer",
    ])
  })

  it("release requiere quarantine.create O seizure.create", () => {
    const req = MOVEMENT_KIND_PERMISSION.release
    expect(Array.isArray(req)).toBe(true)
    expect(req).toEqual(["quarantine.create", "seizure.create"])
  })

  it("kinds sin items excluyen arrival/egress/correction", () => {
    expect(KINDS_CON_ITEMS.has("arrival")).toBe(false)
    expect(KINDS_CON_ITEMS.has("egress")).toBe(false)
    expect(KINDS_CON_ITEMS.has("correction")).toBe(false)
    expect(KINDS_CON_ITEMS.has("discharge")).toBe(true)
  })

  it("motivo obligatorio: quarantine/seizure/release/egress/correction", () => {
    expect([...MOTIVO_OBLIGATORIO].sort()).toEqual(["correction", "egress", "quarantine", "release", "seizure"])
  })

  it("lotes congelados: in_quarantine y seized", () => {
    expect([...LOTES_CONGELADOS].sort()).toEqual(["in_quarantine", "seized"])
  })
})

// ---------------------------------------------------------------------------
// I1 — permiso + supervisor gate
// ---------------------------------------------------------------------------

describe("I1 permiso + supervisor gate", () => {
  it("pasa con el permiso correcto", () => {
    const rs = validarMovimiento(candidato({ kind: "transfer" }), okCtx())
    expect(rs[0]).toMatchObject({ guard: "I1", ok: true })
  })

  it("falla sin el permiso del kind", () => {
    const rs = validarMovimiento(candidato(), ctx({ permisos: ["scale.create"] }))
    const i1 = rs.find((r) => r.guard === "I1")!
    expect(i1.ok).toBe(false)
    expect(i1.code).toBe("I1_PERMISO_DENEGADO")
    // I5 también falla por estado, pero I1 debe reportar su bloqueo real.
    expect(hayFallos(rs)).toBe(true)
  })

  it("release: cualquiera de los dos permisos desbloquea, pero exige supervisor", () => {
    const base: EngineCandidate = {
      kind: "release",
      manifestId: "man-1",
      motivo: "Liberación aprobada",
      items: [itemLote({ cantidad: 100, destinoLocationId: "loc-a" })],
    }
    // operador con permiso quarantine: falla gate de supervisor
    const op = validarMovimiento(
      base,
      ctx({
        permisos: ["quarantine.create"],
        roles: ["operator"],
        lotes: new Map([["lot-1", lot({ status: "in_quarantine" })]]),
        holdsAbiertos: { quarantine: new Map([["lot-1", {} as never]]), seizure: new Map() },
        locations: new Map([["loc-a", loc()]]),
      }),
    )
    expect(op.find((r) => r.guard === "I1")!.code).toBe("I1_RELEASE_SUPERVISOR_REQUERIDO")

    const sup = validarMovimiento(
      base,
      ctx({
        permisos: ["seizure.create"],
        roles: ["supervisor"],
        lotes: new Map([["lot-1", lot({ status: "in_quarantine" })]]),
        holdsAbiertos: { quarantine: new Map([["lot-1", {} as never]]), seizure: new Map() },
        locations: new Map([["loc-a", loc()]]),
      }),
    )
    expect(sup.find((r) => r.guard === "I1")!.ok).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// I2 — cantidades / suficiencia
// ---------------------------------------------------------------------------

describe("I2 cantidades", () => {
  it("rechaza la ausencia de lote (I2_LOTES_REQUERIDOS)", () => {
    const rs = validarMovimiento(candidato({ items: [] }), okCtx())
    expect(rs.find((r) => r.guard === "I2")!.code).toBe("I2_LOTES_REQUERIDOS")
  })

  it("rechaza cantidad <= 0 o no finita", () => {
    const rs = validarMovimiento(candidato({ items: [itemLote({ cantidad: 0 })] }), okCtx())
    expect(rs.find((r) => r.guard === "I2")!.code).toBe("I2_CANTIDAD_INVALIDA")
    const nan = validarMovimiento(candidato({ items: [itemLote({ cantidad: Number.NaN })] }), okCtx())
    expect(nan.find((r) => r.guard === "I2")!.code).toBe("I2_CANTIDAD_INVALIDA")
  })

  it("split debe dejar remanente (cantidad < lote)", () => {
    const rs = validarMovimiento(candidato({ kind: "split", items: [itemLote({ cantidad: 100 })] }), okCtx())
    expect(rs.find((r) => r.guard === "I2")!.code).toBe("I2_SPLIT_SIN_REMANENTE")
    const okSplit = validarMovimiento(candidato({ kind: "split", items: [itemLote({ cantidad: 99 })] }), okCtx())
    expect(okSplit.find((r) => r.guard === "I2")!.ok).toBe(true)
  })

  it("transfer no puede exceder el lote", () => {
    const rs = validarMovimiento(candidato({ items: [itemLote({ cantidad: 101 })] }), okCtx())
    expect(rs.find((r) => r.guard === "I2")!.code).toBe("I2_CANTIDAD_EXCEDE_LOTE")
  })

  it("discharge opera lote completo (no parcial)", () => {
    const rs = validarMovimiento(
      candidato({
        kind: "discharge",
        items: [itemLote({ cantidad: 50, destinoLocationId: null })],
      }),
      okCtx(),
    )
    expect(rs.find((r) => r.guard === "I2")!.code).toBe("I2_MOVIMIENTO_LOTE_COMPLETO")
  })
})

// ---------------------------------------------------------------------------
// I3 — capacidad destino proyectada (ADR 0006)
// ---------------------------------------------------------------------------

describe("I3 capacidad destino", () => {
  it("pasa cuando la proyección respeta la capacidad (igualdad permitida)", () => {
    const rs = validarMovimiento(
      candidato({ items: [itemLote({ cantidad: 990, destinoLocationId: "loc-b" })] }),
      okCtx(),
    )
    const i3 = rs.find((r) => r.guard === "I3")!
    expect(i3.ok).toBe(true)
  })

  it("rechaza kg proyectado > capacidad", () => {
    const rs = validarMovimiento(
      candidato({ items: [itemLote({ cantidad: 1001, destinoLocationId: "loc-b" })] }),
      okCtx(),
    )
    expect(rs.find((r) => r.guard === "I3")!.code).toBe("I3_CAPACIDAD_KG_EXCEDIDA")
  })

  it("excluye la contribución vieja del lote cuando ya está en el mismo destino", () => {
    // Lote de 100 kg ya en loc-b; mueve 10 kg dentro de loc-b → proyección = 100 (sin cambio)
    const rs = validarMovimiento(
      candidato({
        kind: "store",
        items: [itemLote({ cantidad: 10, origenLocationId: null, destinoLocationId: "loc-b" })],
      }),
      ctx({
        lotes: new Map([["lot-1", lot({ current_location_id: "loc-b", quantity: 100 } as ItemLotRow)]]),
        locations: new Map([
          ["loc-a", loc()],
          ["loc-b", loc({ id: "loc-b", code: "B-1", capacity_max_kg: 150 })],
        ]),
        ocupacion: new Map([
          [
            "loc-b",
            {
              location_id: "loc-b",
              organization_id: ORG,
              facility_id: FAC,
              code: "B-1",
              occupancy_kg: 100,
              occupancy_m3: 0,
              occupancy_units: 0,
              missing_weight_lots: 0,
              missing_volume_lots: 0,
              capacity_max_kg: 150,
              capacity_max_volume_m3: null,
              capacity_max_units: null,
              available_kg: 50,
              available_m3: null,
              available_units: null,
              pct_kg: 67,
              pct_m3: null,
              pct_units: null,
            },
          ],
        ]),
      }),
    )
    const i3 = rs.find((r) => r.guard === "I3")!
    expect(i3.ok).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// I5 — estado de lote / ubicación
// ---------------------------------------------------------------------------

describe("I5 estado lote/ubicación", () => {
  it("lote inexistente falla I5", () => {
    const rs = validarMovimiento(candidato(), ctx({ lotes: new Map() }))
    expect(rs.find((r) => r.guard === "I5")!.code).toBe("I5_LOTE_INEXISTENTE")
  })

  it("lote congelado rechaza movimientos normales (ME-20/21)", () => {
    const rs = validarMovimiento(
      candidato(),
      ctx({
        lotes: new Map([["lot-1", lot({ status: "in_quarantine" })]]),
        locations: new Map([
          ["loc-a", loc()],
          ["loc-b", loc({ id: "loc-b", code: "B-1" })],
        ]),
      }),
    )
    expect(rs.find((r) => r.guard === "I5")!.code).toBe("I5_LOTE_CONGELADO")
  })

  it("discharge exige on_truck", () => {
    const rs = validarMovimiento(
      candidato({ kind: "discharge", items: [itemLote({ destinoLocationId: null })] }),
      okCtx(),
    )
    expect(rs.find((r) => r.guard === "I5")!.code).toBe("I5_LOTE_NO_EN_CAMION")
  })

  it("release sin caso abierto falla con I5_SIN_CASO_ABIERTO", () => {
    const rs = validarMovimiento(
      candidato({
        kind: "release",
        manifestId: "man-1",
        motivo: "ok",
        items: [itemLote({ cantidad: 100, destinoLocationId: "loc-a" })],
      }),
      ctx({
        permisos: ["quarantine.create"],
        roles: ["supervisor"],
        lotes: new Map([["lot-1", lot({ status: "in_quarantine" })]]),
        locations: new Map([["loc-a", loc()]]),
      }),
    )
    expect(rs.find((r) => r.guard === "I5")!.code).toBe("I5_SIN_CASO_ABIERTO")
  })

  it("quarantine exige destino allows_hold", () => {
    const rs = validarMovimiento(
      candidato({
        kind: "quarantine",
        manifestId: "man-1",
        motivo: "Control",
        items: [itemLote({ cantidad: 100, destinoLocationId: "loc-b" })],
      }),
      ctx({
        permisos: ["quarantine.create"],
        lotes: new Map([["lot-1", lot({ status: "discharged" })]]),
        locations: new Map([
          ["loc-a", loc()],
          ["loc-b", loc({ id: "loc-b", code: "B-1", allows_hold: false })],
        ]),
      }),
    )
    expect(rs.find((r) => r.guard === "I5")!.code).toBe("I5_DESTINO_SIN_HOLD")
  })

  it("destino inactivo falla ME-22", () => {
    const rs = validarMovimiento(
      candidato({ items: [itemLote({ destinoLocationId: "loc-b" })] }),
      ctx({
        lotes: new Map([["lot-1", lot()]]),
        locations: new Map([
          ["loc-a", loc()],
          ["loc-b", loc({ id: "loc-b", code: "B-1", active: false })],
        ]),
      }),
    )
    expect(rs.find((r) => r.guard === "I5")!.code).toBe("I5_DESTINO_INACTIVO")
  })
})

// ---------------------------------------------------------------------------
// I6 — secuencia / flujo
// ---------------------------------------------------------------------------

describe("I6 secuencia / flujo", () => {
  it("quarantine sin motivo falla (sensibles, §8)", () => {
    const rs = validarMovimiento(
      candidato({ kind: "quarantine", motivo: "", items: [itemLote()] }),
      ctx({ permisos: ["quarantine.create"] }),
    )
    expect(rs.find((r) => r.guard === "I6")!.code).toBe("I6_MOTIVO_REQUERIDO")
  })

  it("arrival: manifiesto inexistente", () => {
    const rs = validarMovimiento(candidato({ kind: "arrival", items: undefined }), ctx())
    expect(rs.find((r) => r.guard === "I6")!.code).toBe("I6_MANIFIESTO_INEXISTENTE")
  })

  it("arrival: ingreso duplicado", () => {
    const movimientos: MovementRow[] = [
      { id: 1, organization_id: ORG, facility_id: FAC, kind: "arrival", manifest_id: "man-1", operator_id: null, location_id: null, occurred_at: "2026-01-01T00:00:00Z", created_at: "2026-01-01T00:00:00Z", reason: null, previous_movement_id: null, operation_key: null, payload: null },
    ]
    const rs = validarMovimiento(
      candidato({ kind: "arrival", items: undefined }),
      ctx({
        manifests: new Map([["man-1", { id: "man-1", organization_id: ORG, facility_id: FAC, code: "M-1", truck_id: null, driver_id: null, transport_company_id: null, shipper_party_id: null, client_party_id: null, origin: null, destination: null, expected_weight_kg: null, arrival_date: null, departure_date: null, status: "in_playon", notes: null, created_by: null, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" }]]),
        movimientos,
      }),
    )
    expect(rs.find((r) => r.guard === "I6")!.code).toBe("I6_INGRESO_DUPLICADO")
  })

  it("egress: requiere ingreso previo (I6_SIN_INGRESO)", () => {
    const rs = validarMovimiento(
      candidato({
        kind: "egress",
        manifestId: "man-1",
        motivo: "Salida",
        items: undefined,
      }),
      ctx({
        manifests: new Map([["man-1", { id: "man-1", organization_id: ORG, facility_id: FAC, code: "M-1", truck_id: null, driver_id: null, transport_company_id: null, shipper_party_id: null, client_party_id: null, origin: null, destination: null, expected_weight_kg: null, arrival_date: null, departure_date: null, status: "in_playon", notes: null, created_by: null, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" }]]),
      }),
    )
    expect(rs.find((r) => r.guard === "I6")!.code).toBe("I6_SIN_INGRESO")
  })

  it("correction requiere previous_movement_id y no lleva items", () => {
    const sinOrigen = validarMovimiento(candidato({ kind: "correction", items: [], previousMovementId: null, motivo: "Error" }), ctx())
    expect(sinOrigen.find((r) => r.guard === "I6")!.code).toBe("I6_CORRECCION_SIN_ORIGEN")

    const conItems = validarMovimiento(
      candidato({ kind: "correction", items: [itemLote()], previousMovementId: 9, motivo: "Error" }),
      ctx({ movimientos: [{ id: 9, organization_id: ORG, facility_id: FAC, kind: "store", manifest_id: null, operator_id: null, location_id: null, occurred_at: "2026-01-01T00:00:00Z", created_at: "2026-01-01T00:00:00Z", reason: null, previous_movement_id: null, operation_key: null, payload: null }] }),
    )
    expect(conItems.find((r) => r.guard === "I6")!.code).toBe("I6_CORRECCION_SIN_LOTES")
  })

  it("scan_in exige lote en checkpoint de tipo scan", () => {
    const rs = validarMovimiento(
      candidato({
        kind: "scan_in",
        items: [itemLote({ cantidad: 100, destinoLocationId: null, origenLocationId: null })],
      }),
      ctx({
        permisos: ["scanner.create"],
        lotes: new Map([["lot-1", lot({ status: "checked", current_location_id: "sc-1" })]]),
        locations: new Map([["sc-1", loc({ id: "sc-1", code: "SC-1", type: "checkpoint", checkpoint_kind: "scan" })]]),
      }),
    )
    expect(rs.find((r) => r.guard === "I6")!.ok).toBe(true)

    const wrongKind = validarMovimiento(
      candidato({
        kind: "scale",
        items: [itemLote({ cantidad: 100, destinoLocationId: null, origenLocationId: null })],
      }),
      ctx({
        permisos: ["scale.create"],
        lotes: new Map([["lot-1", lot({ status: "checked", current_location_id: "sc-1" })]]),
        locations: new Map([["sc-1", loc({ id: "sc-1", code: "SC-1", type: "checkpoint", checkpoint_kind: "scan" })]]),
      }),
    )
    expect(wrongKind.find((r) => r.guard === "I6")!.code).toBe("I6_CHECKPOINT_INCORRECTO")
  })
})

// ---------------------------------------------------------------------------
// I7 — idempotencia
// ---------------------------------------------------------------------------

describe("I7 idempotencia", () => {
  it("operation_key vacío es error", () => {
    const rs = validarMovimiento(candidato({ operationKey: "  " }), okCtx())
    expect(rs.find((r) => r.guard === "I7")!.code).toBe("I7_CLAVE_VACIA")
  })

  it("replay duplicado se detecta y helper lo aísla", () => {
    const existente: MovementRow = {
      id: 42,
      organization_id: ORG,
      facility_id: FAC,
      kind: "transfer",
      manifest_id: null,
      operator_id: null,
      location_id: null,
      occurred_at: "2026-01-01T00:00:00Z",
      created_at: "2026-01-01T00:00:00Z",
      reason: null,
      previous_movement_id: null,
      operation_key: "op-1",
      payload: null,
    }
    const rs = validarMovimiento(
      candidato({ operationKey: "op-1" }),
      ctx({ existentePorOperationKey: existente }),
    )
    const i7 = rs.find((r) => r.guard === "I7")!
    expect(i7.code).toBe("I7_DUPLICADO")
    expect(esReplayDuplicado(rs)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Helpers de orquestación
// ---------------------------------------------------------------------------

describe("helpers", () => {
  it("hayFallos es true si alguna guardia falla", () => {
    const rs = validarMovimiento(candidato({ items: [] }), okCtx())
    expect(hayFallos(rs)).toBe(true)
    expect(fallosDe(rs).every((v) => !v.ok)).toBe(true)
  })
})