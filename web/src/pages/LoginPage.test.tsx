import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router-dom"
import { describe, expect, it, vi, beforeEach } from "vitest"

import { LoginPage } from "@/pages/LoginPage"
import { useAuth } from "@/integrations/auth/useAuth"
import type { AuthContextValue } from "@/integrations/auth/auth-context"
import { DEMO_EMAIL, DEMO_PASSWORD } from "@/services/demo/seed"

vi.mock("@/integrations/auth/useAuth", () => ({
  useAuth: vi.fn(),
}))

const mockedUseAuth = vi.mocked(useAuth)

function baseContext(overrides: Partial<AuthContextValue> = {}): AuthContextValue {
  return {
    user: null,
    roles: [],
    permissions: [],
    isLoading: false,
    isDemo: true,
    signIn: vi.fn().mockResolvedValue(undefined),
    signOut: vi.fn().mockResolvedValue(undefined),
    resetPassword: vi.fn().mockResolvedValue(undefined),
    actualizarPassword: vi.fn().mockResolvedValue(undefined),
    verificarToken: vi.fn().mockResolvedValue(undefined),
    hasPermission: () => false,
    hasRole: () => false,
    ...overrides,
  }
}

function renderLogin() {
  return render(
    <MemoryRouter>
      <LoginPage />
    </MemoryRouter>,
  )
}

describe("LoginPage", () => {
  beforeEach(() => {
    mockedUseAuth.mockReturnValue(baseContext())
  })

  it("renders the demo surface with the DEMO entry when the demo adapter is active", () => {
    renderLogin()
    expect(screen.getByText("Cargo Control")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Entrar con cuenta demo/i })).toBeInTheDocument()
  })

  it("shows inline field errors on an empty submit", async () => {
    const user = userEvent.setup()
    renderLogin()
    await user.click(screen.getByRole("button", { name: "Iniciar sesión" }))

    expect(screen.getByText("Ingresá tu correo electrónico.")).toBeInTheDocument()
    expect(screen.getByText("Ingresá tu contraseña.")).toBeInTheDocument()
  })

  it("rejects an invalid email format with aria-invalid state", async () => {
    const user = userEvent.setup()
    renderLogin()

    await user.type(screen.getByLabelText("Correo electrónico"), "no-es-un-email")
    await user.type(screen.getByLabelText("Contraseña"), "123456")
    await user.click(screen.getByRole("button", { name: "Iniciar sesión" }))

    expect(screen.getByText("El correo no parece válido.")).toBeInTheDocument()
    const emailInput = screen.getByLabelText("Correo electrónico")
    expect(emailInput).toHaveAttribute("aria-invalid", "true")
  })

  it("submits credentials through signIn and navigates to the dashboard", async () => {
    const signIn = vi.fn().mockResolvedValue(undefined)
    mockedUseAuth.mockReturnValue(baseContext({ signIn }))
    const user = userEvent.setup()
    renderLogin()

    await user.type(screen.getByLabelText("Correo electrónico"), "demo@cargocontrol.local")
    await user.type(screen.getByLabelText("Contraseña"), "demo-pass")
    await user.click(screen.getByRole("button", { name: "Iniciar sesión" }))

    expect(signIn).toHaveBeenCalledWith("demo@cargocontrol.local", "demo-pass")
  })

  it("the DEMO button signs in with the demo credentials", async () => {
    const signIn = vi.fn().mockResolvedValue(undefined)
    mockedUseAuth.mockReturnValue(baseContext({ signIn }))
    const user = userEvent.setup()
    renderLogin()

    await user.click(screen.getByRole("button", { name: /Entrar con cuenta demo/i }))
    expect(signIn).toHaveBeenCalledWith(DEMO_EMAIL, DEMO_PASSWORD)
  })

  it("surfaces a sign-in failure through the destructive alert", async () => {
    const signIn = vi.fn().mockRejectedValue(new Error("credenciales inválidas (use demo@cargocontrol.local / demo-pass)"))
    mockedUseAuth.mockReturnValue(baseContext({ signIn }))
    const user = userEvent.setup()
    renderLogin()

    await user.type(screen.getByLabelText("Correo electrónico"), DEMO_EMAIL)
    await user.type(screen.getByLabelText("Contraseña"), "incorrecta")
    await user.click(screen.getByRole("button", { name: "Iniciar sesión" }))

    expect(screen.getByText(/credenciales inválidas/i)).toBeInTheDocument()
  })

  it("redirects to the dashboard when a session already exists", async () => {
    mockedUseAuth.mockReturnValue(
      baseContext({
        user: { id: "u-1", email: DEMO_EMAIL, name: "Demo" },
      }),
    )
    renderLogin()
    // Navigate replaces the tree — the login form must not exist
    expect(screen.queryByRole("button", { name: "Iniciar sesión" })).not.toBeInTheDocument()
  })
})