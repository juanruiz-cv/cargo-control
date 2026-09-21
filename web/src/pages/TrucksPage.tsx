import { TruckIcon } from "lucide-react"

import { ModuleStubPage } from "@/components/shared/ModuleStubPage"

export function TrucksPage() {
  return (
    <ModuleStubPage
      module="Camiones"
      description="Gestión de camiones: ingreso, egreso y estados (Fase 7)."
      icon={TruckIcon}
    />
  )
}