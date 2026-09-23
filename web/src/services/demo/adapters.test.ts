import { describe, expect, it } from "vitest"

import { createDemoServices } from "@/services/demo/adapters"
import { MovementEngineError } from "@/services/movementService"
import type { DemoServices } from "@/services/demo/adapters"
import type { MovementKind } from "@/types"

/**
 * Integration tests for the in-memory demo adapters (services/demo/adapters.ts).
 *
 * These cover the adapter layer itself — RBAC enforcement (requirePermission /
 * requireMovementKind), ME-07 operation-key idempotency, per-kind mutations
 * (discharge/split/transfer/egress), and the egress-guard for frozen lots —
 * on top of the pure guard suites (movement-guards.test.ts). The seed state
 * (seed.ts) is the fixture: manifest-1 has lot-1-1 on_truck, lot-1-2 in
 * quarantine at loc-rezago, lot-1-4/5 in warehouse; manifest-2 has lot-2-1
 * seized.
 */

function fresh(role: "admin" | "viewer" = "admin"): DemoServices {
  return createDemoServices({ role })
}

/** Runs a movement via the engine surface and returns the created row. */
async function execute(
  svc: DemoServices,
  input: {
    kind: MovementKind
    manifestId?: string | null
    locationId?: string | null
    operationKey?: string | null
    motivo?: string | null
    items?: Array<{
      itemLotId: string
      cantidad: number
      origenLocationId?: string | null
      destinoLocationId?: string | null
      origenTruckId?: string | null
      destinoTruckId?: string | null
    }>
  },
) {
  const resultado = await svc.movements.ejecutarMovimiento({
    kind: input.kind,
    manifestId: input.manifestId ?? null,
    locationId: input.locationId ?? null,
    operationKey: input.operationKey ?? null,
    motivo: input.motivo ?? null,
    items: input.items,
  })
  return resultado
}

describe("demo movement engine — RBAC", () => {
  it("rejects a transfer for a role without cargo.transfer (viewer)", async () => {
    const svc = fresh("viewer")
    await expect(
      execute(svc, {
        kind: "transfer",
        manifestId: "manifest-1",
        locationId: "loc-galpon",
        items: [{ itemLotId: "lot-1-1", cantidad: 10, destinoLocationId: "loc-galpon" }],
      }),
    ).rejects.toSatisfy((e: unknown) => e instanceof MovementEngineError)
  })

  it("exposes movimientoPermitido per role", async () => {
    const admin = fresh()
    expect(await admin.movements.movimientoPermitido("egress")).toBe(true)
    const viewer = fresh("viewer")
    expect(await viewer.movements.movimientoPermitido("egress")).toBe(false)
    expect(await viewer.movements.movimientoPermitido("discharge")).toBe(false)
  })
})

describe("demo movement engine — ME-07 idempotency", () => {
  it("replays the same operation_key without creating a second movement", async () => {
    const svc = fresh()
    const opKey = "test-replay:0001"

    const first = await execute(svc, {
      kind: "discharge",
      manifestId: "manifest-1",
      locationId: "loc-playon",
      operationKey: opKey,
      items: [
        {
          itemLotId: "lot-1-1",
          cantidad: 100,
          origenTruckId: "truck-2",
          destinoLocationId: "loc-playon",
        },
      ],
    })
    expect(first.duplicado).toBe(false)
    expect(first.movimiento.kind).toBe("discharge")

    const replay = await execute(svc, {
      kind: "discharge",
      manifestId: "manifest-1",
      locationId: "loc-playon",
      operationKey: opKey,
      items: [
        {
          itemLotId: "lot-1-1",
          cantidad: 100,
          origenTruckId: "truck-2",
          destinoLocationId: "loc-playon",
        },
      ],
    })
    expect(replay.duplicado).toBe(true)
    expect(replay.movimiento.id).toBe(first.movimiento.id)

    const rows = await svc.movements.listarMovimientos({ kind: "discharge" })
    const conKey = rows.filter((m) => m.operation_key === opKey)
    expect(conKey).toHaveLength(1)
  })
})

describe("demo movement engine — discharge mutation", () => {
  it("moves lot-1-1 off the truck and rolls the manifest to discharged", async () => {
    const svc = fresh()
    const { movimiento } = await execute(svc, {
      kind: "discharge",
      manifestId: "manifest-1",
      locationId: "loc-playon",
      motivo: "test descarga",
      items: [
        {
          itemLotId: "lot-1-1",
          cantidad: 100,
          origenTruckId: "truck-2",
          destinoLocationId: "loc-playon",
        },
      ],
    })

    expect(movimiento.kind).toBe("discharge")
    const lot = (await svc.cargo.obtenerManifest("manifest-1"))?.items
      .flatMap((x) => x.lots)
      .find((l) => l.id === "lot-1-1")
    expect(lot?.status).toBe("discharged")
    expect(lot?.current_location_id).toBe("loc-playon")
    expect(lot?.current_truck_id).toBeNull()
  })
})

describe("demo split (full in-memory, deferred-Σ is a DB concern)", () => {
  it("reduces the parent and creates a child lot with parent_lot_id", async () => {
    const svc = fresh()
    const antes = await svc.cargo.obtenerManifest("manifest-1")
    const sector = antes?.items
      .flatMap((x) => x.lots)
      .find((l) => l.id === "lot-1-5")

    const movimiento = await svc.cargo.splitItem({
      itemLotId: "lot-1-5",
      cantidad: 120,
      destinoLocationId: "loc-sector-02",
      motivo: "split de test",
    })
    expect(movimiento.kind).toBe("split")

    const despues = await svc.cargo.obtenerManifest("manifest-1")
    const lots = despues?.items.flatMap((x) => x.lots) ?? []
    const parent = lots.find((l) => l.id === "lot-1-5")
    const child = lots.find((l) => l.parent_lot_id === "lot-1-5")

    expect(parent?.quantity).toBe((sector?.quantity ?? 300) - 120)
    expect(child).toBeDefined()
    expect(child?.quantity).toBe(120)
    expect(child?.status).toBe(parent?.status)
    expect(child?.created_via_movement_id).toBe(movimiento.id)
  })

  it("refuses a split of the full quantity or of a frozen lot", async () => {
    const svc = fresh()
    await expect(
      svc.cargo.splitItem({ itemLotId: "lot-1-5", cantidad: 300 }),
    ).rejects.toThrow(/debe ser menor/)
    await expect(
      svc.cargo.splitItem({ itemLotId: "lot-1-2", cantidad: 10 }), // in_quarantine
    ).rejects.toThrow(/retenido/)
  })
})

describe("demo transfer", () => {
  it("moves a lot between zones", async () => {
    const svc = fresh()
    // Seed: lot-1-1 is on_truck (truck-2, no location). Discharge to
    // loc-playon first, then transfer to loc-galpon.
    await execute(svc, {
      kind: "discharge",
      manifestId: "manifest-1",
      locationId: "loc-playon",
      items: [
        {
          itemLotId: "lot-1-1",
          cantidad: 100,
          origenTruckId: "truck-2",
          destinoLocationId: "loc-playon",
        },
      ],
    })
    const antes = await svc.cargo.obtenerManifest("manifest-1")
    const lot1 = antes?.items.flatMap((x) => x.lots).find((l) => l.id === "lot-1-1")
    expect(lot1?.current_location_id).toBe("loc-playon")

    const opKey = "test-transfer:0001"
    await execute(svc, {
      kind: "transfer",
      manifestId: "manifest-1",
      operationKey: opKey,
      items: [
        {
          itemLotId: "lot-1-1",
          cantidad: 100,
          origenLocationId: "loc-playon",
          destinoLocationId: "loc-galpon",
        },
      ],
    })

    const despues = await svc.cargo.obtenerManifest("manifest-1")
    const lot = despues?.items.flatMap((x) => x.lots).find((l) => l.id === "lot-1-1")
    expect(lot?.current_location_id).toBe("loc-galpon")
  })
})

describe("demo egress guard (AC-E2-2)", () => {
  it("blocks egress while the manifest has frozen lots (quarantine/seizure)", async () => {
    const svc = fresh()
    await expect(svc.trucks.registrarSalida("manifest-1")).rejects.toThrow(/retenidos/)
    await expect(svc.trucks.registrarSalida("manifest-2")).rejects.toThrow(/retenidos/)
  })

  it("egresses a clean manifest with an on-truck acknowledgement payload and stays open", async () => {
    const svc = fresh()
    const manifest = await svc.cargo.crearManifest({
      facility_id: "fac-demo",
      code: "MANIF-TEST-EGRESS",
      truck_id: "truck-1",
      transport_company_id: "company-1",
      client_party_id: "party-client-1",
      origin: "Test",
      destination: "Test",
      expected_weight_kg: 100,
    })
    await svc.cargo.crearItem(manifest.id, {
      line_number: 1,
      description: "Carga de egress test",
      total_quantity: 10,
      uom: "unit",
      unit_weight_kg: 1,
    })
    await svc.trucks.registrarEntrada(manifest.id)

    const salida = await svc.trucks.registrarSalida(manifest.id)
    expect(salida.kind).toBe("egress")
    expect(salida.payload).toEqual({ acknowledged_on_truck_lots: expect.any(Array) })

    const despues = await svc.cargo.obtenerManifest(manifest.id)
    // On-truck balance acknowledged: manifest ROLLUP stays open for the remnant
    // (flows.md Egress provisional mirror).
    expect(despues?.manifest.status).not.toBe("closed")

    await expect(svc.trucks.registrarSalida(manifest.id)).rejects.toThrow(/ya egresó/)
  })

  it("egress requires a prior arrival", async () => {
    const svc = fresh()
    const manifest = await svc.cargo.crearManifest({
      facility_id: "fac-demo",
      code: "MANIF-TEST-NOARRIVAL",
      origin: "Test",
      destination: "Test",
    })
    await expect(svc.trucks.registrarSalida(manifest.id)).rejects.toThrow(/no registró ingreso/)
  })
})

describe("demo audit trail", () => {
  it("appends audit rows for engine mutations with canonical catalog codes", async () => {
    const svc = fresh()
    await execute(svc, {
      kind: "discharge",
      manifestId: "manifest-1",
      locationId: "loc-playon",
      motivo: "audit test",
      items: [
        {
          itemLotId: "lot-1-1",
          cantidad: 100,
          origenTruckId: "truck-2",
          destinoLocationId: "loc-playon",
        },
      ],
    })

    const audit = await svc.audit.listarAudit({})
    const dischargeLogs = audit.filas.filter((r) => r.action === "movement.discharge")
    expect(dischargeLogs.length).toBeGreaterThan(0)
    expect(dischargeLogs[0].entity_type).toBe("item_lot")
    expect(dischargeLogs[0].before).toMatchObject({ status: "on_truck" })
    expect(dischargeLogs[0].after).toMatchObject({ status: "discharged" })
  })
})