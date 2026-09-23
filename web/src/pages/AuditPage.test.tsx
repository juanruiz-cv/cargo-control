import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router-dom"
import { describe, expect, it, vi, beforeEach } from "vitest"

import { AuditPage } from "@/pages/AuditPage"
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

describe("AuditPage", () => {
  beforeEach(() => {
    mockedUseAuth.mockReturnValue(authContext(["audit.read"]))
  })

  it("renders the seeded append-only audit log with entity ids", async () => {
    render(<MemoryRouter><AuditPage /></MemoryRouter>)

    expect(await screen.findByText("#1")).toBeInTheDocument()
    // Seed audit entries reference trucks/manifests/lots by entity id
    expect(await screen.findByText("truck-2")).toBeInTheDocument()
    expect(screen.getByText("manifest-1")).toBeInTheDocument()
  })

  it("opens the detail drawer for a logged event", async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><AuditPage /></MemoryRouter>)
    await screen.findByText("#1")

    await user.click(screen.getByRole("row", { name: /Ver detalle del evento de auditoría #1/i }))

    const drawer = await screen.findByRole("dialog", { name: /Evento de auditoría/i })
    expect(within(drawer).getByText("#1")).toBeInTheDocument()
  })
})