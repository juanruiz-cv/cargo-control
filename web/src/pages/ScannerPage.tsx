import { ScanLineIcon } from "lucide-react"

import { ModuleStubPage } from "@/components/shared/ModuleStubPage"

export function ScannerPage() {
  return (
    <ModuleStubPage
      module="Scanner"
      description="Estación de escaneo: colas pendientes y operaciones (Fase 10)."
      icon={ScanLineIcon}
    />
  )
}