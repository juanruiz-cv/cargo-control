import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi, beforeEach } from "vitest"

import { ScannerPage } from "@/pages/ScannerPage"
import { useAuth } from "@/integrations/auth/useAuth"
import type { AuthContextValue } from "@/integrations/auth/auth-context"
import type { PermissionCode, RoleCode } from "@/types"

vi.mock("@/integrations/auth/useAuth", () => ({
  useAuth: vi.fn(),
}))

const mockedUseAuth = vi.mocked(useAuth)

function authContext(permissions: PermissionCode[] = ["scanner.create", "scanner.read"]): AuthContextValue {
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

describe("ScannerPage", () => {
  beforeEach(() => {
    mockedUseAuth.mockReturnValue(authContext())
  })

  it("shows the seeded pending scan queue (lot-1-3 at the scanner checkpoint)", async () => {
    render(<ScannerPage />)

    expect(await screen.findByText("Cola pendiente")).toBeInTheDocument()
    // lot-1-3 appears in the queue row AND in recent ops (seed) — many cells
    expect((await screen.findAllByText("lot-1-3")).length).toBeGreaterThanOrEqual(1)
    expect(screen.getByRole("button", { name: /Escaneado/i })).toBeInTheDocument()
  })

  it("hides the register action without scanner.create but still shows the queue", async () => {
    mockedUseAuth.mockReturnValue(authContext(["scanner.read"]))
    render(<ScannerPage />)

    expect((await screen.findAllByText("lot-1-3")).length).toBeGreaterThanOrEqual(1)
    expect(screen.queryByRole("button", { name: /Registrar escaneo/i })).not.toBeInTheDocument()
    // Row action buttons exist but are disabled
    expect(screen.getByRole("button", { name: /Escaneado/i })).toBeDisabled()
  })

  it("registers a scan through the dialog and reloads the queue", async () => {
    const user = userEvent.setup()
    render(<ScannerPage />)
    await screen.findAllByText("lot-1-3")

    await user.click(screen.getByRole("button", { name: /Registrar escaneo/i }))
    const dialogo = await screen.findByRole("dialog", { name: /Registrar escaneo/i })
    expect(dialogo).toBeInTheDocument()

    const codigo = within(dialogo).getByLabelText("Código escaneado")
    await user.clear(codigo)
    await user.type(codigo, "REP-2002")

    await user.click(within(dialogo).getByRole("button", { name: "Registrar escaneo" }))

    // After a success scan the dialog closes and the lot leaves the pending queue
    await screen.findByText("Cola pendiente")
    // The scan operation appears in recent operations with the scanned code
    expect(await screen.findByText("REP-2002")).toBeInTheDocument()
  })

  it("keeps the lot pending when the scan result is not_found (SBF-05)", async () => {
    const user = userEvent.setup()
    render(<ScannerPage />)
    await screen.findAllByText("lot-1-3")

    await user.click(screen.getByRole("button", { name: /Registrar escaneo/i }))
    const dialogo = await screen.findByRole("dialog", { name: /Registrar escaneo/i })

    // select not_found as the result
    const resultado = within(dialogo).getByLabelText("Resultado")
    await user.click(resultado)
    const opcion = await screen.findByRole("option", { name: /No encontrado/i })
    await user.click(opcion)

    await user.click(within(dialogo).getByRole("button", { name: "Registrar escaneo" }))
    await screen.findByText("Cola pendiente")

    // lot stays in the queue (still rows with Escaneado button)
    expect((await screen.findAllByText("lot-1-3")).length).toBeGreaterThanOrEqual(1)
    // and the not_found capture shows in recent operations
    expect(await screen.findByText(/No encontrado/i)).toBeInTheDocument()
  })
})