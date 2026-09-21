import { SettingsIcon } from "lucide-react"

import { ModuleStubPage } from "@/components/shared/ModuleStubPage"

export function SettingsPage() {
  return (
    <ModuleStubPage
      module="Configuración"
      description="Configuración general de la plataforma (fases posteriores)."
      icon={SettingsIcon}
    />
  )
}