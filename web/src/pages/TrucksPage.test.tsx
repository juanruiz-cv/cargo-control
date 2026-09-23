import { render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { describe, expect, it, vi, beforeEach } from "vitest"

import { TrucksPage } from "@/pages/TrucksPage"
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

describe("TrucksPage (TruckListView)", () => {
  beforeEach(() => {
    mockedUseAuth.mockReturnValue(authContext(["truck.read", "truck.create"]))
  })

  it("renders the seeded truck fleet with plates and status badges", async () => {
    render(
      <MemoryRouter>
        <TrucksPage />
      </MemoryRouter>,
    )

    expect(await screen.findByText("DEMO-01-AA")).toBeInTheDocument()
    expect(screen.getByText("DEMO-02-BB")).toBeInTheDocument()
    expect(screen.getByText("DEMO-03-CC")).toBeInTheDocument()
  })

  it("shows Nuevo only with truck.create", async () => {
    render(
      <MemoryRouter>
        <TrucksPage />
      </MemoryRouter>,
    )
    await screen.findByText("DEMO-01-AA")
    expect(screen.getByRole("button", { name: /Nuevo/i })).toBeInTheDocument()
  })

  it("hides Nuevo without truck.create", async () => {
    mockedUseAuth.mockReturnValue(authContext(["truck.read"]))
    render(
      <MemoryRouter>
        <TrucksPage />
      </MemoryRouter>,
    )
    await screen.findByText("DEMO-01-AA")
    expect(screen.queryByRole("button", { name: /Nuevo/i })).not.toBeInTheDocument()
  })
})