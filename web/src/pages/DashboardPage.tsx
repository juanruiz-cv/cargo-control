/**
 * Dashboard operativo (Fase 12, ADR 0013) — operational-dashboard.md.
 *
 * Renders ONLY server-aggregated data (dashboard_metrics, dashboard_series_*,
 * dashboard_occupancy_snapshot): the client never computes statistics from
 * raw history. Cards are gated per module read code (kpisVisibles) — a card
 * the session cannot read is hidden, never zeroed. Charts fail in isolation
 * with their own retry; the KPIs keep their own loading/error states.
 *
 * Refresh contract: the map has no live change signal (it loads once per
 * facility change), so the dashboard replicates that mechanism — load on
 * facility change + explicit manual refresh ("última actualización"). KPIs
 * could later subscribe to a shared change signal if one is introduced.
 */

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  BoxesIcon,
  Clock3Icon,
  GaugeIcon,
  LayoutGridIcon,
  LockIcon,
  PackageOpenIcon,
  RefreshCwIcon,
  ScanLineIcon,
  ScaleIcon,
  ShieldAlertIcon,
  TruckIcon,
  WarehouseIcon,
} from "lucide-react"

import {
  KPI_CARDS,
  kpisVisibles,
  type KpiCardDef,
  type KpiCardId,
} from "@/components/dashboard/kpiCards"
import {
  DashboardCharts,
  type EstadoOcupacion,
  type EstadoSerie,
} from "@/components/dashboard/DashboardCharts"
import { PageHeader } from "@/components/shared/PageHeader"
import { LoadingState } from "@/components/shared/LoadingState"
import { ErrorState } from "@/components/shared/ErrorState"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useAuth } from "@/integrations/auth/useAuth"
import { useFacilityId } from "@/hooks/useFacilityId"
import { getServices } from "@/services"
import type { SerieFila, SerieTipo } from "@/services/dashboardService"
import type {
  DashboardMetricsRow,
  DashboardOccupancySnapshotRow,
} from "@/types"

const VENTANAS = [7, 15, 30, 90] as const

const ICONOS: Record<KpiCardId, typeof TruckIcon> = {
  trucks_in_yard: TruckIcon,
  trucks_waiting: Clock3Icon,
  trucks_discharging: PackageOpenIcon,
  merchandise_stored: WarehouseIcon,
  merchandise_in_scanner: ScanLineIcon,
  merchandise_in_scale: ScaleIcon,
  merchandise_in_quarantine: ShieldAlertIcon,
  merchandise_seized: LockIcon,
  sectors_occupied: BoxesIcon,
  sectors_free: LayoutGridIcon,
}

function TarjetaKpi({ def, metricas }: { def: KpiCardDef; metricas: DashboardMetricsRow }) {
  const Icon = ICONOS[def.id]
  const { valor, detalle } = def.format(metricas)
  return (
    <Card size="sm">
      <CardContent className="flex flex-col gap-2.5">
        <span className="flex size-8 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Icon className="size-4" aria-hidden="true" />
        </span>
        <p className="text-2xl leading-none font-semibold tabular-nums text-foreground">{valor}</p>
        <div>
          <p className="text-sm font-medium text-foreground">{def.label}</p>
          {detalle ? <p className="text-xs text-muted-foreground">{detalle}</p> : null}
        </div>
      </CardContent>
    </Card>
  )
}

function sectorConTarjeta(cluster: string): string {
  return (
    {
      Camiones: "Flota presente en el predio",
      Mercadería: "Carga en proceso y retenciones",
      Sectores: "Ubicaciones del layout publicado",
    }[cluster] ?? ""
  )
}

export function DashboardPage() {
  const { hasPermission, isDemo } = useAuth()
  const { facilityId, loading: facilityLoading } = useFacilityId()

  const visibles = useMemo(() => kpisVisibles(hasPermission), [hasPermission])

  // --- KPIs ---
  const [kpis, setKpis] = useState<DashboardMetricsRow | null>(null)
  const [kpisCargando, setKpisCargando] = useState(true)
  const [kpisError, setKpisError] = useState<string | null>(null)

  // --- Series (per-chart state) ---
  const [series, setSeries] = useState<Partial<Record<SerieTipo, SerieFila[]>>>({})
  const [seriesCargando, setSeriesCargando] = useState<Record<SerieTipo, boolean>>({
    arrivals: true,
    movements: true,
    trucks_processed: true,
    merchandise_processed: true,
  })
  const [seriesErrores, setSeriesErrores] = useState<Partial<Record<SerieTipo, string>>>({})

  // --- Ocupación ---
  const [ocupacion, setOcupacion] = useState<DashboardOccupancySnapshotRow[]>([])
  const [ocupacionCargando, setOcupacionCargando] = useState(true)
  const [ocupacionError, setOcupacionError] = useState<string | null>(null)

  const [ventana, setVentana] = useState<number>(30)
  const [revision, setRevision] = useState(0)
  const [ultimaActualizacion, setUltimaActualizacion] = useState<Date | null>(null)

  const cargarSerie = useCallback(async (tipo: SerieTipo, dias: number) => {
    setSeriesCargando((s) => ({ ...s, [tipo]: true }))
    setSeriesErrores((e) => ({ ...e, [tipo]: null }))
    try {
      const filas = await getServices().dashboard.obtenerSerie(tipo, { dias })
      setSeries((s) => ({ ...s, [tipo]: filas }))
    } catch (cause) {
      setSeriesErrores((e) => ({
        ...e,
        [tipo]: cause instanceof Error ? cause.message : String(cause),
      }))
    } finally {
      setSeriesCargando((s) => ({ ...s, [tipo]: false }))
    }
  }, [])

  useEffect(() => {
    if (!facilityId) return
    let cancelled = false

    const cargarKpis = async () => {
      setKpisCargando(true)
      setKpisError(null)
      try {
        const metricas = await getServices().dashboard.obtenerMetricas()
        if (cancelled) return
        setKpis(metricas)
        setUltimaActualizacion(new Date())
      } catch (cause) {
        if (!cancelled) {
          setKpisError(cause instanceof Error ? cause.message : String(cause))
        }
      } finally {
        if (!cancelled) setKpisCargando(false)
      }
    }

    const cargarOcupacion = async () => {
      setOcupacionCargando(true)
      setOcupacionError(null)
      try {
        const filas = await getServices().dashboard.obtenerOcupacionSnapshot()
        if (!cancelled) setOcupacion(filas)
      } catch (cause) {
        if (!cancelled) {
          setOcupacionError(cause instanceof Error ? cause.message : String(cause))
        }
      } finally {
        if (!cancelled) setOcupacionCargando(false)
      }
    }

    void cargarKpis()
    void cargarOcupacion()
    void cargarSerie("arrivals", ventana)
    void cargarSerie("movements", ventana)
    void cargarSerie("trucks_processed", ventana)
    void cargarSerie("merchandise_processed", ventana)

    return () => {
      cancelled = true
    }
  }, [facilityId, ventana, revision, cargarSerie])

  if (facilityLoading || (facilityId && (kpisCargando || ocupacionCargando) && kpis === null && ocupacion.length === 0 && !kpisError && !ocupacionError)) {
    return (
      <div className="flex flex-col gap-4">
        <PageHeader title="Dashboard operativo" description="Indicadores operativos agregados del predio." />
        <LoadingState rows={6} label="Cargando dashboard" />
      </div>
    )
  }

  if (!facilityId) {
    return (
      <div className="flex flex-col gap-4">
        <PageHeader title="Dashboard operativo" description="Indicadores operativos agregados del predio." />
        <ErrorState description="No se encontró ninguna facilidad activa para mostrar el dashboard." />
      </div>
    )
  }

  // A session without a single dashboard read cannot see ANY card (DB-52).
  if (visibles.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <PageHeader title="Dashboard operativo" description="Indicadores operativos agregados del predio." />
        <ErrorState
          title="Sin permisos de dashboard"
          description="Tu cuenta no tiene permisos de lectura sobre ningún módulo del predio."
        />
      </div>
    )
  }

  const estadosSerie: Partial<Record<SerieTipo, EstadoSerie>> = {
    arrivals: {
      filas: series.arrivals ?? [],
      cargando: seriesCargando.arrivals,
      error: seriesErrores.arrivals ?? null,
    },
    movements: {
      filas: series.movements ?? [],
      cargando: seriesCargando.movements,
      error: seriesErrores.movements ?? null,
    },
    trucks_processed: {
      filas: series.trucks_processed ?? [],
      cargando: seriesCargando.trucks_processed,
      error: seriesErrores.trucks_processed ?? null,
    },
    merchandise_processed: {
      filas: series.merchandise_processed ?? [],
      cargando: seriesCargando.merchandise_processed,
      error: seriesErrores.merchandise_processed ?? null,
    },
  }
  const estadoOcupacion: EstadoOcupacion = {
    filas: ocupacion,
    cargando: ocupacionCargando,
    error: ocupacionError,
  }

  const clusters = ["Camiones", "Mercadería", "Sectores"] as const

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Dashboard operativo"
        description="Indicadores agregados del predio, calculados por el servidor."
        actions={
          <>
            {isDemo ? <Badge variant="outline">Demo</Badge> : null}
            <Select
              value={String(ventana)}
              onValueChange={(v) => setVentana(Number(v))}
            >
              <SelectTrigger className="w-40" aria-label="Ventana de días de los gráficos">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VENTANAS.map((d) => (
                  <SelectItem key={d} value={String(d)}>
                    Últimos {d} días
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={() => setRevision((r) => r + 1)}>
              <RefreshCwIcon />
              Actualizar
            </Button>
            {ultimaActualizacion ? (
              <Badge variant="secondary">
                {ultimaActualizacion.toLocaleTimeString("es-AR", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </Badge>
            ) : null}
          </>
        }
      />

      {/* KPIs — 10 cards in 3 clusters, per-card permission gating */}
      {kpisError ? (
        <ErrorState
          title="No se pudieron cargar los indicadores"
          description={kpisError}
          action={
            <Button variant="outline" onClick={() => setRevision((r) => r + 1)}>
              <RefreshCwIcon />
              Reintentar
            </Button>
          }
        />
      ) : kpis && !kpisCargando ? (
        <div className="flex flex-col gap-4">
          {clusters.map((cluster) => {
            const delCluster = visibles.filter((c) => c.cluster === cluster)
            if (delCluster.length === 0) return null
            return (
              <section key={cluster} aria-labelledby={`cluster-${cluster}`} className="flex flex-col gap-2.5">
                <div>
                  <h2 id={`cluster-${cluster}`} className="text-sm font-semibold text-foreground">
                    {cluster}
                  </h2>
                  <p className="text-xs text-muted-foreground">{sectorConTarjeta(cluster)}</p>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
                  {delCluster.map((def) => (
                    <TarjetaKpi key={def.id} def={def} metricas={kpis} />
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4" aria-hidden="true">
          {Array.from({ length: Math.min(visibles.length, 8) }, (_, index) => (
            <Card key={index} size="sm">
              <CardContent className="flex flex-col gap-2.5">
                <div className="size-8 animate-pulse rounded-lg bg-muted" />
                <div className="h-7 w-16 animate-pulse rounded bg-muted" />
                <div className="h-3 w-32 animate-pulse rounded bg-muted" />
                <div className="h-3 w-24 animate-pulse rounded bg-muted" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Charts — server-aggregated series; each card retries in isolation */}
      <section aria-label="Gráficos del dashboard" className="flex flex-col gap-2.5">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Gráficos</h2>
          <p className="text-xs text-muted-foreground">
            Series diarias agregadas · datos del servidor, no del navegador
          </p>
        </div>
        <DashboardCharts
          ventana={ventana}
          series={estadosSerie}
          ocupacion={estadoOcupacion}
          onRetrySerie={(tipo) => void cargarSerie(tipo, ventana)}
          onRetryOcupacion={() => {
            setOcupacionCargando(true)
            setOcupacionError(null)
            void getServices()
              .dashboard.obtenerOcupacionSnapshot()
              .then((filas) => setOcupacion(filas))
              .catch((cause) =>
                setOcupacionError(cause instanceof Error ? cause.message : String(cause)),
              )
              .finally(() => setOcupacionCargando(false))
          }}
        />
      </section>

      <footer className="flex items-center justify-between border-t border-border pt-3 text-xs text-muted-foreground">
        <span>
          Todos los indicadores se calculan sobre las vistas agregadas del servidor; los datos
          históricos crudos nunca llegan al navegador.
        </span>
        <span className="inline-flex items-center gap-1.5">
          <GaugeIcon className="size-3.5" aria-hidden="true" />
          {KPI_CARDS.length} indicadores
        </span>
      </footer>
    </div>
  )
}