import { useLocation, useParams } from "react-router-dom"
import type { LucideIcon } from "lucide-react"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { EmptyState } from "@/components/shared/EmptyState"
import { PageHeader } from "@/components/shared/PageHeader"

interface ModuleStubPageProps {
  module: string
  description: string
  icon: LucideIcon
}

/**
 * Placeholder for module routes while their phase is pending. Deliberately
 * contains no operation data: modules land in later phases, along with the
 * sidebar routing and permissions.
 */
export function ModuleStubPage({
  module,
  description,
  icon: Icon,
}: ModuleStubPageProps) {
  const location = useLocation()
  const params = useParams()
  const hasParams = Object.keys(params).length > 0

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={module} description={description} />
      <Card>
        <CardHeader>
          <CardTitle>Módulo en construcción</CardTitle>
          <CardDescription>
            Este módulo se implementa en su fase correspondiente; no se
            incluyen datos de operación en el scaffold.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <EmptyState
            icon={<Icon className="size-6" />}
            title={module}
            description="Acá va la composición de página del módulo cuando su fase aterrice."
          />
          <dl className="mt-4 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
            <div className="flex gap-2">
              <dt className="text-muted-foreground">Ruta</dt>
              <dd className="font-mono text-xs text-foreground">
                {location.pathname}
              </dd>
            </div>
            {hasParams ? (
              <div className="flex flex-wrap gap-2">
                {Object.entries(params).map(([key, value]) => (
                  <div key={key} className="flex gap-2">
                    <dt className="text-muted-foreground">{key}</dt>
                    <dd className="font-mono text-xs text-foreground">
                      {value}
                    </dd>
                  </div>
                ))}
              </div>
            ) : null}
          </dl>
        </CardContent>
      </Card>
    </div>
  )
}