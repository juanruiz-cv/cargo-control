import { ScaleIcon } from "lucide-react"

import { ModuleStubPage } from "@/components/shared/ModuleStubPage"

export function ScalePage() {
  return (
    <ModuleStubPage
      module="Balanza"
      description="Pesaje: bruto, tara y neto, con tolerancias (Fase 10)."
      icon={ScaleIcon}
    />
  )
}