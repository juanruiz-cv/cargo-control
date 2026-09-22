import { useEffect, useState } from "react"
import {
  ArrowDownUpIcon,
  ArrowLeftIcon,
  ArrowRightLeftIcon,
  CheckIcon,
  InboxIcon,
  LogOutIcon,
  PencilIcon,
  ScanLineIcon,
  ScaleIcon,
  ShieldAlertIcon,
  Truck,
  type LucideIcon,
} from "lucide-react"
import { toast } from "sonner"

import { getServices } from "@/services"
import type { MovementFiltros } from "@/services/shared"
import type { MovementKind, MovementRow } from "@/types"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { EmptyState } from "@/components/shared/EmptyState"
import { ErrorState } from "@/components/shared/ErrorState"
import { LoadingState } from "@/components/shared/LoadingState"
import { MOVEMENT_KIND_LABELS, formatFecha } from "@/components/trucks/truckStatus"
import { MovementDetailDrawer } from "@/components/cargo/MovementDetailDrawer"

const LIMITE_TIMELINE = 50

/** Kind → accent style for the timeline cards (UX, movements-timeline.md). */
export const GRUPO_KIND: Record<MovementKind, { icono: LucideIcon; clase: string }> = {
  arrival: { icono: ArrowLeftIcon, clase: "bg-sky-500/10 text-sky-600" },
  discharge: { icono: Truck, clase: "bg-amber-500/10 text-amber-600" },
  split: { icono: ArrowDownUpIcon, clase: "bg-violet-500/10 text-violet-600" },
  store: { icono: InboxIcon, clase: "bg-slate-500/10 text-slate-600" },
  correction: { icono: PencilIcon, clase: "bg-slate-500/10 text-slate-600" },
  transfer: { icono: ArrowRightLeftIcon, clase: "bg-blue-500/10 text-blue-600" },
  load_out: { icono: LogOutIcon, clase: "bg-orange-500/10 text-orange-600" },
  return_to_truck: { icono: Truck, clase: "bg-blue-500/10 text-blue-600" },
  scan_in: { icono: ScanLineIcon, clase: "bg-emerald-500/10 text-emerald-600" },
  scan_out: { icono: ScanLineIcon, clase: "bg-emerald-500/10 text-emerald-600" },
  scale: { icono: ScaleIcon, clase: "bg-emerald-500/10 text-emerald-600" },
  quarantine: { icono: ShieldAlertIcon, clase: "bg-red-500/10 text-red-600" },
  seizure: { icono: ShieldAlertIcon, clase: "bg-red-500/10 text-red-600" },
  release: { icono: CheckIcon, clase: "bg-green-500/10 text-green-600" },
  egress: { icono: LogOutIcon, clase: "bg-sky-500/10 text-sky-600" },
}

interface MovementsTimelineProps {
  /** Pre-loaded movements (ManifestDetailPage passes its own to avoid a second read). */
  movimientos?: MovementRow[]
  /** Fetch scope; when omitted the timeline is the global facility-scoped view. */
  manifestId?: string
  /** Extra filters (kind/camion/since/until) — combined with `manifestId`. */
  filtros?: Omit<MovementFiltros, "manifestId">
  titulo?: string
  vacio?: string
}

/**
 * Movement timeline (movements-timeline.md). Latest first; only the detail
 * is loaded on demand (drawer → obtenerMovimiento) — never per-card reads.
 * When used standalone it fetches the current page and appends "Ver más"
 * (bounded 50/page); embedded (movimientos prop) it renders without paging.
 */
export function MovementsTimeline({
  movimientos,
  manifestId,
  filtros,
  titulo = "Movimientos",
  vacio = "Todavía no hay movimientos registrados.",
}: MovementsTimelineProps) {
  const [rows, setRows] = useState<MovementRow[]>(movimientos ?? [])
  const [codigos, setCodigos] = useState<Map<string, string>>(new Map())
  const [cargando, setCargando] = useState(movimientos === undefined)
  const [error, setError] = useState<string | null>(null)
  const [cargandoMas, setCargandoMas] = useState(false)
  const [reintento, setReintento] = useState(0)
  const [activoId, setActivoId] = useState<number | null>(null)
  const [detalleAbierto, setDetalleAbierto] = useState(false)

  useEffect(() => {
    setRows(movimientos ?? [])
  }, [movimientos])

  useEffect(() => {
    if (movimientos !== undefined) return
    let activo = true
    setCargando(true)
    setError(null)
    const cargar = async () => {
      try {
        const [movs, manifests] = await Promise.all([
          getServices().movements.listarMovimientos({
            manifestId,
            ...filtros,
            limit: LIMITE_TIMELINE,
          }),
          // Codes only for the global view; the manifest scope knows its code.
          manifestId
            ? Promise.resolve([])
            : Promise.resolve(
                getServices().cargo.listarManifests({ limit: 100 }).catch(() => [] as { id: string; code: string }[]),
              ),
        ])
        if (!activo) return
        setRows(movs)
        setCodigos(new Map(manifests.map((m) => [m.id, m.code])))
        setCargando(false)
      } catch (cause) {
        if (!activo) return
        setError(cause instanceof Error ? cause.message : String(cause))
        setCargando(false)
      }
    }
    void cargar()
    return () => {
      activo = false
    }
  }, [manifestId, filtros, movimientos, reintento])

  const verMas = async () => {
    setCargandoMas(true)
    try {
      const mas = await getServices().movements.listarMovimientos({
        manifestId,
        ...filtros,
        limit: LIMITE_TIMELINE,
        offset: rows.length,
      })
      setRows((prev) => [...prev, ...mas])
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setCargandoMas(false)
    }
  }

  const abrirDetalle = (movimiento: MovementRow) => {
    setActivoId(movimiento.id)
    setDetalleAbierto(true)
  }

  if (cargando) return <LoadingState rows={4} label="Cargando movimientos" />
  if (error) {
    return (
      <ErrorState
        title="No se pudieron cargar los movimientos"
        description={error}
        action={<Button onClick={() => setReintento((r) => r + 1)}>Reintentar</Button>}
      />
    )
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{titulo}</CardTitle>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <EmptyState title="Sin movimientos" description={vacio} />
          ) : (
            <div className="space-y-3">
              <ul className="divide-y divide-border">
                {rows.map((mov) => {
                  const grupo = GRUPO_KIND[mov.kind]
                  const Icono = grupo.icono
                  return (
                    <li key={mov.id}>
                      <button
                        type="button"
                        onClick={() => abrirDetalle(mov)}
                        className="group flex w-full flex-wrap items-center justify-between gap-2 py-2.5 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/40"
                        aria-label={`Ver detalle del movimiento ${MOVEMENT_KIND_LABELS[mov.kind]}`}
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <span
                            className={`inline-flex size-7 shrink-0 items-center justify-center rounded-full ${grupo.clase}`}
                          >
                            <Icono className="size-4" />
                          </span>
                          <span className="font-medium text-foreground group-hover:underline">
                            {MOVEMENT_KIND_LABELS[mov.kind]}
                          </span>
                          {codigos.get(mov.manifest_id ?? "") ?? mov.manifest_id ? (
                            <span className="truncate text-sm text-muted-foreground">
                              {codigos.get(mov.manifest_id ?? "") ?? mov.manifest_id}
                            </span>
                          ) : null}
                        </div>
                        <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                          <span>{formatFecha(mov.occurred_at)}</span>
                          {mov.operator_id ? <span>Op. {mov.operator_id}</span> : null}
                        </div>
                        {mov.reason ? (
                          <p className="w-full pl-9 text-sm text-muted-foreground">Motivo: {mov.reason}</p>
                        ) : null}
                      </button>
                    </li>
                  )
                })}
              </ul>
              {movimientos === undefined && rows.length % LIMITE_TIMELINE === 0 ? (
                <div className="flex justify-center">
                  <Button variant="outline" onClick={() => void verMas()} disabled={cargandoMas}>
                    {cargandoMas ? "Cargando…" : "Ver más"}
                  </Button>
                </div>
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>

      <MovementDetailDrawer
        abierto={detalleAbierto}
        onAbiertoChange={setDetalleAbierto}
        movimientoId={activoId}
      />
    </>
  )
}