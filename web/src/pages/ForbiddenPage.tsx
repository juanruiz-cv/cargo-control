import { Link } from "react-router-dom"
import { LockKeyholeIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { ROUTES } from "@/config/routes"

/**
 * 403 — authenticated but without the module permission
 * (authentication.md §6 guard table). Standalone screen, outside the
 * shell, like NotFoundPage.
 */
export function ForbiddenPage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background p-4 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <LockKeyholeIcon className="size-6" />
      </span>
      <h1 className="text-2xl font-bold text-foreground">Acceso restringido</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        Tu cuenta no tiene permisos para entrar a esta sección. Si creés que
        es un error, consultá con el administrador del sistema.
      </p>
      <div className="flex gap-2">
        <Button render={<Link to={ROUTES.dashboard} />}>
          Ir al panel principal
        </Button>
        <Button variant="outline" render={<Link to={ROUTES.settings} />}>
          Ver mi perfil
        </Button>
      </div>
    </div>
  )
}