import { render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { describe, expect, it, vi, beforeEach } from "vitest"

import { SettingsPage } from "@/pages/SettingsPage"
import { NotFoundPage } from "@/pages/NotFoundPage"
import { ForbiddenPage } from "@/pages/ForbiddenPage"
import { WarehousePage } from "@/pages/WarehousePage"
import { useAuth } from "@/integrations/auth/useAuth"
import type { AuthContextValue } from "@/integrations/auth/auth-context"
import type { PermissionCode, RoleCode } from "@/types"

vi.mock("@/integrations/auth/useAuth", () => ({
  useAuth: vi.fn(),
}))

const mockedUseAuth = vi.mocked(useAuth)

function authContext(
  permissions: PermissionCode[],
  roles: RoleCode[] = ["operator"],
  isDemo = true,
): AuthContextValue {
  const set = new Set(permissions)
  return {
    user: { id: "user-demo", email: "demo@cargocontrol.local", name: "Demo User" },
    roles,
    permissions,
    isLoading: false,
    isDemo,
    signIn: vi.fn().mockResolvedValue(undefined),
    signOut: vi.fn().mockResolvedValue(undefined),
    resetPassword: vi.fn().mockResolvedValue(undefined),
    actualizarPassword: vi.fn().mockResolvedValue(undefined),
    verificarToken: vi.fn().mockResolvedValue(undefined),
    hasPermission: (code: PermissionCode) => set.has(code),
    hasRole: (role: RoleCode) => roles.includes(role),
  }
}

describe("SettingsPage (Mi perfil)", () => {
  beforeEach(() => {
    mockedUseAuth.mockReturnValue(
      authContext(["warehouse.read", "cargo.read"], ["operator", "supervisor"]),
    )
  })

  it("renders identity, roles and permissions from the session", async () => {
    render(<SettingsPage />)

    expect(screen.getByText("Mi perfil")).toBeInTheDocument()
    expect(screen.getByText("Demo User")).toBeInTheDocument()
    expect(screen.getByText("demo@cargocontrol.local")).toBeInTheDocument()
    expect(screen.getByText("user-demo")).toBeInTheDocument()
    // Roles come from ROLE_LABELS, not raw codes
    expect(screen.getByText("Operador de patio")).toBeInTheDocument()
    expect(screen.getByText("Supervisor")).toBeInTheDocument()
    // Permissions are exposed as mono codes
    expect(screen.getByText("warehouse.read")).toBeInTheDocument()
    expect(screen.getByText("cargo.read")).toBeInTheDocument()
  })

  it("flags the demo session", async () => {
    render(<SettingsPage />)
    expect(screen.getByText(/Sesión demo de desarrollo/)).toBeInTheDocument()
  })

  it("shows empty placeholders when roles/permissions are absent", async () => {
    mockedUseAuth.mockReturnValue(authContext([], []))
    render(<SettingsPage />)

    expect(screen.getByText("Sin roles asignados en esta sesión.")).toBeInTheDocument()
    expect(screen.getByText(/Sin permisos explícitos/)).toBeInTheDocument()
  })
})

describe("WarehousePage (stub)", () => {
  it("renders the module stub without data dependencies", async () => {
    render(
      <MemoryRouter>
        <WarehousePage />
      </MemoryRouter>,
    )
    expect((await screen.findAllByText("Planta")).length).toBeGreaterThan(0)
    expect(screen.getByText(/Depósito: galpón/)).toBeInTheDocument()
  })
})

describe("NotFoundPage", () => {
  it("renders the 404 card with a dashboard link", async () => {
    render(
      <MemoryRouter>
        <NotFoundPage />
      </MemoryRouter>,
    )

    expect(screen.getByText("Página no encontrada")).toBeInTheDocument()
    expect(
      screen.getByRole("link", { name: /Ir al dashboard/i }),
    ).toHaveAttribute("href", "/dashboard")
  })
})

describe("ForbiddenPage", () => {
  it("renders the 403 screen with a dashboard link", async () => {
    render(
      <MemoryRouter>
        <ForbiddenPage />
      </MemoryRouter>,
    )

    expect(screen.getByText("Acceso restringido")).toBeInTheDocument()
    expect(
      screen.getByRole("link", { name: /Ir al panel principal/i }),
    ).toHaveAttribute("href", "/dashboard")
  })
})