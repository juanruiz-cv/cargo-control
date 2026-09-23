import { render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { describe, expect, it, vi, beforeEach } from "vitest"

import { ManifestDetailPage } from "@/components/cargo/ManifestDetailPage"
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

describe("ManifestDetailPage", () => {
  beforeEach(() => {
    mockedUseAuth.mockReturnValue(
      authContext(["cargo.read", "cargo.update", "cargo.transfer"]),
    )
  })

  it("renders the seeded manifest header with truck plate and items", async () => {
    render(
      <MemoryRouter>
        <ManifestDetailPage manifestId="manifest-1" />
      </MemoryRouter>,
    )

    // Header shows the manifest code + truck plate in description
    expect(await screen.findByText("MANIF-2026-0918-A")).toBeInTheDocument()
    expect((await screen.findAllByText(/DEMO-02-BB/)).length).toBeGreaterThan(0)
    expect(await screen.findByText(/Ítems/)).toBeInTheDocument()
  })

  it("gates Agregar ítem and Descargar behind cargo.update/cargo.transfer", async () => {
    render(
      <MemoryRouter>
        <ManifestDetailPage manifestId="manifest-1" />
      </MemoryRouter>,
    )
    await screen.findByText("MANIF-2026-0918-A")

    expect(screen.getByRole("button", { name: /Agregar ítem/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Descargar/i })).toBeInTheDocument()
  })

  it("hides mutation buttons for a read-only viewer", async () => {
    mockedUseAuth.mockReturnValue(authContext(["cargo.read"]))
    render(
      <MemoryRouter>
        <ManifestDetailPage manifestId="manifest-1" />
      </MemoryRouter>,
    )
    await screen.findByText("MANIF-2026-0918-A")

    expect(screen.queryByRole("button", { name: /Agregar ítem/i })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /Descargar/i })).not.toBeInTheDocument()
  })
})