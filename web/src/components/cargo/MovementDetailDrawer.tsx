import { useEffect, useState } from "react"
import { Loader2Icon } from "lucide-react"

import { getServices } from "@/services"
import {
  type MovementDetail,
} from "@/services/movementService"
import type { LocationRow, TruckRow } from "@/types"

import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { GRUPO_KIND } from "@/components/cargo/MovementsTimeline"
import { MOVEMENT_KIND_LABELS, formatFecha, formatKg } from "@/components/trucks/truckStatus"

interface MovementDetailDrawerProps {
  abierto: boolean
  onAbiertoChange: (abierto: boolean) => void
  /** Loaded lazily while the drawer opens — one movement per open (bounded). */
  movimientoId: number | null
}

/**
 * Movement detail (movements-timeline.md §Detalle). Fetches the full
 * MovementDetail ONLY when the drawer opens, resolving location names and
 * truck plates through single bounded reads with silent degradation.
 */
export function MovementDetailDrawer({
  abierto,
  onAbiertoChange,
  movimientoId,
}: MovementDetailDrawerProps) {
  const [detalle, setDetalle] = useState<MovementDetail | null>(null)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ubicaciones] = useState<Map<string, LocationRow>>(new Map())
  const [camiones, setCamiones] = useState<Map<string, TruckRow>>(new Map())
  const [lecturaListas, setLecturaListas] = useState(false)

  // Reference lists are fetched once and reused across opens.
  useEffect(() => {
    if (lecturaListas) return
    let activo = true
    setLecturaListas(true)
    Promise.all([
      getServices().locations.listarLocations({ activo: true, limit: 100 }).catch(() => [] as LocationRow[]),
      getServices().trucks.listar({ limit: 100 }).catch(() => [] as TruckRow[]),
    ]).then(([locRows, truckRows]) => {
      if (!activo) return
      for (const loc of locRows) ubicaciones.set(loc.id, loc)
      setCamiones(new Map(truckRows.map((t) => [t.id, t])))
    })
    return () => {
      activo = false
    }
  }, [lecturaListas, ubicaciones])

  useEffect(() => {
    if (!abierto || movimientoId === null) return
    let activo = true
    setCargando(true)
    setError(null)
    setDetalle(null)
    getServices()
      .movements.obtenerMovimiento(movimientoId)
      .then((d) => {
        if (!activo) return
        setDetalle(d)
        setCargando(false)
      })
      .catch((cause) => {
        if (!activo) return
        setError(cause instanceof Error ? cause.message : String(cause))
        setCargando(false)
      })
    return () => {
      activo = false
    }
  }, [abierto, movimientoId])

  const nombreUbicacion = (id: string | null) => {
    if (!id) return null
    const loc = ubicaciones.get(id)
    return loc ? `${loc.code}` : id
  }
  const nombreCamion = (id: string | null) => {
    if (!id) return null
    const t = camiones.get(id)
    return t ? `Camión ${t.plate}` : `Camión ${id}`
  }
  const desde = (item: { from_location_id: string | null; from_truck_id: string | null }) =>
    nombreCamion(item.from_truck_id) ?? nombreUbicacion(item.from_location_id) ?? "—"
  const hacia = (item: { to_location_id: string | null; to_truck_id: string | null }) =>
    nombreCamion(item.to_truck_id) ?? nombreUbicacion(item.to_location_id) ?? "—"

  return (
    <Drawer open={abierto} onOpenChange={onAbiertoChange}>
      <DrawerContent className="max-h-[85dvh] overflow-y-auto">
        <DrawerHeader>
          <DrawerTitle>Movimiento</DrawerTitle>
          <DrawerDescription>Detalle del registro append-only en la espina de movimientos.</DrawerDescription>
        </DrawerHeader>
        <div className="space-y-4 px-4 pb-6">
          {cargando ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2Icon className="size-4 animate-spin" />
              Cargando detalle…
            </div>
          ) : error ? (
            <p role="alert" className="py-6 text-center text-sm text-destructive">
              {error}
            </p>
          ) : detalle ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                {(() => {
                  const GrupoIcono = GRUPO_KIND[detalle.movement.kind].icono
                  return (
                    <span
                      className={`inline-flex size-8 items-center justify-center rounded-full ${GRUPO_KIND[detalle.movement.kind].clase}`}
                    >
                      <GrupoIcono className="size-4" />
                    </span>
                  )
                })()}
                <span className="text-lg font-medium text-foreground">
                  {MOVEMENT_KIND_LABELS[detalle.movement.kind]}
                </span>
              </div>

              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <div>
                  <dt className="text-muted-foreground">Cuándo</dt>
                  <dd className="font-medium text-foreground">{formatFecha(detalle.movement.occurred_at)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Operador</dt>
                  <dd className="font-medium text-foreground">{detalle.movement.operator_id ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Ubicación</dt>
                  <dd className="font-medium text-foreground">
                    {nombreUbicacion(detalle.movement.location_id) ?? "—"}
                  </dd>
                </div>
                {detalle.movement.previous_movement_id ? (
                  <div>
                    <dt className="text-muted-foreground">Corrige</dt>
                    <dd className="font-medium text-foreground">
                      #{detalle.movement.previous_movement_id}
                    </dd>
                  </div>
                ) : null}
                <div>
                  <dt className="text-muted-foreground">ID</dt>
                  <dd className="font-medium text-foreground">#{detalle.movement.id}</dd>
                </div>
              </dl>

              {detalle.movement.reason ? (
                <p className="text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">Motivo: </span>
                  {detalle.movement.reason}
                </p>
              ) : null}

              {detalle.items.length > 0 ? (
                <div className="space-y-2">
                  <h3 className="text-sm font-medium text-foreground">Lotes ({detalle.items.length})</h3>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Lote</TableHead>
                        <TableHead>Cant.</TableHead>
                        <TableHead>Desde</TableHead>
                        <TableHead>Hacia</TableHead>
                        <TableHead>Notas</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detalle.items.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell className="font-mono text-xs">{item.item_lot_id}</TableCell>
                          <TableCell>{item.quantity}</TableCell>
                          <TableCell className="text-muted-foreground">{desde(item)}</TableCell>
                          <TableCell className="text-muted-foreground">{hacia(item)}</TableCell>
                          <TableCell className="text-muted-foreground">{item.notes ?? "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : null}

              {detalle.scaleOps.length > 0 ? (
                <div className="space-y-2">
                  <h3 className="text-sm font-medium text-foreground">Operación de balanza</h3>
                  {detalle.scaleOps.map((op) => (
                    <div key={op.id} className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm">
                      <p>
                        <span className="font-medium">Neto:</span> {formatKg(op.net_kg)}
                        <span className="ml-3 font-medium">Esperado:</span> {formatKg(op.expected_kg)}
                        <span className="ml-3 font-medium">Tolerancia:</span> {formatKg(op.tolerance_kg)}
                      </p>
                      <p className="mt-1 text-muted-foreground">
                        {op.within_tolerance ? "Dentro de tolerancia" : "FUERA de tolerancia"} · {op.device_id ?? "—"}
                      </p>
                    </div>
                  ))}
                </div>
              ) : null}

              {detalle.scannerOps.length > 0 ? (
                <div className="space-y-2">
                  <h3 className="text-sm font-medium text-foreground">Operación de scanner</h3>
                  {detalle.scannerOps.map((op) => (
                    <div key={op.id} className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm">
                      <p>
                        <span className="font-mono">{op.scanned_code}</span>
                        <span className="ml-2">{op.result}</span>
                      </p>
                    </div>
                  ))}
                </div>
              ) : null}

              {[...detalle.quarantineOps, ...detalle.seizureOps].length > 0 ? (
                <div className="space-y-2">
                  <h3 className="text-sm font-medium text-foreground">Retenciones</h3>
                  {detalle.quarantineOps.map((op) => (
                    <div key={op.id} className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm">
                      <p>
                        <span className="font-medium">Rezago:</span> {op.reason}
                        <span className="ml-3 font-medium">Estado:</span> {op.status}
                      </p>
                      <p className="mt-1 text-muted-foreground">
                        Abierto por {op.opened_by ?? "—"} · {op.opened_at ? formatFecha(op.opened_at) : ""}
                        {op.resolution_note ? ` · ${op.resolution_note}` : ""}
                      </p>
                    </div>
                  ))}
                  {detalle.seizureOps.map((op) => (
                    <div key={op.id} className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm">
                      <p>
                        <span className="font-medium">Secuestro:</span> {op.legal_ref ?? "—"}
                        <span className="ml-3 font-medium">Estado:</span> {op.status}
                      </p>
                      <p className="mt-1 text-muted-foreground">
                        Abierto por {op.opened_by ?? "—"} · {op.opened_at ? formatFecha(op.opened_at) : ""}
                        {op.resolution_note ? ` · ${op.resolution_note}` : ""}
                      </p>
                    </div>
                  ))}
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      </DrawerContent>
    </Drawer>
  )
}