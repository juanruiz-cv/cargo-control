import { ShieldCheckIcon } from "lucide-react"

import { ModuleStubPage } from "@/components/shared/ModuleStubPage"

export function SeizurePage() {
  return (
    <ModuleStubPage
      module="Secuestro"
      description="Casos de secuestro de mercadería y evidencias (Fase 10)."
      icon={ShieldCheckIcon}
    />
  )
}