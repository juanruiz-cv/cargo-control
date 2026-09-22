import { useCallback, useEffect, useRef, useState } from "react"
import { Truck } from "lucide-react"
import type { LayoutElementConUbicacion, MapaOperativoResultado } from "@/services/layoutService"
import type { TruckRow } from "@/types"
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

export interface OperationalCanvasProps {
  resultado: MapaOperativoResultado
  ubicacionesConHoldAbierto: ReadonlySet<string>
  camionesEnPlayon: TruckRow[]
  /** Derived display status per truck (T-21) — same badges as the trucks module. */
  estadosCamion?: Record<string, TruckDisplayStatus>
  onSeleccionar: (elemento: LayoutElementConUbicacion) => void
  /** Navigate to a truck detail from a playón chip. */
  onSeleccionarCamion?: (truckId: string) => void
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
}: OperationalCanvasProps) {
  const bounds = calcularBounds(resultado)
  const { containerRef, viewport, setViewport, zoomIn, zoomOut, fit, atMinZoom, atMaxZoom } =
    useViewport({ docWidth: bounds.width, docHeight: bounds.height })
  const [hovered, setHovered] = useState<ElementoRender | null>(null)
  const [tooltip, setTooltip] = useState<{ x: number; y: number } | null>(null)
  const dragRef = useRef<{ startX: number; startY: number; vp: Viewport } | null>(null)

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

  const playon = resultado.elementos.find((e) => e.elemento.element_type === "playon")
  const playonScreen = playon ? docToScreen(viewport, playon.elemento.x, playon.elemento.y) : null

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
              </div>
            )
          })}

          {/* Camiones en playón */}
          {playon && playonScreen && camionesEnPlayon.length > 0 ? (
            <div
              className="absolute flex flex-col gap-1"
              style={{
                left: playonScreen.x,
                top: playonScreen.y + (playon.elemento.visual_height ?? 40) * viewport.zoom + 4,
              }}
            >
              {camionesEnPlayon.map((truck) => {
                const estado = estadosCamion?.[truck.id] ?? "in_playon"
                return (
                  <button
                    key={truck.id}
                    type="button"
                    title={`${truck.plate} — ${TRUCK_DISPLAY_STATUS_LABELS[estado]}`}
                    onClick={() => onSeleccionarCamion?.(truck.id)}
                    className={cn(
                      "group flex w-fit cursor-pointer items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium shadow-sm transition-colors",
                      "hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring",
                      TRUCK_DISPLAY_STATUS_CLASS[estado],
                    )}
                  >
                    <Truck className="size-3.5 shrink-0" />
                    {truck.plate}
                  </button>
                )
              })}
            </div>
          ) : null}
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