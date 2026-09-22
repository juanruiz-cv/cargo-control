import { GaugeIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/shared/EmptyState"
import { PageHeader } from "@/components/shared/PageHeader"
import { isSupabaseConfigured } from "@/integrations/supabase"

/**
 * Placeholder dashboard ("health" page). Proves the shell + router + design
 * system render; real operational KPIs arrive with the data layer (Fase 12)
 * — no hardcoded operation data in the scaffold.
 */
export function DashboardPage() {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Dashboard"
        description="Indicadores operativos en tiempo real (Fase 12)."
        actions={
          <Badge variant={isSupabaseConfigured ? "default" : "outline"}>
            {isSupabaseConfigured ? "Supabase conectado" : "Supabase sin configurar"}
          </Badge>
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-hidden="true">
        {Array.from({ length: 4 }, (_, index) => (
          <Card key={index} size="sm">
            <CardContent className="flex flex-col gap-3">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-6 w-16" />
              <Skeleton className="h-3 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Estado del scaffold</CardTitle>
          <CardDescription>
            Shell, router y design system operativos. Los KPIs se renderizan
            desde el motor de datos cuando Supabase quede conectado.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <EmptyState
            icon={<GaugeIcon className="size-6" />}
            title="Métricas operativas"
            description="Sin datos de operación en el scaffold: entradas de camiones, ocupación del predio y estados llegan con la capa de datos."
          />
        </CardContent>
      </Card>
    </div>
  )
}