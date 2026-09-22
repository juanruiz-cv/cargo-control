import { useEffect, useState } from "react"

import { useFacilityId } from "@/hooks/useFacilityId"
import type { MovementFiltros } from "@/services/shared"

import { PageHeader } from "@/components/shared/PageHeader"
import { MovementFilters } from "@/components/cargo/MovementFilters"
import { MovementsTimeline } from "@/components/cargo/MovementsTimeline"

/**
 * Movements module — global facility-scoped timeline (movements-timeline.md;
 * /movements). Filters (kind/camion/since/until) re-query the server
 * window; free-text search is intentionally absent (no service filter yet,
 * documented).
 */
export function MovementsPage() {
  const { facilityId } = useFacilityId()
  const [filtros, setFiltros] = useState<MovementFiltros>({})

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
      />
      <MovementFilters filtros={filtros} onCambio={setFiltros} />
      <MovementsTimeline filtros={filtros} titulo="Historial de movimientos" />
    </div>
  )
}