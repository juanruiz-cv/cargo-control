import { MapIcon } from "lucide-react"

import { ModuleStubPage } from "@/components/shared/ModuleStubPage"

export function OperationalMapPage() {
  return (
    <ModuleStubPage
      module="Mapa Operativo"
      description="Vista operativa del predio: playón, galpón y sectores (Fase 11)."
      icon={MapIcon}
    />
  )
}