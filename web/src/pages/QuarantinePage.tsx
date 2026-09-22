import { AlertTriangleIcon } from "lucide-react"

import { ModuleStubPage } from "@/components/shared/ModuleStubPage"

export function QuarantinePage() {
  return (
    <ModuleStubPage
      module="Rezago"
      description="Casos de rezago y su resolución supervisada (Fase 10)."
      icon={AlertTriangleIcon}
    />
  )
}