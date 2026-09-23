import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi, beforeEach } from "vitest"

import { QuarantinePage } from "@/pages/QuarantinePage"
import { SeizurePage } from "@/pages/SeizurePage"
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
): AuthContextValue {
  const set = new Set(permissions)
  return {
    user: { id: "user-demo", email: "demo@cargocontrol.local", name: "Demo" },
    roles,
    permissions,
    isLoading: false,
    isDemo: true,
    signIn: vi.fn().mockResolvedValue(undefined),
    signOut: vi.fn().mockResolvedValue(undefined),
    resetPassword: vi.fn().mockResolvedValue(undefined),
    actualizarPassword: vi.fn().mockResolvedValue(undefined),
    verificarToken: vi.fn().mockResolvedValue(undefined),
    hasPermission: (code: PermissionCode) => set.has(code),
    hasRole: (role: RoleCode) => roles.includes(role),
  }
}

describe("QuarantinePage (Rezago)", () => {
  beforeEach(() => {
    mockedUseAuth.mockReturnValue(
      authContext(["quarantine.read", "quarantine.create"]),
    )
  })

  it("lists the seeded open quarantine case (qu-1 / lot-1-2)", async () => {
    render(<QuarantinePage />)

    expect(await screen.findByText("Casos abiertos")).toBeInTheDocument()
    expect((await screen.findAllByText("qu-1")).length).toBeGreaterThan(0)
    expect((await screen.findAllByText("lot-1-2")).length).toBeGreaterThan(0)
    expect((await screen.findAllByText("Sospecha de daño en embalaje")).length).toBeGreaterThan(0)
  })

  it("requires quarantine.read to see anything (no data leak)", async () => {
    mockedUseAuth.mockReturnValue(authContext([]))
    render(<QuarantinePage />)

    expect(await screen.findByText("Sin permiso para ver rezago")).toBeInTheDocument()
    expect(screen.queryAllByText("qu-1")).toHaveLength(0)
  })

  it("enables Resolver only for admin/supervisor roles", async () => {
    render(<QuarantinePage />)
    await screen.findAllByText("qu-1")

    const resolver = screen.getByRole("button", { name: /Resolver/i })
    expect(resolver).toBeDisabled()
  })

  it("a supervisor resolves the quarantine case (engine release) [AC-E6-2 / AC-E9-2]", async () => {
    mockedUseAuth.mockReturnValue(
      authContext(["quarantine.read", "quarantine.create"], ["supervisor"]),
    )
    const user = userEvent.setup()
    render(<QuarantinePage />)
    await screen.findAllByText("qu-1")

    const resolver = screen.getByRole("button", { name: /Resolver/i })
    expect(resolver).toBeEnabled()
    await user.click(resolver)

    const dialogo = await screen.findByRole("dialog", { name: /Resolver/i })
    const nota = within(dialogo).getByLabelText(/Nota de resolución/i)
    await user.type(nota, "Embalaje reemplazado, liberado")

    await user.click(within(dialogo).getByRole("button", { name: "Resolver caso" }))

    // Case closes → empty state for open cases
    await screen.findByText("Sin casos abiertos")
  }, 15000)
})

describe("SeizurePage (Secuestro)", () => {
  beforeEach(() => {
    mockedUseAuth.mockReturnValue(authContext(["seizure.read", "seizure.create"]))
  })

  it("lists the seeded open seizure case (se-1 with legal ref)", async () => {
    render(<SeizurePage />)

    expect(await screen.findByText("Casos abiertos")).toBeInTheDocument()
    expect((await screen.findAllByText("se-1")).length).toBeGreaterThan(0)
    expect((await screen.findAllByText("lot-2-1")).length).toBeGreaterThan(0)
    expect((await screen.findAllByText("EXP-JUD-2026-0112")).length).toBeGreaterThan(0)
  })

  it("requires seizure.read to see anything", async () => {
    mockedUseAuth.mockReturnValue(authContext([]))
    render(<SeizurePage />)

    expect(await screen.findByText("Sin permiso para ver secuestro")).toBeInTheDocument()
    expect(screen.queryAllByText("se-1")).toHaveLength(0)
  })
})