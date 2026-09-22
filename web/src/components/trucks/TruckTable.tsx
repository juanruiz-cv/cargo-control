import { useMemo } from "react"

import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/shared/EmptyState"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { TruckStatusBadge } from "@/components/trucks/TruckStatusBadge"
import { formatFecha, formatKg } from "@/components/trucks/truckStatus"
import { emptySignals } from "@/services/truckService"
import type { TruckSignals } from "@/services/truckService"
import type { TruckSortField } from "@/components/trucks/TruckFilters"
import type { TransportCompanyRow, TruckRow } from "@/types"

interface TruckTableProps {
  trucks: TruckRow[]
  señales: Map<string, TruckSignals>
  companias: TransportCompanyRow[]
  orden: TruckSortField
  desc: boolean
  query: string
  tieneFiltros: boolean
  puedeCrear: boolean
  onNuevo: () => void
  onRowClick: (id: string) => void
  hayMas: boolean
  cargandoMas: boolean
  errorMas: string | null
  onCargarMas: () => void
  onReintentarMas: () => void
}

function ordenarCamiones(
  trucks: TruckRow[],
  companias: TransportCompanyRow[],
  orden: TruckSortField,
  desc: boolean,
): TruckRow[] {
  const companiaPorId = new Map(companias.map((c) => [c.id, c.name]))
  const nombreCompania = (t: TruckRow) => companiaPorId.get(t.transport_company_id ?? "") ?? "—"
  if (orden === "plate") {
    // Server already returns plate asc (T-08); desc = reverse in place.
    return desc ? [...trucks].reverse() : trucks
  }
  const comparador =
    orden === "status"
      ? (a: TruckRow, b: TruckRow) => a.status.localeCompare(b.status, "es")
      : (a: TruckRow, b: TruckRow) => nombreCompania(a).localeCompare(nombreCompania(b), "es")
  const ordenadas = [...trucks].sort(comparador)
  return desc ? ordenadas.reverse() : ordenadas
}

/**
 * Presentational truck table (TruckList; T-06/T-07). Sorting over the
 * fetched window is client-side for non-plate fields (server cursor stays
 * on `plate` — T-08); the parent resets sort to plate asc on filter change
 * (T-05). Row click opens /trucks/:id.
 */
export function TruckTable({
  trucks,
  señales,
  companias,
  orden,
  desc,
  query,
  tieneFiltros,
  puedeCrear,
  onNuevo,
  onRowClick,
  hayMas,
  cargandoMas,
  errorMas,
  onCargarMas,
  onReintentarMas,
}: TruckTableProps) {
  const filas = useMemo(
    () => ordenarCamiones(trucks, companias, orden, desc),
    [trucks, companias, orden, desc],
  )

  if (filas.length === 0) {
    if (query.trim()) {
      return (
        <EmptyState
          title={`Sin resultados para «${query.trim()}»`}
          description="Probá con otra patente o ajustá los filtros."
        />
      )
    }
    if (tieneFiltros) {
      return <EmptyState title="Sin resultados" description="Probá ajustar los filtros de búsqueda." />
    }
    return (
      <EmptyState
        title="No hay camiones"
        description="Registrá tu primer camión para empezar a controlar entradas y salidas."
        action={
          puedeCrear ? (
            <Button onClick={onNuevo}>+ Nuevo camión</Button>
          ) : undefined
        }
      />
    )
  }

  return (
    <div className="space-y-3">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Patente</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead>Transportista</TableHead>
            <TableHead className="text-right">Capacidad</TableHead>
            <TableHead>Ingreso</TableHead>
            <TableHead>Egreso</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filas.map((camion) => {
            const señalesCamion = señales.get(camion.id)
            const compania = companias.find((c) => c.id === camion.transport_company_id)
            return (
              <TableRow
                key={camion.id}
                onClick={() => onRowClick(camion.id)}
                className="cursor-pointer"
              >
                <TableCell>
                  <span className="font-medium text-foreground">{camion.plate}</span>
                </TableCell>
                <TableCell>
                  <TruckStatusBadge base={camion.status} señales={señalesCamion ?? emptySignals(camion.id)} />
                </TableCell>
                <TableCell className="text-muted-foreground">{compania?.name ?? "—"}</TableCell>
                <TableCell className="text-right text-muted-foreground">
                  {formatKg(camion.capacity_kg)}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {formatFecha(señalesCamion?.firstArrivalAt ?? null)}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {formatFecha(señalesCamion?.lastEgressAt ?? null)}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>

      <div className="flex flex-col items-center gap-3">
        {errorMas ? (
          <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
            <span role="alert">No se pudo cargar más camiones.</span>
            <Button variant="outline" onClick={onReintentarMas}>
              Reintentar
            </Button>
          </div>
        ) : null}
        {hayMas && !errorMas ? (
          <Button variant="outline" onClick={onCargarMas} disabled={cargandoMas}>
            {cargandoMas ? "Cargando…" : "Cargar más"}
          </Button>
        ) : null}
      </div>
    </div>
  )
}