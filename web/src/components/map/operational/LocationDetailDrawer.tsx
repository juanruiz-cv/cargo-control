import { AlertTriangle, InfinityIcon } from "lucide-react"
import type { LayoutElementConUbicacion } from "@/services/layoutService"
import type { TruckRow } from "@/types"
import { ELEMENT_TYPE_META } from "@/components/map/shared/elementMeta"
import { capacidadReadable, ESTADO_META, type EstadoOperativo } from "@/components/map/shared/estadoOperativo"
import { EstadoOperativoBadge } from "@/components/map/shared/EstadoOperativoBadge"
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer"
import { Badge } from "@/components/ui/badge"

export interface LocationDetailDrawerProps {
  elemento: LayoutElementConUbicacion | null
  estado: EstadoOperativo | null
  camionesEnPlayon: TruckRow[]
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface DimensionRow {
  label: string
  capacidad: number | null
  pct: number | null
  ocupado: number
}

/**
 * Right-side detail drawer for a place on the operational map
 * (docs/ux/operational-map.md §8): occupancy per dimension with ∞ for
 * unlimited capacity and missing-data flags.
 */
export function LocationDetailDrawer({
  elemento,
  estado,
  camionesEnPlayon,
  open,
  onOpenChange,
}: LocationDetailDrawerProps) {
  if (!elemento) return null
  const { elemento: el, ubicacion, ocupacion } = elemento
  const meta = ELEMENT_TYPE_META[el.element_type]

  const codigo = el.code ?? ubicacion?.code ?? el.name ?? meta.labelEs
  const estadoMeta = estado ? ESTADO_META[estado] : null
  const ubicacionEnPlayon = el.element_type === "playon"

  const filas: DimensionRow[] = ocupacion
    ? [
        {
          label: "Unidades",
          capacidad: ocupacion.capacity_max_units,
          pct: ocupacion.pct_units,
          ocupado: ocupacion.occupancy_units,
        },
        {
          label: "Peso (kg)",
          capacidad: ocupacion.capacity_max_kg,
          pct: ocupacion.pct_kg,
          ocupado: ocupacion.occupancy_kg,
        },
        {
          label: "Volumen (m³)",
          capacidad: ocupacion.capacity_max_volume_m3,
          pct: ocupacion.pct_m3,
          ocupado: ocupacion.occupancy_m3,
        },
      ]
    : []

  const missingWeight = ocupacion ? ocupacion.missing_weight_lots > 0 : false
  const missingVolume = ocupacion ? ocupacion.missing_volume_lots > 0 : false

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-w-md">
        <DrawerHeader>
          <DrawerTitle>{codigo}</DrawerTitle>
          <DrawerDescription>
            {meta.labelEs}
            {el.rotation ? ` · ${el.rotation}°` : ""}
          </DrawerDescription>
        </DrawerHeader>

        <div className="space-y-5 px-6 pb-6">
          <div className="flex flex-wrap items-center gap-2">
            {estado ? <EstadoOperativoBadge estado={estado} /> : null}
            {ubicacion?.maintenance ? <Badge variant="secondary">Mantenimiento</Badge> : null}
            {ubicacion ? <Badge variant="outline">{ubicacion.type}</Badge> : null}
          </div>

          {estadoMeta && ubicacion ? (
            <p className="text-sm text-muted-foreground">{estadoMeta.descripcion}</p>
          ) : null}

          {ubicacion ? (
            <section aria-label="Capacidad">
              <h4 className="mb-2 text-sm font-medium">Capacidad</h4>
              <div className="overflow-hidden rounded-lg border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-xs text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">Dimensión</th>
                      <th className="px-3 py-2 text-right font-medium">Ocupado</th>
                      <th className="px-3 py-2 text-right font-medium">Capacidad</th>
                      <th className="px-3 py-2 text-right font-medium">%</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filas.length === 0 ? (
                      <tr>
                        <td className="px-3 py-3 text-muted-foreground" colSpan={4}>
                          Sin datos de ocupación (lotes sin dimensión registrada)
                        </td>
                      </tr>
                    ) : (
                      filas.map((fila) => (
                        <tr key={fila.label}>
                          <td className="px-3 py-2">{fila.label}</td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {fila.ocupado.toLocaleString("es-AR")}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {fila.capacidad === null ? (
                              <span className="inline-flex items-center gap-1 text-muted-foreground">
                                <InfinityIcon className="size-3.5" /> ilimitada
                              </span>
                            ) : (
                              fila.capacidad.toLocaleString("es-AR")
                            )}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {fila.pct === null ? "—" : `${fila.pct}%`}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              {missingWeight || missingVolume ? (
                <p className="mt-2 flex items-start gap-1.5 text-xs text-amber-600">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                  {missingWeight && missingVolume
                    ? "Hay lotes sin peso ni volumen registrados (no se estiman)."
                    : missingWeight
                      ? "Hay lotes sin peso registrado (no se estima)."
                      : "Hay lotes sin volumen registrado (no se estima)."}
                </p>
              ) : null}
            </section>
          ) : (
            <p className="text-sm text-muted-foreground">
              Elemento estructural sin ubicación de stock asociada.
            </p>
          )}

          {ubicacionEnPlayon ? (
            <section aria-label="Camiones en playón">
              <h4 className="mb-2 text-sm font-medium">Camiones en playón</h4>
              {camionesEnPlayon.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin camiones estacionados.</p>
              ) : (
                <ul className="space-y-1">
                  {camionesEnPlayon.map((truck) => (
                    <li key={truck.id} className="flex items-center gap-2 text-sm">
                      <span className="font-medium">{truck.plate}</span>
                      <Badge variant="outline">{truck.status.replace(/_/g, " ")}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ) : null}

          {ubicacion && capacidadReadable(ocupacion) !== "—" && !ubicacionEnPlayon ? (
            <p className="text-xs text-muted-foreground">{capacidadReadable(ocupacion)}</p>
          ) : null}
        </div>
      </DrawerContent>
    </Drawer>
  )
}