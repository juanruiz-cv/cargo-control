import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi, beforeEach } from "vitest"

import { ScalePage } from "@/pages/ScalePage"
import { useAuth } from "@/integrations/auth/useAuth"
import { getServices } from "@/services"
import type { AuthContextValue } from "@/integrations/auth/auth-context"
import type { PermissionCode, RoleCode } from "@/types"

vi.mock("@/integrations/auth/useAuth", () => ({
  useAuth: vi.fn(),
}))

const mockedUseAuth = vi.mocked(useAuth)

function authContext(permissions: PermissionCode[] = ["scale.create", "scale.read"]): AuthContextValue {
  const set = new Set(permissions)
  return {
    user: { id: "user-demo", email: "demo@cargocontrol.local", name: "Demo" },
    roles: ["operator"] as RoleCode[],
    permissions,
    isLoading: false,
    isDemo: true,
    signIn: vi.fn().mockResolvedValue(undefined),
    signOut: vi.fn().mockResolvedValue(undefined),
    resetPassword: vi.fn().mockResolvedValue(undefined),
    actualizarPassword: vi.fn().mockResolvedValue(undefined),
    verificarToken: vi.fn().mockResolvedValue(undefined),
    hasPermission: (code: PermissionCode) => set.has(code),
    hasRole: (role: RoleCode) => role === "operator",
  }
}

/** Seed state has NO lot at the scale checkpoint: move lot-1-3 (discharged)
 * to loc-balanza so the pending scale queue has a row. */
async function sembrarColaBalanza() {
  await getServices().cargo.transferItem({
    itemLotId: "lot-1-3",
    destinoLocationId: "loc-balanza",
    operationKey: getServices().movements.generarOperationKey("transfer"),
  })
}

describe("ScalePage", () => {
  beforeEach(() => {
    mockedUseAuth.mockReturnValue(authContext())
  })

  it("shows the pending scale queue with the transferred lot after dispatch", async () => {
    await sembrarColaBalanza()
    render(<ScalePage />)
    await screen.findByText("Cola pendiente")

    expect((await screen.findAllByText("lot-1-3")).length).toBeGreaterThanOrEqual(1)
  })

  it("hides the register action without scale.create but still shows the queue", async () => {
    await sembrarColaBalanza()
    mockedUseAuth.mockReturnValue(authContext(["scale.read"]))
    render(<ScalePage />)

    expect((await screen.findAllByText("lot-1-3")).length).toBeGreaterThanOrEqual(1)
    expect(screen.queryByRole("button", { name: /Registrar pesaje/i })).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Pesar/i })).toBeDisabled()
  })

  it("registers a weigh within tolerance and persists the operation row", async () => {
    const user = userEvent.setup()
    await sembrarColaBalanza()
    render(<ScalePage />)
    await screen.findAllByText("lot-1-3")

    await user.click(screen.getByRole("button", { name: /Registrar pesaje/i }))
    const dialogo = await screen.findByRole("dialog", { name: /Registrar pesaje/i })

    // lot-1-3 unit weight 3.2 kg → 12 kg gross / 0.4 kg tare = 11.6 net,
    // expected 12 ± 0.5 → within tolerance
    await user.type(within(dialogo).getByLabelText("Bruto (kg)"), "12")
    await user.type(within(dialogo).getByLabelText("Tara (kg)"), "0.4")
    await user.type(within(dialogo).getByLabelText("Esperado (kg)"), "12")
    await user.type(within(dialogo).getByLabelText("Tolerancia (±kg)"), "0.5")

    await user.click(within(dialogo).getByRole("button", { name: "Registrar pesaje" }))

    // Dialog closes and the weigh row appears in recent operations
    await screen.findByText("Pesajes recientes")
    expect(await screen.findByText("Dentro de tolerancia")).toBeInTheDocument()
  })

  it("keeps the lot pending when the weigh is outside tolerance (SBF-08)", async () => {
    const user = userEvent.setup()
    await sembrarColaBalanza()
    render(<ScalePage />)
    await screen.findAllByText("lot-1-3")

    await user.click(screen.getByRole("button", { name: /Registrar pesaje/i }))
    const dialogo = await screen.findByRole("dialog", { name: /Registrar pesaje/i })

    // 15 kg gross - 0.4 tare = 14.6 net vs expected 12 ± 0.5 → outside tolerance
    await user.type(within(dialogo).getByLabelText("Bruto (kg)"), "15")
    await user.type(within(dialogo).getByLabelText("Tara (kg)"), "0.4")
    await user.type(within(dialogo).getByLabelText("Esperado (kg)"), "12")
    await user.type(within(dialogo).getByLabelText("Tolerancia (±kg)"), "0.5")

    await user.click(within(dialogo).getByRole("button", { name: "Registrar pesaje" }))

    await screen.findByText("Pesajes recientes")
    // Outside-tolerance weigh is recorded but the lot stays in queue
    // (lot appears in both queue row and recent ops rows — many cells)
    expect(await screen.findByText("Fuera de tolerancia")).toBeInTheDocument()
    expect((await screen.findAllByText("lot-1-3")).length).toBeGreaterThanOrEqual(2)
  })
})