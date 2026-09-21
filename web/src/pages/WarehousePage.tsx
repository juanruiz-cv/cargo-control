import { FactoryIcon } from "lucide-react"

import { ModuleStubPage } from "@/components/shared/ModuleStubPage"

export function WarehousePage() {
  return (
    <ModuleStubPage
      module="Planta"
      description="Depósito: galpón con 12 sectores, ocupación y layout (Fases 11 y 14)."
      icon={FactoryIcon}
    />
  )
}