import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi, beforeEach } from "vitest"

import { ReportsPage } from "@/pages/ReportsPage"
import { useAuth } from "@/integrations/auth/useAuth"
import type { AuthContextValue } from "@/integrations/auth/auth-context"
import type { PermissionCode, RoleCode } from "@/types"

vi.mock("@/integrations/auth/useAuth", () => ({
  useAuth: vi.fn(),
}))

const mockedUseAuth = vi.mocked(useAuth)

const TODAS_READ: PermissionCode[] = [
  "warehouse.read",
  "cargo.read",
  "truck.read",
  "scanner.read",
  "scale.read",
  "quarantine.read",
  "seizure.read",
  "audit.read",
]

function authContext(permissions: PermissionCode[]): AuthContextValue {
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

describe("ReportsPage", () => {
  beforeEach(() => {
    mockedUseAuth.mockReturnValue(authContext(TODAS_READ))
  })

  it("defaults to Camiones and renders seeded trucks with CSV export", async () => {
    render(<ReportsPage />)

    const tabCamiones = await screen.findByRole("tab", { name: /Camiones/i })
    expect(tabCamiones).toBeInTheDocument()

    // Report table shows the seeded trucks (patente column from COLUMNAS_CAMIONES)
    expect(await screen.findByText("DEMO-01-AA")).toBeInTheDocument()

    // CSV export button is shown once rows exist (aria-label names current report)
    expect(
      screen.getByRole("button", { name: /Exportar Camiones a CSV/i }),
    ).toBeInTheDocument()
  })

  it("switches reports via tabs and re-queries the server window", async () => {
    const user = userEvent.setup()
    render(<ReportsPage />)
    await screen.findByText("DEMO-01-AA")

    await user.click(screen.getByRole("tab", { name: /Ocupación/i }))

    expect(
      await screen.findByRole("button", { name: /Exportar Ocupación a CSV/i }),
    ).toBeInTheDocument()
  })

  it("hides tabs the caller cannot read (no partial leak)", async () => {
    mockedUseAuth.mockReturnValue(authContext(["warehouse.read"]))
    render(<ReportsPage />)

    expect(await screen.findByRole("tab", { name: /Ocupación/i })).toBeInTheDocument()
    expect(screen.queryByRole("tab", { name: /Camiones/i })).not.toBeInTheDocument()
    expect(screen.queryByRole("tab", { name: /Auditoría/i })).not.toBeInTheDocument()
  })

  it("shows empty state when no report permission is available", async () => {
    mockedUseAuth.mockReturnValue(authContext([]))
    render(<ReportsPage />)

    expect(await screen.findByText("Reportes no disponibles")).toBeInTheDocument()
  })
})