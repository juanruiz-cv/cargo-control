import { ClipboardListIcon } from "lucide-react"

import { ModuleStubPage } from "@/components/shared/ModuleStubPage"

export function CargoPage() {
  return (
    <ModuleStubPage
      module="Cargamentos"
      description="Manifiestos, ítems y trazabilidad de mercadería (Fase 8)."
      icon={ClipboardListIcon}
    />
  )
}