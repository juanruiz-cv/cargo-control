import { useEffect, useRef, useState, type FormEvent } from "react"
import { Link, Navigate, useSearchParams } from "react-router-dom"
import {
  BoxesIcon,
  CircleCheckIcon,
  EyeIcon,
  EyeOffIcon,
  Loader2Icon,
  TriangleAlertIcon,
} from "lucide-react"
import { toast } from "sonner"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { GateLoading } from "@/components/auth/GateLoading"
import { ROUTES } from "@/config/routes"
import { useAuth } from "@/integrations/auth/useAuth"
import { getServices } from "@/services/index"

const MIN_PASSWORD_LENGTH = 6
const tokenStateTo = {
  validating: "validating",
  ready: "ready",
  invalid: "invalid",
} as const
type TokenState = (typeof tokenStateTo)[keyof typeof tokenStateTo]

/**
 * Reset password route (authentication.md §5).
 *
 * Supabase (GoTrue PKCE): the recovery mail lands here with
 * `?token_hash=...&type=recovery`; the one-time token is verified with
 * `verifyOtp`, which starts a session, then `updateUser({ password })`
 * completes the flow. A reused/missing token shows the invalid-link state.
 *
 * DEMO: no mail provider — the screen works with an active session, or
 * without one (simulated flow) so the UI is fully clickable.
 */
/**
 * One-time recovery tokens are single-use (authentication.md §5, S-07).
 * verifyOtp is async work, so it lives in an effect; the rest of the
 * token state is derived during render:
 *  - demo mode / active session  → 'ready' (no token to consume)
 *  - ?token_hash on the URL      → 'validating' until verifyOtp settles
 *  - no token at all             → 'invalid'
 *
 * StrictMode double-fires the effect in dev: the first verifyOtp may have
 * already consumed the token and created a session, so the second call
 * fails with "used token". On failure we re-check the real session — if
 * it exists, the token was consumed by the winning call and we are ready
 * (a reused link with no session stays 'invalid').
 */
export function ResetPasswordPage() {
  const { user, isLoading, isDemo, actualizarPassword, verificarToken } = useAuth()
  const [searchParams] = useSearchParams()
  const tokenHash = searchParams.get("token_hash")

  const [tokenState, setTokenState] = useState<TokenState>(() => {
    if (isDemo || user) return "ready"
    return tokenHash ? "validating" : "invalid"
  })
  const tokenTried = useRef(false)

  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)

  // One-time token handling (see the header comment for the StrictMode
  // double-fire rationale). The ref prevents re-verifying after the token
  // already started a session (a second verifyOtp would fail — S-07).
  useEffect(() => {
    if (isDemo || user || !tokenHash) return
    if (tokenTried.current) return
    tokenTried.current = true
    void verificarToken(tokenHash)
      .then(() => setTokenState("ready"))
      .catch(async () => {
        // Used token with a live session (StrictMode re-run, or a
        // recovery link opened while signed in) → ready; otherwise invalid.
        const sesion = await getServices().auth.sesionActual()
        setTokenState(sesion.userId ? "ready" : "invalid")
      })
  }, [tokenHash, user, isDemo, verificarToken])

  function validate(): boolean {
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`)
      return false
    }
    if (password !== confirm) {
      setError("Las contraseñas no coinciden.")
      return false
    }
    return true
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    if (!validate()) return

    setSaving(true)
    try {
      await actualizarPassword(password)
      setDone(true)
      toast.success("Contraseña actualizada", {
        description: "Ya podés iniciar sesión con la nueva contraseña.",
      })
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo actualizar la contraseña. El enlace pudo haber expirado.",
      )
    } finally {
      setSaving(false)
    }
  }

  if (isLoading) return <GateLoading />

  // Reused-token/missing-token state (authentication.md §5: one-time token).
  if (tokenState === "invalid") {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background p-4">
        <Card className="w-full max-w-96">
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <span className="flex size-10 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <TriangleAlertIcon className="size-5" />
            </span>
            <h1 className="text-lg font-semibold text-foreground">
              Enlace inválido o vencido
            </h1>
            <p className="text-sm text-muted-foreground">
              El enlace de recuperación es de un solo uso y expira a la hora.
              Solicitá uno nuevo desde el inicio de sesión.
            </p>
            <Button className="mt-2" render={<Link to={ROUTES.login} />}>
              Volver al inicio de sesión
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Success state.
  if (done) {
    const destination = user ? ROUTES.dashboard : ROUTES.login
    if (user) return <Navigate to={destination} replace />
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background p-4">
        <Card className="w-full max-w-96">
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <span className="flex size-10 items-center justify-center rounded-full bg-success/10 text-success">
              <CircleCheckIcon className="size-5" />
            </span>
            <h1 className="text-lg font-semibold text-foreground">
              Contraseña actualizada
            </h1>
            <p className="text-sm text-muted-foreground">
              Ya podés iniciar sesión con la nueva contraseña.
            </p>
            <Button className="mt-2" render={<Link to={ROUTES.login} />}>
              Iniciar sesión
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Validating state (supabase only, between navigation and verifyOtp).
  if (tokenState === "validating") {
    return <GateLoading />
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background p-4">
      <Card className="w-full max-w-96">
        <CardHeader className="items-center text-center">
          <span className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <BoxesIcon className="size-5" />
          </span>
          <CardTitle className="text-lg">Nueva contraseña</CardTitle>
          <CardDescription>
            {isDemo
              ? "Modo demo: el restablecimiento se simula localmente"
              : `Usuario autenticado${user?.email ? `: ${user.email}` : ""}`}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="reset-password">Contraseña nueva</Label>
              <div className="relative">
                <Input
                  id="reset-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  aria-invalid={error ? true : undefined}
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="absolute inset-y-0.5 right-0.5 size-7"
                  onClick={() => setShowPassword((previous) => !previous)}
                  aria-label={
                    showPassword ? "Ocultar contraseña" : "Mostrar contraseña"
                  }
                  aria-pressed={showPassword}
                >
                  {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                </Button>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="reset-confirm">Confirmar contraseña</Label>
              <Input
                id="reset-confirm"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                placeholder="••••••••"
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                aria-invalid={error ? true : undefined}
              />
            </div>

            {error ? (
              <Alert variant="destructive">
                <TriangleAlertIcon className="size-4" />
                <AlertTitle>No se pudo actualizar</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}

            <Button type="submit" size="lg" disabled={saving}>
              {saving ? <Loader2Icon className="animate-spin" /> : null}
              {saving ? "Guardando…" : "Guardar nueva contraseña"}
            </Button>
          </form>

          {isDemo ? (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Badge variant="secondary">DEMO</Badge>
              La nueva contraseña queda activa en esta sesión de la demo (se
              pierde al recargar).
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}