import { ArrowRightLeftIcon } from "lucide-react"

import { ModuleStubPage } from "@/components/shared/ModuleStubPage"

export function MovementsPage() {
  return (
    <ModuleStubPage
      module="Movimientos"
      description="Línea de tiempo del motor de movimientos (Fase 9)."
      icon={ArrowRightLeftIcon}
    />
  )
}