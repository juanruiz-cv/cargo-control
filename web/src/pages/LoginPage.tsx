import { useState, type FormEvent } from "react"
import {
  Link,
  Navigate,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router-dom"
import { BoxesIcon, EyeIcon, EyeOffIcon, Loader2Icon, TriangleAlertIcon } from "lucide-react"
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
import { DEMO_EMAIL, DEMO_PASSWORD } from "@/services/demo/seed"

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

interface FieldErrors {
  email?: string
  password?: string
}

/**
 * Login screen (authentication.md §2; professional-ux.md §5 forms + §7
 * inline errors with icon and text — never color alone).
 *
 * - Redirects to the saved destination (`returnTo`, authentication.md §4)
 *   after a successful sign-in.
 * - In DEMO adapter mode the normal form stays first; an explicitly
 *   marked DEMO button signs in with the demo credentials.
 * - WCAG: associated labels, focus-visible rings, aria-invalid +
 *   aria-describedby on invalid fields, error announced via role=alert.
 */
export function LoginPage() {
  const { user, isLoading, isDemo, signIn } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const fromState = (location.state as { from?: { pathname?: string } } | null)
    ?.from?.pathname
  const fallback = searchParams.get("returnTo") ?? fromState ?? ROUTES.dashboard
  const destination = fallback === "/" ? ROUTES.dashboard : fallback

  if (isLoading) return <GateLoading />

  // authentication.md §6: public routes redirect to the app when a session exists.
  if (user) return <Navigate to={destination} replace />

  function validate(): boolean {
    const next: FieldErrors = {}
    const normalized = email.trim()
    if (!normalized) {
      next.email = "Ingresá tu correo electrónico."
    } else if (!EMAIL_RE.test(normalized)) {
      next.email = "El correo no parece válido."
    }
    if (!password) next.password = "Ingresá tu contraseña."
    setFieldErrors(next)
    return Object.keys(next).length === 0
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitError(null)
    if (!validate()) return

    setSubmitting(true)
    try {
      await signIn(email.trim(), password)
      toast.success("Sesión iniciada", {
        description: email.trim(),
      })
      navigate(destination, { replace: true })
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : "No se pudo iniciar sesión. Intentá de nuevo.",
      )
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDemoSignIn() {
    setSubmitError(null)
    setSubmitting(true)
    try {
      await signIn(DEMO_EMAIL, DEMO_PASSWORD)
      toast.success("Sesión demo iniciada", {
        description: DEMO_EMAIL,
      })
      navigate(destination, { replace: true })
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : "No se pudo iniciar la sesión demo.",
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background p-4">
      <Card className="w-full max-w-96">
        <CardHeader className="items-center text-center">
          <span className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <BoxesIcon className="size-5" />
          </span>
          <CardTitle className="text-lg">Cargo Control</CardTitle>
          <CardDescription>
            Plataforma de control y trazabilidad de camiones y mercadería
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="login-email">Correo electrónico</Label>
              <Input
                id="login-email"
                type="email"
                autoComplete="email"
                placeholder="usuario@empresa.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                aria-invalid={fieldErrors.email ? true : undefined}
                aria-describedby={
                  fieldErrors.email ? "login-email-error" : undefined
                }
              />
              {fieldErrors.email ? (
                <p
                  id="login-email-error"
                  className="flex items-start gap-1.5 text-sm text-destructive"
                >
                  <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" />
                  {fieldErrors.email}
                </p>
              ) : null}
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="login-password">Contraseña</Label>
                <Button
                  type="button"
                  variant="link"
                  className="h-auto px-0 text-xs"
                  render={<Link to={ROUTES.forgotPassword} />}
                >
                  ¿Olvidaste tu contraseña?
                </Button>
              </div>
              <div className="relative">
                <Input
                  id="login-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  aria-invalid={fieldErrors.password ? true : undefined}
                  aria-describedby={
                    fieldErrors.password ? "login-password-error" : undefined
                  }
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
              {fieldErrors.password ? (
                <p
                  id="login-password-error"
                  className="flex items-start gap-1.5 text-sm text-destructive"
                >
                  <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" />
                  {fieldErrors.password}
                </p>
              ) : null}
            </div>

            {submitError ? (
              <Alert variant="destructive">
                <TriangleAlertIcon className="size-4" />
                <AlertTitle>No se pudo iniciar sesión</AlertTitle>
                <AlertDescription>{submitError}</AlertDescription>
              </Alert>
            ) : null}

            <Button type="submit" size="lg" disabled={submitting}>
              {submitting ? <Loader2Icon className="animate-spin" /> : null}
              {submitting ? "Iniciando sesión…" : "Iniciar sesión"}
            </Button>
          </form>

          {isDemo ? (
            <>
              <div
                aria-hidden="true"
                className="flex items-center gap-2 text-xs text-muted-foreground"
              >
                <span className="h-px flex-1 bg-border" />
                o
                <span className="h-px flex-1 bg-border" />
              </div>
              <div className="flex flex-col gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  onClick={handleDemoSignIn}
                  disabled={submitting}
                >
                  Entrar con cuenta demo
                  <Badge variant="secondary">DEMO</Badge>
                </Button>
                <p className="text-center text-xs text-muted-foreground">
                  {DEMO_EMAIL} · {DEMO_PASSWORD} — datos ficticios, solo
                  desarrollo
                </p>
              </div>
            </>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}