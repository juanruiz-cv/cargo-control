import { Link } from "react-router-dom"
import { CompassIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { ROUTES } from "@/config/routes"

export function NotFoundPage() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
          <span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <CompassIcon className="size-6" />
          </span>
          <h1 className="text-xl font-semibold text-foreground">
            Página no encontrada
          </h1>
          <p className="text-sm text-muted-foreground">
            La ruta no existe o aún no está disponible. Volvé al inicio desde
            el panel.
          </p>
          <Button
            className="mt-2"
            render={<Link to={ROUTES.dashboard} />}
          >
            Ir al dashboard
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}