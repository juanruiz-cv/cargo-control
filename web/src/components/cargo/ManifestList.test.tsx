import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router-dom"
import { describe, expect, it, vi, beforeEach } from "vitest"

import { ManifestList } from "@/components/cargo/ManifestList"
import { useAuth } from "@/integrations/auth/useAuth"
import type { AuthContextValue } from "@/integrations/auth/auth-context"
import type { PermissionCode, RoleCode } from "@/types"

vi.mock("@/integrations/auth/useAuth", () => ({
  useAuth: vi.fn(),
}))

const mockedUseAuth = vi.mocked(useAuth)

function authContext(permissions: PermissionCode[] = ["cargo.read", "cargo.create"]): AuthContextValue {
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

describe("ManifestList", () => {
  beforeEach(() => {
    mockedUseAuth.mockReturnValue(authContext())
  })

  it("lists seeded manifests with their rollup status", async () => {
    render(
      <MemoryRouter>
        <ManifestList />
      </MemoryRouter>,
    )

    // The seeded demo state has manifest-1 (MANIF-2026-0918-A, in_playon)
    const titulo = await screen.findByText(/Mercadería \(\d+\)/)
    expect(titulo).toBeInTheDocument()
    expect(await screen.findByText("MANIF-2026-0918-A")).toBeInTheDocument()
    expect(screen.getByText("MANIF-2026-0919-B")).toBeInTheDocument()
    // Rollup status for both seeded manifests is in_playon → "En playa"
    expect(screen.getAllByText("En playa").length).toBeGreaterThanOrEqual(2)
  })

  it("filters rows by the search box (debounced, client-side)", async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <ManifestList />
      </MemoryRouter>,
    )
    await screen.findByText(/Mercadería \(\d+\)/)

    const buscador = screen.getByRole("textbox", { name: /Buscar por código, descripción o SKU/i })
    await user.type(buscador, "no-existe-nada")

    expect(await screen.findByText(/Resultados: 0/)).toBeInTheDocument()
  })

  it("shows the Nuevo button only with cargo.create", async () => {
    render(
      <MemoryRouter>
        <ManifestList />
      </MemoryRouter>,
    )
    await screen.findByText(/Mercadería \(\d+\)/)
    expect(screen.getByRole("button", { name: /Nuevo/i })).toBeInTheDocument()
  })

  it("hides the Nuevo button without cargo.create", async () => {
    mockedUseAuth.mockReturnValue(authContext(["cargo.read"]))
    render(
      <MemoryRouter>
        <ManifestList />
      </MemoryRouter>,
    )
    await screen.findByText(/Mercadería \(\d+\)/)
    expect(screen.queryByRole("button", { name: /Nuevo/i })).not.toBeInTheDocument()
  })

  it("shows manifest cards linking to their detail page", async () => {
    render(
      <MemoryRouter>
        <ManifestList />
      </MemoryRouter>,
    )
    await screen.findByText(/Mercadería \(\d+\)/)

    // Manifest cards are Links whose accessible name is the manifest code
    const links = await screen.findAllByRole("link", { name: /MANIF-2026/i })
    expect(links.length).toBeGreaterThanOrEqual(2)
  })
})