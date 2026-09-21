import { ArrowDownUpIcon, SearchIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { TRUCK_BASE_STATUS_LABELS } from "@/components/trucks/truckStatus"
import type { TransportCompanyRow, TruckStatus } from "@/types"

export type TruckSortField = "plate" | "transport_company" | "status"

interface TruckFiltersProps {
  buscar: string
  onBuscarChange: (value: string) => void
  estado: TruckStatus | "todos"
  onEstadoChange: (value: TruckStatus | "todos") => void
  companiaId: string | "todas"
  onCompaniaChange: (value: string | "todas") => void
  companias: TransportCompanyRow[]
  orden: TruckSortField
  onOrdenChange: (value: TruckSortField) => void
  desc: boolean
  onToggleDireccion: () => void
}

/**
 * TruckList filter/sort bar (trucks-module.md §List; T-03/T-04/T-05).
 * State lives in the parent — the bar is presentational. The company
 * select disappears entirely when the org has no transport company yet.
 */
export function TruckFilters({
  buscar,
  onBuscarChange,
  estado,
  onEstadoChange,
  companiaId,
  onCompaniaChange,
  companias,
  orden,
  onOrdenChange,
  desc,
  onToggleDireccion,
}: TruckFiltersProps) {
  const hayOrdenAlternativo = orden !== "plate" || desc
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative">
        <SearchIcon
          data-icon="inline-start"
          className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          value={buscar}
          onChange={(event) => onBuscarChange(event.target.value)}
          placeholder="Buscar por patente…"
          className="w-60 pl-8"
          aria-label="Buscar por patente"
        />
      </div>

      <Select
        value={estado}
        onValueChange={(value) => onEstadoChange((value ?? "todos") as TruckStatus | "todos")}
      >
        <SelectTrigger className="w-fit" aria-label="Filtrar por estado">
          <SelectValue placeholder="Estado: Todos" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="todos">Estado: Todos</SelectItem>
          {(Object.keys(TRUCK_BASE_STATUS_LABELS) as TruckStatus[]).map((estadoValue) => (
            <SelectItem key={estadoValue} value={estadoValue}>
              {TRUCK_BASE_STATUS_LABELS[estadoValue]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {companias.length > 0 ? (
        <Select
          value={companiaId}
          onValueChange={(value) => onCompaniaChange(value ?? "todas")}
        >
          <SelectTrigger aria-label="Filtrar por transportista">
            <SelectValue placeholder="Transportista: Todos" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Transportista: Todos</SelectItem>
            {companias.map((compania) => (
              <SelectItem key={compania.id} value={compania.id}>
                {compania.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}

      <div className="flex items-center gap-1">
        <Select value={orden} onValueChange={(value) => onOrdenChange((value ?? "plate") as TruckSortField)}>
          <SelectTrigger aria-label="Ordenar por">
            <SelectValue placeholder="Ordenar: Patente" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="plate">Ordenar: Patente</SelectItem>
            <SelectItem value="transport_company">Ordenar: Transportista</SelectItem>
            <SelectItem value="status">Ordenar: Estado</SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={desc ? "Dirección: descendente" : "Dirección: ascendente"}
          title={desc ? "Dirección: descendente" : "Dirección: ascendente"}
          onClick={onToggleDireccion}
          className={hayOrdenAlternativo ? "text-foreground" : "text-muted-foreground"}
        >
          <ArrowDownUpIcon className="size-4" />
        </Button>
      </div>
    </div>
  )
}