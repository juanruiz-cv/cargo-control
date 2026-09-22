import { useEffect, useMemo, useState } from "react"
import { PlusIcon } from "lucide-react"

import { useAuth } from "@/integrations/auth/useAuth"
import { useFacilityId } from "@/hooks/useFacilityId"
import { MOVEMENT_KIND_PERMISSION } from "@/lib/movement-guards"
import type { MovementFiltros } from "@/services/shared"
import type { MovementKind } from "@/types"

import { PageHeader } from "@/components/shared/PageHeader"
import { Button } from "@/components/ui/button"
import { MovementFilters } from "@/components/cargo/MovementFilters"
import { MovementsTimeline } from "@/components/cargo/MovementsTimeline"
import { RegistrarMovimientoDialog } from "@/components/cargo/RegistrarMovimientoDialog"

/**
 * Movements module — global facility-scoped timeline (movements-timeline.md;
 * /movements). Filters (kind/camion/since/until) re-query the server
 * window; free-text search is intentionally absent (no service filter yet,
 * documented). "Registrar movimiento" opens the engine command surface and
 * is hidden when the current user cannot run ANY kind (I1 UX mirror; the
 * engine re-validates on submit).
 */
export function MovementsPage() {
  const { facilityId } = useFacilityId()
  const { permissions } = useAuth()
  const [filtros, setFiltros] = useState<MovementFiltros>({})
  const [dialogoAbierto, setDialogoAbierto] = useState(false)
  const [recarga, setRecarga] = useState(0)

  const puedeRegistrar = useMemo(
    () =>
      (Object.keys(MOVEMENT_KIND_PERMISSION) as MovementKind[]).some((k) => {
        const requerido = MOVEMENT_KIND_PERMISSION[k]
        const perms = Array.isArray(requerido) ? requerido : [requerido]
        return perms.some((p) => permissions.includes(p))
      }),
    [permissions],
  )

  // The facility read resolves once (facilityId hook) — scope the window then.
  useEffect(() => {
    if (facilityId) {
      setFiltros((prev) => ({ ...prev, facilidadId: facilityId }))
    }
  }, [facilityId])

  return (
    <div className="space-y-4">
      <PageHeader
        title="Movimientos"
        description="Línea de tiempo del motor de movimientos (append-only)."
        actions={
          puedeRegistrar ? (
            <Button onClick={() => setDialogoAbierto(true)}>
              <PlusIcon className="size-4" />
              Registrar movimiento
            </Button>
          ) : undefined
        }
      />
      <MovementFilters filtros={filtros} onCambio={setFiltros} />
      {/* key remounts the timeline so a registered movement refreshes the window */}
      <MovementsTimeline
        key={recarga}
        filtros={filtros}
        titulo="Historial de movimientos"
      />
      <RegistrarMovimientoDialog
        abierto={dialogoAbierto}
        onAbiertoChange={setDialogoAbierto}
        onRegistrado={() => setRecarga((r) => r + 1)}
      />
    </div>
  )
}