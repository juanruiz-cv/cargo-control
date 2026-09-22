import { FileBarChartIcon } from "lucide-react"

import { ModuleStubPage } from "@/components/shared/ModuleStubPage"

export function ReportsPage() {
  return (
    <ModuleStubPage
      module="Reportes"
      description="Reportes operativos con filtros y exportación CSV (fase posterior)."
      icon={FileBarChartIcon}
    />
  )
}