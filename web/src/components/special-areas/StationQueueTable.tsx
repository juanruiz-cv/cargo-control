import type { ReactNode } from "react"

import type { StationQueueRow } from "@/types"

import { LotStatusBadge } from "@/components/cargo/cargoBadges"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

interface StationQueueTableProps {
  rows: StationQueueRow[]
  /** Column/queue kind label (scan or scale). */
  filaAccion: (row: StationQueueRow) => ReactNode
}

/**
 * Pending queue table, shared by the scanner and scale stations
 * (special-areas.md §Derived views, SBF-05/06/07). Rows come from
 * `obtenerColaPendiente` — lots placed at the checkpoint with no COMPLETED
 * operation for that placement. Each row carries the station action.
 */
export function StationQueueTable({ rows, filaAccion }: StationQueueTableProps) {
  if (rows.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground">
        Sin lotes pendientes: la cola muestra solo lotes colocados en el checkpoint sin operación completada.
      </p>
    )
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Manifiesto</TableHead>
          <TableHead>SKU / Descripción</TableHead>
          <TableHead>Lote</TableHead>
          <TableHead>Estado</TableHead>
          <TableHead className="text-right">Cantidad</TableHead>
          <TableHead className="text-right">Acción</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={`${row.queue_kind}-${row.item_lot_id}`}>
            <TableCell>
              <span className="font-medium">{row.manifest_code}</span>
              {row.truck_id ? (
                <span className="ml-1 text-muted-foreground">· camión {row.truck_id.slice(0, 8)}</span>
              ) : null}
            </TableCell>
            <TableCell>
              <div className="flex flex-col">
                <span className="font-medium">{row.sku ?? row.item_lot_id}</span>
                <span className="text-xs text-muted-foreground">{row.item_description}</span>
              </div>
            </TableCell>
            <TableCell>
              <Badge variant="outline">{row.item_lot_id}</Badge>
            </TableCell>
            <TableCell>
              <LotStatusBadge status={row.lot_status} />
            </TableCell>
            <TableCell className="text-right">
              {row.quantity} {row.uom}
            </TableCell>
            <TableCell className="text-right">{filaAccion(row)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}