import { useState, type FormEvent } from "react"
import { Link } from "react-router-dom"
import {
  BoxesIcon,
  CircleCheckIcon,
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
import { ROUTES } from "@/config/routes"
import { useAuth } from "@/integrations/auth/useAuth"

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Password recovery (authentication.md §5): asks for the account email and
 * delegates the mail to GoTrue (`resetPasswordForEmail`). The demo adapter
 * has no mail provider — the confirmation screen states it and offers the
 * simulated reset route.
 */
export function ForgotPasswordPage() {
  const { resetPassword, isDemo } = useAuth()
  const [email, setEmail] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    const normalized = email.trim()
    if (!normalized) {
      setError("Ingresá tu correo electrónico.")
      return
    }
    if (!EMAIL_RE.test(normalized)) {
      setError("El correo no parece válido.")
      return
    }

    setLoading(true)
    try {
      await resetPassword(normalized)
      setSubmittedEmail(normalized)
      toast.success("Solicitud enviada", {
        description: "Revisá tu casilla de correo.",
      })
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo enviar el correo de recuperación.",
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background p-4">
      <Card className="w-full max-w-96">
        <CardHeader className="items-center text-center">
          <span className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <BoxesIcon className="size-5" />
          </span>
          <CardTitle className="text-lg">Recuperar contraseña</CardTitle>
          <CardDescription>
            Te enviamos un enlace de un solo uso para restablecerla
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {submittedEmail ? (
            <>
              <Alert>
                <CircleCheckIcon className="size-4" />
                <AlertTitle>Solicitud recibida</AlertTitle>
                <AlertDescription>
                  Si existe una cuenta para {submittedEmail}, vas a recibir un
                  correo con el enlace de recuperación (válido por una hora).
                </AlertDescription>
              </Alert>

              {isDemo ? (
                <Alert>
                  <Badge variant="secondary" className="shrink-0">
                    DEMO
                  </Badge>
                  <AlertTitle>Modo demo: no se envía un correo real</AlertTitle>
                  <AlertDescription>
                    Para probar el flujo completo, usá el enlace simulado desde{" "}
                    <Link to={ROUTES.resetPassword} className="underline">
                      /auth/reset-password
                    </Link>
                    .
                  </AlertDescription>
                </Alert>
              ) : null}

              <Button size="lg" render={<Link to={ROUTES.login} />}>
                Volver al inicio de sesión
              </Button>
            </>
          ) : (
            <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="forgot-email">Correo electrónico</Label>
                <Input
                  id="forgot-email"
                  type="email"
                  autoComplete="email"
                  placeholder="usuario@empresa.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? "forgot-email-error" : undefined}
                />
                {error ? (
                  <p
                    id="forgot-email-error"
                    className="flex items-start gap-1.5 text-sm text-destructive"
                  >
                    <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" />
                    {error}
                  </p>
                ) : null}
              </div>

              <Button type="submit" size="lg" disabled={loading}>
                {loading ? <Loader2Icon className="animate-spin" /> : null}
                {loading ? "Enviando…" : "Enviar enlace de recuperación"}
              </Button>

              <Button
                type="button"
                variant="link"
                size="sm"
                className="self-center"
                render={<Link to={ROUTES.login} />}
              >
                Volver al inicio de sesión
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}