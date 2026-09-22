import { useMemo, useState } from "react"
import { ExternalLink, Search, SearchX, Truck } from "lucide-react"
import type { TransportCompanyRow, TruckRow } from "@/types"
import {
  TRUCK_DISPLAY_STATUS_CLASS,
  TRUCK_DISPLAY_STATUS_LABELS,
  type TruckDisplayStatus,
} from "@/components/trucks/truckStatus"
import { useDebouncedValue } from "@/hooks/useDebouncedValue"
import { Input } from "@/components/ui/input"
import { buscarCamiones } from "@/components/map/operational/truckFinder"
import { cn } from "cn"

export interface TruckFinderPanelProps {
  /** Full truck catalog — listar() without the in_playon filter. */
  camiones: TruckRow[]
  /** Derived display status per truck (same derivarEstadoCamion taxonomy as the trucks module). */
  estadosCamion: Record<string, TruckDisplayStatus>
  /** Active transport companies (transporter name join). */
  companias: TransportCompanyRow[]
  /** Truck ids rendered as playón chips — their location hint reads "En playón". */
  camionesEnPlayonIds: ReadonlySet<string>
  /** Truck the map viewport is focused on (row + chip highlight). */
  truckFocusedId: string | null
  /** Mark a truck on the map: center the viewport on its chip. */
  onSeleccionarCamion: (truckId: string) => void
  /** Navigate to the truck detail page. */
  onVerDetalle: (truckId: string) => void
  className?: string
}

/**
 * Truck finder panel (docs/ux/operational-map.md §"Truck finder panel
 * (right)"): debounced (300 ms) search over the FULL truck catalog by
 * plate or transporter, with the same derived-state vocabulary the trucks
 * module uses. Clicking a row focuses the map on the truck chip.
 */
export function TruckFinderPanel({
  camiones,
  estadosCamion,
  companias,
  camionesEnPlayonIds,
  truckFocusedId,
  onSeleccionarCamion,
  onVerDetalle,
  className,
}: TruckFinderPanelProps) {
  const [busqueda, setBusqueda] = useState("")
  const busquedaDebounced = useDebouncedValue(busqueda, 300)

  const filtrados = useMemo(
    () => buscarCamiones(camiones, companias, busquedaDebounced),
    [camiones, companias, busquedaDebounced],
  )

  const companiaPorId = useMemo(
    () => new Map(companias.map((c) => [c.id, c.name])),
    [companias],
  )

  return (
    <aside
      aria-label="Buscar camión"
      className={cn("flex flex-col overflow-hidden rounded-xl border bg-background", className)}
    >
      <div className="border-b p-3">
        <h3 className="text-sm font-semibold text-foreground">Camiones</h3>
        <div className="relative mt-2">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-8 pl-8 text-sm"
            placeholder="Buscar por patente o transportista…"
            value={busqueda}
            onChange={(event) => setBusqueda(event.target.value)}
            aria-label="Buscar camión por patente o transportista"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {camiones.length === 0 ? (
          <p className="flex items-center gap-2 px-3 py-4 text-sm text-muted-foreground">
            <Truck className="size-4 shrink-0" />
            Sin camiones registrados
          </p>
        ) : filtrados.length === 0 ? (
          <p className="flex items-center gap-2 px-3 py-4 text-sm text-muted-foreground">
            <SearchX className="size-4 shrink-0" />
            Sin resultados
          </p>
        ) : (
          <ul className="divide-y">
            {filtrados.map((camion) => {
              const estado = estadosCamion[camion.id] ?? camion.status
              const compania = companiaPorId.get(camion.transport_company_id ?? "") ?? "—"
              const seleccionado = truckFocusedId === camion.id
              const hint = camionesEnPlayonIds.has(camion.id)
                ? "En playón"
                : TRUCK_DISPLAY_STATUS_LABELS[estado]
              return (
                <li key={camion.id}>
                  <div
                    className={cn(
                      "flex items-start gap-1 px-3 py-2 text-sm transition-colors",
                      "hover:bg-muted/60",
                      seleccionado && "bg-muted/70",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => onSeleccionarCamion(camion.id)}
                      aria-pressed={seleccionado}
                      title="Marcar en el mapa"
                      className="flex min-w-0 flex-1 items-start gap-2 rounded-md text-left focus-visible:bg-muted/60 focus-visible:outline-none"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate font-semibold text-foreground">{camion.plate}</span>
                          <span
                            className={cn(
                              "inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-4xl border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
                              TRUCK_DISPLAY_STATUS_CLASS[estado],
                            )}
                          >
                            {TRUCK_DISPLAY_STATUS_LABELS[estado]}
                          </span>
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-muted-foreground">{compania}</span>
                      </span>
                      <span className="shrink-0 text-xs leading-5 text-muted-foreground">{hint}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onVerDetalle(camion.id)}
                      title={`Ver detalle de ${camion.plate}`}
                      aria-label={`Ver detalle de ${camion.plate}`}
                      className="flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:bg-muted/60 focus-visible:outline-none"
                    >
                      <ExternalLink className="size-3" />
                      Detalle
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </aside>
  )
}