import { ArchiveIcon } from "lucide-react"

import { ModuleStubPage } from "@/components/shared/ModuleStubPage"

export function AuditPage() {
  return (
    <ModuleStubPage
      module="Auditoría"
      description="Traza de auditoría de solo lectura: sin edición ni borrado (Fase 13)."
      icon={ArchiveIcon}
    />
  )
}