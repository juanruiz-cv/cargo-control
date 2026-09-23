import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi, beforeEach } from "vitest"

import { MovementsPage } from "@/pages/MovementsPage"
import { useAuth } from "@/integrations/auth/useAuth"
import type { AuthContextValue } from "@/integrations/auth/auth-context"
import type { PermissionCode, RoleCode } from "@/types"

vi.mock("@/integrations/auth/useAuth", () => ({
  useAuth: vi.fn(),
}))

const mockedUseAuth = vi.mocked(useAuth)

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

const TODOS: PermissionCode[] = [
  "warehouse.read",
  "cargo.read",
  "cargo.update",
  "cargo.transfer",
  "truck.read",
  "truck.exit",
  "scanner.create",
  "scale.create",
  "quarantine.create",
  "seizure.create",
]

describe("MovementsPage", () => {
  beforeEach(() => {
    mockedUseAuth.mockReturnValue(authContext(TODOS))
  })

  it("renders the seeded movement timeline with engine kinds", async () => {
    render(<MovementsPage />)

    expect(await screen.findByText("Historial de movimientos")).toBeInTheDocument()
    // Seed does a discharge + transfer + scan + quarantine — check labels
    expect(await screen.findByText("Descarga")).toBeInTheDocument()
  })

  it("shows Registrar movimiento only when the session can run at least one kind", async () => {
    render(<MovementsPage />)
    await screen.findByText("Historial de movimientos")
    expect(screen.getByRole("button", { name: /Registrar movimiento/i })).toBeInTheDocument()
  })

  it("hides Registrar movimiento for a session without movement permissions", async () => {
    mockedUseAuth.mockReturnValue(authContext(["warehouse.read"]))
    render(<MovementsPage />)
    await screen.findByText("Historial de movimientos")
    expect(screen.queryByRole("button", { name: /Registrar movimiento/i })).not.toBeInTheDocument()
  })
})