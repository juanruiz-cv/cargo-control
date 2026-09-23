import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi, beforeEach } from "vitest"

import { DashboardPage } from "@/pages/DashboardPage"
import { useAuth } from "@/integrations/auth/useAuth"
import type { AuthContextValue } from "@/integrations/auth/auth-context"
import type { PermissionCode, RoleCode } from "@/types"

vi.mock("@/integrations/auth/useAuth", () => ({
  useAuth: vi.fn(),
}))

const mockedUseAuth = vi.mocked(useAuth)

const TODOS_LOS_PERMISOS: PermissionCode[] = [
  "warehouse.read",
  "warehouse.configure",
  "truck.read",
  "cargo.read",
  "scanner.read",
  "scale.read",
  "quarantine.read",
  "seizure.read",
  "audit.read",
]

function authContext(permissions: PermissionCode[] = TODOS_LOS_PERMISOS): AuthContextValue {
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

describe("DashboardPage", () => {
  beforeEach(() => {
    mockedUseAuth.mockReturnValue(authContext())
  })

  it("renders KPIs from the demo backend with es-AR formatted values", async () => {
    render(<DashboardPage />)

    expect(await screen.findByText("Dashboard operativo")).toBeInTheDocument()

    // KPI values come from the seeded demo aggregates
    expect(screen.getByText("800")).toBeInTheDocument() // merchandise_stored
    expect(screen.getByText("Mercadería almacenada")).toBeInTheDocument()
    expect(screen.getByText("Camiones en playa")).toBeInTheDocument()
    expect(screen.getByText("Camiones en descarga")).toBeInTheDocument()
    expect(screen.getByText("En escáner")).toBeInTheDocument()
    expect(screen.getByText("En rezago")).toBeInTheDocument()
    expect(screen.getByText("Secuestrada")).toBeInTheDocument()
  })

  it("marks the demo mode with the Demo badge and renders chart widgets", async () => {
    render(<DashboardPage />)

    expect(await screen.findByText("Dashboard operativo")).toBeInTheDocument()
    expect(screen.getByText("Demo")).toBeInTheDocument()

    // Chart widgets are labelled SVGs (role="img")
    const charts = await screen.findAllByRole("img")
    expect(charts.length).toBeGreaterThanOrEqual(4)

    const ingresos = screen.getByRole("img", { name: /Ingresos de camiones por día/i })
    expect(ingresos).toBeInTheDocument()
  })

  it("shows the occupancy chart with the layout sectors", async () => {
    render(<DashboardPage />)
    await screen.findByText("Dashboard operativo")

    expect(
      await screen.findByRole("table", { name: /Porcentaje de ocupación por sector/i }),
    ).toBeInTheDocument()
  })

  it("reloads data when the refresh button is clicked", async () => {
    const user = userEvent.setup()
    render(<DashboardPage />)
    await screen.findByText("Dashboard operativo")

    const btns = screen.getAllByRole("button", { name: /Actualizar|Reintentar/i })
    const actualizar = btns[0]
    await user.click(actualizar)

    // The refresh bumps the revision counter; KPIs should still be there.
    expect(await screen.findByText("Mercadería almacenada")).toBeInTheDocument()
  })

  it("changes the series window through the select", async () => {
    const user = userEvent.setup()
    render(<DashboardPage />)
    await screen.findByText("Dashboard operativo")

    const select = screen.getByRole("combobox", { name: /Ventana de días de los gráficos/i })
    await user.click(select)
    expect(await screen.findByText("Últimos 7 días")).toBeInTheDocument()
    await user.click(screen.getByText("Últimos 7 días"))
  })

  it("hides every card for a session without dashboard reads", async () => {
    mockedUseAuth.mockReturnValue(authContext([]))
    render(<DashboardPage />)

    expect(await screen.findByText("Sin permisos de dashboard")).toBeInTheDocument()
    expect(screen.queryByText("Mercadería almacenada")).not.toBeInTheDocument()
  })

  it("gates cards by module permission (no truck.read → no truck cards)", async () => {
    mockedUseAuth.mockReturnValue(
      authContext(["warehouse.read", "cargo.read", "scanner.read", "quarantine.read", "seizure.read"]),
    )
    render(<DashboardPage />)
    await screen.findByText("Dashboard operativo")

    expect(await screen.findByText("Mercadería almacenada")).toBeInTheDocument()
    expect(screen.queryByText("Camiones en playa")).not.toBeInTheDocument()
    expect(screen.queryByText("Camiones en descarga")).not.toBeInTheDocument()
  })
})