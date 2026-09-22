import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Truck } from "lucide-react"
import type { LayoutElementConUbicacion, MapaOperativoResultado } from "@/services/layoutService"
import type { LayoutElementType, TruckRow } from "@/types"
import { useViewport } from "@/hooks/useViewport"
import { docToScreen, pan, zoomAtPoint, wheelZoomFactor, type Viewport } from "@/lib/viewport"
import { cn } from "cn"
import {
  TRUCK_DISPLAY_STATUS_CLASS,
  TRUCK_DISPLAY_STATUS_LABELS,
  type TruckDisplayStatus,
} from "@/components/trucks/truckStatus"
import { ELEMENT_TYPE_META } from "@/components/map/shared/elementMeta"
import {
  capacidadReadable,
  derivarEstadoOperativo,
  ESTADO_META,
  type EstadoOperativo,
} from "@/components/map/shared/estadoOperativo"
import { EstadoOperativoBadge } from "@/components/map/shared/EstadoOperativoBadge"
import { ZoomControls } from "@/components/map/shared/ZoomControls"

/** Sector element type where a truck's cargo is being processed (docs/ux/operational-map.md). */
const SECTOR_POR_ESTADO: Partial<Record<TruckDisplayStatus, LayoutElementType>> = {
  retained: "quarantine",
  seized: "seizure",
  in_scanner: "scanner",
  in_scale: "scale",
}

interface TruckChipRowProps {
  camiones: TruckRow[]
  estadosCamion?: Record<string, TruckDisplayStatus>
  focusedTruckId?: string | null
  onSeleccionarCamion?: (truckId: string) => void
}

/** Column-fill truck chips pinned inside their owning sector box. */
function TruckChipRow({ camiones, estadosCamion, focusedTruckId, onSeleccionarCamion }: TruckChipRowProps) {
  return (
    <div className="absolute inset-1 z-10 flex flex-col flex-wrap content-start items-start justify-start gap-1 overflow-hidden">
      {camiones.map((truck) => {
        const estado = estadosCamion?.[truck.id] ?? "in_playon"
        const enfocado = focusedTruckId === truck.id
        return (
          <button
            key={truck.id}
            type="button"
            data-truck-chip={truck.id}
            title={`${truck.plate} — ${TRUCK_DISPLAY_STATUS_LABELS[estado]}`}
            onClick={(event) => {
              event.stopPropagation()
              onSeleccionarCamion?.(truck.id)
            }}
            className={cn(
              "flex w-fit cursor-pointer items-center gap-1 rounded-full border px-1.5 py-px text-[11px] leading-4 font-medium shadow-xs transition-colors",
              "hover:shadow-sm focus-visible:ring-2 focus-visible:ring-ring",
              TRUCK_DISPLAY_STATUS_CLASS[estado],
              enfocado && "ring-2 ring-ring ring-offset-2 ring-offset-background",
            )}
          >
            <Truck className="size-3 shrink-0" />
            {truck.plate}
          </button>
        )
      })}
    </div>
  )
}

export interface OperationalCanvasProps {
  resultado: MapaOperativoResultado
  ubicacionesConHoldAbierto: ReadonlySet<string>
  camionesEnPlayon: TruckRow[]
  /** Derived display status per truck (T-21) — same badges as the trucks module. */
  estadosCamion?: Record<string, TruckDisplayStatus>
  onSeleccionar: (elemento: LayoutElementConUbicacion) => void
  /** Navigate to a truck detail from a playón chip. */
  onSeleccionarCamion?: (truckId: string) => void
  /**
   * Truck to focus: centers the viewport on its chip (zoom kept >= 1)
   * and rings the chip while selected (truck finder panel).
   */
  focusedTruckId?: string | null
}

interface ElementoRender extends LayoutElementConUbicacion {
  estado: EstadoOperativo
}

function calcularBounds(resultado: MapaOperativoResultado): { width: number; height: number } {
  let maxX = 0
  let maxY = 0
  for (const { elemento } of resultado.elementos) {
    maxX = Math.max(maxX, elemento.x + (elemento.visual_width ?? 0))
    maxY = Math.max(maxY, elemento.y + (elemento.visual_height ?? 0))
  }
  return { width: Math.max(maxX, 800), height: Math.max(maxY, 600) }
}

/**
 * Read-only operational canvas (docs/ux/operational-map.md §4–§7):
 * published layout with live estadoOperativo overlay, zoom at cursor,
 * drag-to-pan, hover tooltips and truck chips over the playón.
 */
export function OperationalCanvas({
  resultado,
  ubicacionesConHoldAbierto,
  camionesEnPlayon,
  estadosCamion,
  onSeleccionar,
  onSeleccionarCamion,
  focusedTruckId,
}: OperationalCanvasProps) {
  const bounds = calcularBounds(resultado)
  const { containerRef, viewport, setViewport, zoomIn, zoomOut, fit, atMinZoom, atMaxZoom } =
    useViewport({ docWidth: bounds.width, docHeight: bounds.height })
  const [hovered, setHovered] = useState<ElementoRender | null>(null)
  const [tooltip, setTooltip] = useState<{ x: number; y: number } | null>(null)
  const dragRef = useRef<{ startX: number; startY: number; vp: Viewport } | null>(null)

  // Latest viewport for the focus effect (reading `viewport` directly would
  // re-center on every pan — we only want to react to focusedTruckId).
  const viewportRef = useRef(viewport)
  useEffect(() => {
    viewportRef.current = viewport
  }, [viewport])

  // Focus a truck chip (truck finder panel): pan/zoom so the chip lands at
  // the container center, keeping zoom >= 1 (1.2 when at or below 100%).
  // Chips live inside the translated world layer AND carry their own
  // docToScreen offset, so rendered position = doc * zoom + 2 * viewport
  // offset; the centering math mirrors that structure.
  useEffect(() => {
    if (!focusedTruckId) return
    const el = containerRef.current
    if (!el) return
    const chip = el.querySelector<HTMLElement>(`[data-truck-chip="${focusedTruckId}"]`)
    if (!chip) return
    const rect = el.getBoundingClientRect()
    const chipRect = chip.getBoundingClientRect()
    const vp = viewportRef.current
    const chipX = chipRect.left - rect.left + chipRect.width / 2
    const chipY = chipRect.top - rect.top + chipRect.height / 2
    const targetZoom = vp.zoom >= 1 ? vp.zoom : 1.2
    const ratio = targetZoom / vp.zoom
    setViewport({
      zoom: targetZoom,
      x: (rect.width / 2 - (chipX - 2 * vp.x) * ratio) / 2,
      y: (rect.height / 2 - (chipY - 2 * vp.y) * ratio) / 2,
    })
  }, [focusedTruckId, containerRef, setViewport])

  // Initial position: 100% zoom, document origin pinned to the left edge
  // (desktop-first doctrine). The Fit action is still available in the
  // ZoomControls for an overview.
  const positionedRef = useRef(false)
  useEffect(() => {
    if (positionedRef.current) return
    positionedRef.current = true
    const el = containerRef.current
    if (!el) return
    setViewport({ zoom: 1, x: 0, y: 0 })
  }, [containerRef, setViewport])

  // Group playón trucks by the sector where their cargo is being processed:
  // the chip follows the derived state (retained → rezago, seized →
  // secuestro, in_scanner → scanner, in_scale → balanza), falling back to
  // the playón. Chips only render where the published layout HAS that
  // sector type — otherwise the truck stays on the playón.
  const tiposDeSector = useMemo(
    () => new Set(resultado.elementos.map((e) => e.elemento.element_type)),
    [resultado],
  )
  const camionesPorSector = useMemo(() => {
    const porSector: Partial<Record<LayoutElementType, TruckRow[]>> = {}
    for (const truck of camionesEnPlayon) {
      const estado = estadosCamion?.[truck.id] ?? truck.status
      const destino = SECTOR_POR_ESTADO[estado] ?? "playon"
      const sector = destino === "playon" || tiposDeSector.has(destino) ? destino : "playon"
      ;(porSector[sector] ??= []).push(truck)
    }
    return porSector
  }, [camionesEnPlayon, estadosCamion, tiposDeSector])

  // Wheel zoom at cursor — native non-passive listener (React wheel is passive).
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      const rect = el.getBoundingClientRect()
      const at = { x: event.clientX - rect.left, y: event.clientY - rect.top }
      setViewport((vp) => zoomAtPoint(vp, wheelZoomFactor(event.deltaY, event.deltaMode), at.x, at.y))
    }
    el.addEventListener("wheel", onWheel, { passive: false })
    return () => el.removeEventListener("wheel", onWheel)
  }, [containerRef, setViewport])

  const onPointerDown = useCallback(
    (event: React.PointerEvent) => {
      if (event.button !== 0 && event.button !== 1) return
      dragRef.current = { startX: event.clientX, startY: event.clientY, vp: viewport }
      ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
    },
    [viewport],
  )

  const onPointerMove = useCallback(
    (event: React.PointerEvent) => {
      const drag = dragRef.current
      if (!drag) return
      const dx = event.clientX - drag.startX
      const dy = event.clientY - drag.startY
      setViewport(pan(drag.vp, dx, dy))
      setTooltip(null)
    },
    [setViewport],
  )

  const onPointerUp = useCallback(() => {
    dragRef.current = null
  }, [])

  return (
    <div className="relative h-full w-full overflow-hidden rounded-xl border bg-muted/20 select-none">
      <div
        ref={containerRef}
        className="absolute inset-0 cursor-grab touch-none active:cursor-grabbing"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgb(203 213 225 / 0.35) 1px, transparent 1px), linear-gradient(to bottom, rgb(203 213 225 / 0.35) 1px, transparent 1px)",
          backgroundSize: `${40 * viewport.zoom}px ${40 * viewport.zoom}px`,
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        {/* World layer: everything translates with the viewport */}
        <div
          className="absolute top-0 left-0"
          style={{ transform: `translate(${viewport.x}px, ${viewport.y}px)` }}
        >
          {resultado.elementos.map((dato) => {
            const estado = derivarEstadoOperativo(dato, ubicacionesConHoldAbierto)
            const meta = ELEMENT_TYPE_META[dato.elemento.element_type]
            const esLugar = meta.esLugar
            const estadoMeta = ESTADO_META[estado]
            const s = docToScreen(viewport, dato.elemento.x, dato.elemento.y)
            const w = (dato.elemento.visual_width ?? meta.defaultWidth) * viewport.zoom
            const h = (dato.elemento.visual_height ?? meta.defaultHeight) * viewport.zoom

            return (
              <div
                key={dato.elemento.id}
                role="button"
                tabIndex={0}
                aria-label={`${meta.labelEs} ${dato.elemento.code ?? dato.elemento.name ?? dato.ubicacion?.code ?? ""}`}
                className="absolute cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring"
                style={{
                  left: s.x,
                  top: s.y,
                  width: w,
                  height: h,
                  transform: `rotate(${dato.elemento.rotation ?? 0}deg)`,
                  backgroundColor: `color-mix(in srgb, ${meta.color} 32%, white)`,
                  border: `${esLugar ? 2 : 1}px solid ${esLugar ? estadoMeta.color : "rgb(203 213 225)"}`,
                  boxShadow: esLugar ? `inset 0 0 0 1px rgb(255 255 255 / 0.6)` : undefined,
                  borderRadius: 5,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  overflow: "hidden",
                }}
                onPointerEnter={(event) => {
                  setHovered({ ...dato, estado })
                  setTooltip({ x: event.clientX, y: event.clientY })
                }}
                onPointerLeave={() => {
                  setHovered(null)
                  setTooltip(null)
                }}
                onClick={() => onSeleccionar(dato)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") onSeleccionar(dato)
                }}
              >
                <span
                  className="pointer-events-none px-1 text-center font-medium leading-tight"
                  style={{
                    fontSize: Math.max(9, 11 * viewport.zoom),
                    color: "rgb(31 41 51 / 0.85)",
                    transform: `rotate(${-(dato.elemento.rotation ?? 0)}deg)`,
                  }}
                >
                  {(dato.elemento.code ?? dato.ubicacion?.code ?? dato.elemento.name ?? meta.labelEs).slice(0, 18)}
                </span>
                {/* Estado chip: dot on the corner */}
                {esLugar && viewport.zoom >= 0.5 ? (
                  <span
                    className="pointer-events-none absolute top-0.5 right-0.5 size-2 rounded-full"
                    style={{ backgroundColor: estadoMeta.color }}
                  />
                ) : null}

                {/* Camiones en playón — column-fill layout INSIDE the sector that owns
                    the truck's current derived state: playón, balanza,
                    scanner, rezago or secuestro. Starts at the top-left
                    corner, stacks vertically until the column fills the
                    sector height, then wraps into the next column to the
                    right. */}
                {dato.elemento.element_type === "playon" && camionesPorSector.playon?.length ? (
                  <TruckChipRow
                    camiones={camionesPorSector.playon}
                    estadosCamion={estadosCamion}
                    focusedTruckId={focusedTruckId}
                    onSeleccionarCamion={onSeleccionarCamion}
                  />
                ) : null}
                {dato.elemento.element_type === "scale" && camionesPorSector.scale?.length ? (
                  <TruckChipRow
                    camiones={camionesPorSector.scale}
                    estadosCamion={estadosCamion}
                    focusedTruckId={focusedTruckId}
                    onSeleccionarCamion={onSeleccionarCamion}
                  />
                ) : null}
                {dato.elemento.element_type === "scanner" && camionesPorSector.scanner?.length ? (
                  <TruckChipRow
                    camiones={camionesPorSector.scanner}
                    estadosCamion={estadosCamion}
                    focusedTruckId={focusedTruckId}
                    onSeleccionarCamion={onSeleccionarCamion}
                  />
                ) : null}
                {dato.elemento.element_type === "quarantine" && camionesPorSector.quarantine?.length ? (
                  <TruckChipRow
                    camiones={camionesPorSector.quarantine}
                    estadosCamion={estadosCamion}
                    focusedTruckId={focusedTruckId}
                    onSeleccionarCamion={onSeleccionarCamion}
                  />
                ) : null}
                {dato.elemento.element_type === "seizure" && camionesPorSector.seizure?.length ? (
                  <TruckChipRow
                    camiones={camionesPorSector.seizure}
                    estadosCamion={estadosCamion}
                    focusedTruckId={focusedTruckId}
                    onSeleccionarCamion={onSeleccionarCamion}
                  />
                ) : null}
              </div>
            )
          })}
        </div>
      </div>

      {/* Hover tooltip */}
      {hovered && tooltip ? (
        <div
          className="pointer-events-none fixed z-50 w-max max-w-xs rounded-md border bg-background px-3 py-2 text-xs shadow-lg"
          style={{ left: tooltip.x + 14, top: tooltip.y + 14 }}
        >
          <div className="flex items-center justify-between gap-3">
            <span className="font-medium">
              {hovered.elemento.code ?? hovered.ubicacion?.code ?? hovered.elemento.name ?? ELEMENT_TYPE_META[hovered.elemento.element_type].labelEs}
            </span>
            <EstadoOperativoBadge estado={hovered.estado} />
          </div>
          {hovered.ubicacion ? (
            <div className="mt-1 text-muted-foreground">
              {ESTADO_META[hovered.estado].descripcion}
              <div className="mt-0.5">{capacidadReadable(hovered.ocupacion)}</div>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="absolute right-3 bottom-3">
        <ZoomControls
          zoom={viewport.zoom}
          atMinZoom={atMinZoom}
          atMaxZoom={atMaxZoom}
          onZoomIn={() => {
            const el = containerRef.current
            const rect = el?.getBoundingClientRect()
            zoomIn(rect ? { x: rect.width / 2, y: rect.height / 2 } : undefined)
          }}
          onZoomOut={() => {
            const el = containerRef.current
            const rect = el?.getBoundingClientRect()
            zoomOut(rect ? { x: rect.width / 2, y: rect.height / 2 } : undefined)
          }}
          onFit={fit}
        />
      </div>
    </div>
  )
}