import { useEffect, useState } from "react"

import { getServices } from "@/services"
import type { MovementFiltros } from "@/services/shared"
import type { MovementKind, TruckRow } from "@/types"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { MOVEMENT_KIND_LABELS } from "@/components/trucks/truckStatus"

type FiltrosCambio = Pick<MovementFiltros, "kind" | "camionId" | "since" | "until">

interface MovementFiltersProps {
  filtros: MovementFiltros
  onCambio: (filtros: MovementFiltros) => void
}

/**
 * Movement timeline filters (movements-timeline.md §Filtros): kind, truck
 * (degraded: resolved through manifests) and the since/until window. FREE
 * TEXT search over movements/reasons is intentionally NOT included — the
 * service layer has no such filter yet (documented deviation; lands with
 * the fulltext work).
 */
export function MovementFilters({ filtros, onCambio }: MovementFiltersProps) {
  const [camiones, setCamiones] = useState<TruckRow[]>([])

  useEffect(() => {
    let activo = true
    getServices()
      .trucks.listar({ limit: 100 })
      .then((rows) => {
        if (activo) setCamiones(rows)
      })
      .catch(() => {
        if (activo) setCamiones([])
      })
    return () => {
      activo = false
    }
  }, [])

  const setFiltro = (patch: FiltrosCambio) => {
    onCambio({
      ...filtros,
      ...patch,
    })
  }

  const activo =
    filtros.kind !== undefined ||
    filtros.camionId !== undefined ||
    filtros.since !== undefined ||
    filtros.until !== undefined

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="min-w-48">
        <Label htmlFor="mov-filtro-kind" className="mb-1 block text-xs text-muted-foreground">
          Tipo de movimiento
        </Label>
        <Select
          value={filtros.kind ?? "todos"}
          onValueChange={(v) =>
            setFiltro({ kind: v && v !== "todos" ? (v as MovementKind) : undefined })
          }
        >
          <SelectTrigger id="mov-filtro-kind" aria-label="Filtrar por tipo de movimiento">
            <SelectValue placeholder="Todos" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            {(Object.keys(MOVEMENT_KIND_LABELS) as MovementKind[]).map((kind) => (
              <SelectItem key={kind} value={kind}>
                {MOVEMENT_KIND_LABELS[kind]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="min-w-44">
        <Label htmlFor="mov-filtro-camion" className="mb-1 block text-xs text-muted-foreground">
          Camión
        </Label>
        <Select
          value={filtros.camionId ?? "todos"}
          onValueChange={(v) => setFiltro({ camionId: v && v !== "todos" ? v : undefined })}
        >
          <SelectTrigger id="mov-filtro-camion" aria-label="Filtrar por camión">
            <SelectValue placeholder="Todos" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            {camiones.map((camion) => (
              <SelectItem key={camion.id} value={camion.id}>
                {camion.plate}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label htmlFor="mov-filtro-desde" className="mb-1 block text-xs text-muted-foreground">
          Desde
        </Label>
        <Input
          id="mov-filtro-desde"
          type="date"
          className="h-9"
          value={filtros.since ?? ""}
          onChange={(event) => setFiltro({ since: event.target.value || undefined })}
        />
      </div>

      <div>
        <Label htmlFor="mov-filtro-hasta" className="mb-1 block text-xs text-muted-foreground">
          Hasta
        </Label>
        <Input
          id="mov-filtro-hasta"
          type="date"
          className="h-9"
          value={filtros.until ?? ""}
          onChange={(event) => setFiltro({ until: event.target.value || undefined })}
        />
      </div>

      {activo ? (
        <Button variant="ghost" onClick={() => onCambio({})}>
          Limpiar
        </Button>
      ) : null}
    </div>
  )
}