import { describe, expect, it } from "vitest"

import { createDemoServices } from "@/services/demo/adapters"
import { DEMO_EMAIL, DEMO_PASSWORD } from "@/services/demo/seed"

/**
 * Auth + holds integration over the demo adapters.
 *
 * Seed: manifest-1 has lot-1-2 in_quarantine (open op, loc-rezago),
 * manifest-2 has lot-2-1 seized (open op, loc-secuestro).
 */

describe("demo auth", () => {
  it("logs in as the demo user with the configured role and permissions", async () => {
    const svc = createDemoServices({ role: "admin" })
    const login = await svc.auth.iniciarSesion(DEMO_EMAIL, DEMO_PASSWORD)

    expect(login.sesion.accessToken).toBeTruthy()
    expect(login.perfil?.email).toBe(DEMO_EMAIL)
    expect(await svc.auth.rolesActuales()).toEqual(["admin"])
    const permisos = await svc.auth.permisosActuales()
    expect(permisos).toContain("cargo.transfer")
    expect(permisos).toContain("truck.exit")
  })

  it("rejects bad credentials and keeps the session closed", async () => {
    const svc = createDemoServices()
    await expect(svc.auth.iniciarSesion(DEMO_EMAIL, "wrong-password")).rejects.toThrow(/credenciales/)
    expect(await svc.auth.sesionActual()).toMatchObject({ accessToken: null, userId: null })
    expect(await svc.auth.permisosActuales()).toEqual([])
  })

  it("signs out and clears permissions", async () => {
    const svc = createDemoServices({ role: "admin" })
    await svc.auth.iniciarSesion(DEMO_EMAIL, DEMO_PASSWORD)
    await svc.auth.cerrarSesion()
    expect(await svc.auth.sesionActual()).toMatchObject({ accessToken: null })
    expect(await svc.auth.permisosActuales()).toEqual([])
  })

  it("operator account (non-demo email) is pinned to the operator role", async () => {
    const svc = createDemoServices({ role: "admin" })
    // The adapter pins ANY non-demo email to 'operator' regardless of
    // options.role (adapters.ts iniciarSesion).
    await svc.auth.iniciarSesion("operador@cargocontrol.local", DEMO_PASSWORD)
    expect(await svc.auth.rolesActuales()).toEqual(["operator"])
    // operator lacks quarantine.create → release kind is not permitted
    expect(await svc.movements.movimientoPermitido("release")).toBe(false)
  })
})

describe("demo holds", () => {
  it("lists seed open quarantine + seizure operations", async () => {
    const svc = createDemoServices()
    const abiertos = await svc.holds.obtenerAbiertos()

    expect(abiertos.some((h) => h.hold_type === "quarantine" && h.item_lot_id === "lot-1-2")).toBe(true)
    expect(abiertos.some((h) => h.hold_type === "seizure" && h.item_lot_id === "lot-2-1")).toBe(true)
  })

  it("resolving a quarantine hold closes the operation", async () => {
    const svc = createDemoServices({ role: "admin" })
    const ops = await svc.holds.quarantine.listar({})
    const q = ops.find((o) => o.item_lot_id === "lot-1-2" && o.status === "open")
    expect(q).toBeDefined()

    const resuelta = await svc.holds.quarantine.resolver(q!.id, {
      resolutionNote: "verificado",
      resolvedBy: "user-demo",
    })
    expect(resuelta.status).toBe("resolved")
    expect(resuelta.resolution_note).toBe("verificado")
  })

  it("engine release resolves the open case, flips the lot and closes operations", async () => {
    const svc = createDemoServices({ role: "admin" })
    const resultado = await svc.movements.ejecutarMovimiento({
      kind: "release",
      manifestId: "manifest-1",
      locationId: "loc-rezago",
      motivo: "release directo",
      items: [{ itemLotId: "lot-1-2", cantidad: 50, origenLocationId: "loc-rezago" }],
    })
    expect(resultado.duplicado).toBe(false)

    const despues = await svc.cargo.obtenerManifest("manifest-1")
    const lot = despues?.items.flatMap((x) => x.lots).find((l) => l.id === "lot-1-2")
    expect(lot?.status).toBe("released")

    const abiertos = await svc.holds.obtenerAbiertos("quarantine")
    expect(abiertos.some((h) => h.item_lot_id === "lot-1-2")).toBe(false)
  })
})