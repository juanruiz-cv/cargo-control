import { useState, type FormEvent } from "react"
import { BoxesIcon, InfoIcon } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
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

/**
 * Login stub. The form structure follows professional-ux.md §5 (labels
 * above inputs); authentication wiring lands with the Supabase Auth phase.
 */
export function LoginPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    // No-op in the scaffold: Supabase Auth is wired in a later phase.
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
          <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="login-email">Correo electrónico</Label>
              <Input
                id="login-email"
                type="email"
                autoComplete="email"
                placeholder="usuario@empresa.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="login-password">Contraseña</Label>
              <Input
                id="login-password"
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>
            <Button type="submit" size="lg" disabled>
              Iniciar sesión
            </Button>
          </form>

          <Alert>
            <InfoIcon className="size-4" />
            <AlertTitle>Autenticación pendiente</AlertTitle>
            <AlertDescription>
              El login se conecta con Supabase Auth en una fase posterior. Este
              formulario no envía credenciales.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    </div>
  )
}