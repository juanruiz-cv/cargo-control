/**
 * Dashboard chart cards (Fase 12, ADR 0013) — the 5 chart widgets of
 * operational-dashboard.md §Charts, rendering ONLY server-aggregated rows
 * (never raw history). Per-chart failure isolation: an error card retries
 * itself, a healthy sibling keeps rendering — no full-page no-data that
 * hides live charts (QA DB-52/DB-60, professional-ux §9).
 */

import type { ReactNode } from "react"
import { RotateCcwIcon } from "lucide-react"

import { MOVEMENT_KIND_LABELS } from "@/components/trucks/truckStatus"
import { BarsChart, StackedBarsChart, type BarPoint } from "@/components/dashboard/ChartBars"
import { OcupacionBars, type OcupacionBarRow } from "@/components/dashboard/OcupacionBars"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { SerieFila, SerieTipo } from "@/services/dashboardService"
import type {
  DashboardOccupancySnapshotRow,
  DashboardSeriesArrivalsRow,
  DashboardSeriesMerchandiseProcessedRow,
  DashboardSeriesMovementsRow,
  DashboardSeriesTrucksProcessedRow,
  MovementKind,
} from "@/types"

export interface EstadoSerie {
  filas: SerieFila[]
  cargando: boolean
  error: string | null
}

export interface EstadoOcupacion {
  filas: DashboardOccupancySnapshotRow[]
  cargando: boolean
  error: string | null
}

interface DashboardChartsProps {
  ventana: number
  series: Partial<Record<SerieTipo, EstadoSerie>>
  ocupacion: EstadoOcupacion
  onRetrySerie: (tipo: SerieTipo) => void
  onRetryOcupacion: () => void
}

const entero = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 })

/** Local calendar-day key of an ISO timestamp — matches the demo day_bucket. */
function claveDiaLocal(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

function etiquetaDia(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`
}

/** Full window day axis (today at the end) — zero days are explicit, never gaps. */
function diasDeVentana(ventana: number): { key: string; label: string }[] {
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  const dias: { key: string; label: string }[] = []
  for (let i = ventana - 1; i >= 0; i--) {
    const d = new Date(hoy)
    d.setDate(hoy.getDate() - i)
    dias.push({ key: claveDiaLocal(d.toISOString()), label: etiquetaDia(d.toISOString()) })
  }
  return dias
}

const PALETA = [
  { fill: "fill-info", bg: "bg-info" },
  { fill: "fill-success", bg: "bg-success" },
  { fill: "fill-warning", bg: "bg-warning" },
  { fill: "fill-danger", bg: "bg-danger" },
  { fill: "fill-primary", bg: "bg-primary" },
  { fill: "fill-foreground", bg: "bg-foreground" },
  { fill: "fill-muted-foreground", bg: "bg-muted-foreground" },
  { fill: "fill-secondary-foreground", bg: "bg-secondary-foreground" },
]

interface GraficoCardProps {
  title: string
  description: string
  estado: { cargando: boolean; error: string | null }
  vacio: boolean
  onRetry: () => void
  children: ReactNode
  tabla?: ReactNode
}

function GraficoCard({ title, description, estado, vacio, onRetry, children, tabla }: GraficoCardProps) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {estado.error ? (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-danger/30 bg-danger/5 px-4 py-6 text-center">
            <span className="text-sm text-danger">No se pudo cargar este gráfico.</span>
            <Button size="sm" variant="outline" onClick={onRetry}>
              <RotateCcwIcon />
              Reintentar
            </Button>
          </div>
        ) : estado.cargando ? (
          <div className="h-44 animate-pulse rounded-lg bg-muted/60" aria-hidden="true" />
        ) : vacio ? (
          <div className="flex flex-col items-center gap-1.5 rounded-lg border border-dashed border-border bg-muted/30 px-4 py-8 text-center">
            <span className="text-sm font-medium text-foreground">Sin datos en este período</span>
            <span className="text-xs text-muted-foreground">No hay registros en la ventana seleccionada.</span>
          </div>
        ) : (
          <>
            <div>{children}</div>
            {tabla}
          </>
        )}
      </CardContent>
    </Card>
  )
}

function TablaToggle({ children }: { children: ReactNode }) {
  return (
    <details className="group mt-1">
      <summary className="cursor-pointer select-none text-xs font-medium text-muted-foreground transition-colors hover:text-foreground">
        Ver tabla de datos
      </summary>
      <div className="mt-2 overflow-x-auto rounded-lg border border-border">
        {children}
      </div>
    </details>
  )
}

function Tabla({ encabezados, filas }: { encabezados: string[]; filas: (string | number)[][] }) {
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="border-b border-border bg-muted/50 text-left text-muted-foreground">
          {encabezados.map((h) => (
            <th key={h} className="px-3 py-1.5 font-medium">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {filas.map((fila, i) => (
          <tr key={i} className="border-b border-border/60 last:border-0">
            {fila.map((celda, j) => (
              <td key={j} className="px-3 py-1.5 tabular-nums">
                {celda}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function DashboardCharts({
  ventana,
  series,
  ocupacion,
  onRetrySerie,
  onRetryOcupacion,
}: DashboardChartsProps) {
  const ejes = diasDeVentana(ventana)

  // --- 1. Ingresos por día ---
  const ingresosPorDia = new Map(
    (series.arrivals?.filas ?? []).map((f) => {
      const fila = f as DashboardSeriesArrivalsRow
      return [claveDiaLocal(fila.liquidity_day), fila.arrivals] as const
    }),
  )
  const ingresos: BarPoint[] = ejes.map((d) => ({ label: d.label, value: ingresosPorDia.get(d.key) ?? 0 }))

  // --- 2. Movimientos por día+kind ---
  const kindPorDia = new Map<string, Map<MovementKind, number>>()
  for (const f of series.movements?.filas ?? []) {
    const fila = f as DashboardSeriesMovementsRow
    const dia = claveDiaLocal(fila.liquidity_day)
    let kinds = kindPorDia.get(dia)
    if (!kinds) {
      kinds = new Map()
      kindPorDia.set(dia, kinds)
    }
    kinds.set(fila.kind, (kinds.get(fila.kind) ?? 0) + fila.movements)
  }
  const kindsPresentes = [
    ...new Set((series.movements?.filas ?? []).map((f) => (f as DashboardSeriesMovementsRow).kind)),
  ].sort((a, b) => (MOVEMENT_KIND_LABELS[a] ?? a).localeCompare(MOVEMENT_KIND_LABELS[b] ?? b))
  const movimientos = ejes.map((d) => ({
    label: d.label,
    parts: kindsPresentes
      .map((kind) => ({ label: MOVEMENT_KIND_LABELS[kind] ?? kind, value: kindPorDia.get(d.key)?.get(kind) ?? 0 }))
      .filter((p) => p.value > 0),
  }))

  // --- 4/5. Procesados ---
  const camionesPorDia = new Map(
    (series.trucks_processed?.filas ?? []).map((f) => {
      const fila = f as DashboardSeriesTrucksProcessedRow
      return [claveDiaLocal(fila.liquidity_day), fila.trucks_processed] as const
    }),
  )
  const camiones: BarPoint[] = ejes.map((d) => ({ label: d.label, value: camionesPorDia.get(d.key) ?? 0 }))
  const mercaderiaPorDia = new Map(
    (series.merchandise_processed?.filas ?? []).map((f) => {
      const fila = f as DashboardSeriesMerchandiseProcessedRow
      return [claveDiaLocal(fila.liquidity_day), fila.merchandise_processed] as const
    }),
  )
  const mercaderia: BarPoint[] = ejes.map((d) => ({ label: d.label, value: mercaderiaPorDia.get(d.key) ?? 0 }))

  // --- 3. Ocupación por sector ---
  interface Dimension {
    pct: number
    unidad: string
    ocupado: number
  }
  const filasOcupacion: OcupacionBarRow[] = ocupacion.filas
    .map((r) => {
      const dims: Dimension[] = []
      if (r.pct_kg !== null) dims.push({ pct: r.pct_kg, unidad: "kg", ocupado: r.occupancy_kg })
      if (r.pct_m3 !== null) dims.push({ pct: r.pct_m3, unidad: "m³", ocupado: r.occupancy_m3 })
      if (r.pct_units !== null)
        dims.push({ pct: r.pct_units, unidad: "unidades", ocupado: r.occupancy_units })
      if (dims.length === 0) return null
      const mejor = dims.reduce((a, b) => (b.pct > a.pct ? b : a))
      return { code: r.code, pct: mejor.pct, unidad: mejor.unidad, ocupado: mejor.ocupado }
    })
    .filter((row): row is OcupacionBarRow => row !== null)
    .sort((a, b) => b.pct - a.pct)

  const totalIngresos = ingresos.reduce((acc, p) => acc + p.value, 0)
  const totalMovimientos = movimientos.reduce((acc, p) => acc + p.parts.reduce((s, part) => s + part.value, 0), 0)
  const totalCamiones = camiones.reduce((acc, p) => acc + p.value, 0)
  const totalMercaderia = mercaderia.reduce((acc, p) => acc + p.value, 0)

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <GraficoCard
        title="Ingresos por día"
        description={`Camiones que llegaron · últimos ${ventana} días`}
        estado={series.arrivals ?? { filas: [], cargando: false, error: null }}
        vacio={totalIngresos === 0}
        onRetry={() => onRetrySerie("arrivals")}
        tabla={
          <TablaToggle>
            <Tabla
              encabezados={["Día", "Ingresos"]}
              filas={ingresos.map((p) => [p.label, p.value])}
            />
          </TablaToggle>
        }
      >
        <BarsChart
          points={ingresos}
          formatter={(n) => entero.format(n)}
          ariaLabel="Ingresos de camiones por día"
          barLabel={(p) => `${p.label}: ${entero.format(p.value)} ingresos`}
        />
      </GraficoCard>

      <GraficoCard
        title="Movimientos por día"
        description={`Operaciones registradas por tipo · últimos ${ventana} días`}
        estado={series.movements ?? { filas: [], cargando: false, error: null }}
        vacio={totalMovimientos === 0}
        onRetry={() => onRetrySerie("movements")}
        tabla={
          <TablaToggle>
            <Tabla
              encabezados={["Día", "Tipo", "Cantidad"]}
              filas={movimientos.flatMap((p) =>
                p.parts.map((part) => [p.label, part.label, part.value]),
              )}
            />
          </TablaToggle>
        }
      >
        <>
          <StackedBarsChart
            points={movimientos}
            formatter={(n) => entero.format(n)}
            ariaLabel="Movimientos por día, apilados por tipo de operación"
            palette={PALETA.map((c) => c.fill)}
            barLabel={(label, partLabel, value) =>
              `${label} · ${partLabel}: ${entero.format(value)}`
            }
          />
          {kindsPresentes.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
              {kindsPresentes.map((kind, i) => (
                <span key={kind} className="inline-flex items-center gap-1.5">
                  <span className={`size-2.5 rounded-sm ${PALETA[i % PALETA.length].bg}`} />
                  {MOVEMENT_KIND_LABELS[kind] ?? kind}
                </span>
              ))}
            </div>
          ) : null}
        </>
      </GraficoCard>

      <GraficoCard
        title="Ocupación por sector"
        description="Estado actual de ubicaciones con capacidad"
        estado={ocupacion}
        vacio={ocupacion.filas.length === 0}
        onRetry={onRetryOcupacion}
        tabla={
          <TablaToggle>
            <Tabla
              encabezados={["Ubicación", "Ocupación", "Unidad"]}
              filas={filasOcupacion.map((r) => [r.code, `${r.pct}%`, `${entero.format(r.ocupado)} ${r.unidad}`])}
            />
          </TablaToggle>
        }
      >
        <OcupacionBars
          rows={filasOcupacion}
          formatter={(n) => entero.format(n)}
          ariaLabel="Porcentaje de ocupación por sector"
        />
      </GraficoCard>

      <GraficoCard
        title="Camiones procesados"
        description={`Egresos de camiones · últimos ${ventana} días`}
        estado={series.trucks_processed ?? { filas: [], cargando: false, error: null }}
        vacio={totalCamiones === 0}
        onRetry={() => onRetrySerie("trucks_processed")}
        tabla={
          <TablaToggle>
            <Tabla
              encabezados={["Día", "Camiones"]}
              filas={camiones.map((p) => [p.label, p.value])}
            />
          </TablaToggle>
        }
      >
        <BarsChart
          points={camiones}
          formatter={(n) => entero.format(n)}
          ariaLabel="Camiones procesados por día"
          barLabel={(p) => `${p.label}: ${entero.format(p.value)} camiones`}
        />
      </GraficoCard>

      <GraficoCard
        title="Mercadería procesada"
        description={`Unidades movidas · últimos ${ventana} días`}
        estado={series.merchandise_processed ?? { filas: [], cargando: false, error: null }}
        vacio={totalMercaderia === 0}
        onRetry={() => onRetrySerie("merchandise_processed")}
        tabla={
          <TablaToggle>
            <Tabla
              encabezados={["Día", "Unidades"]}
              filas={mercaderia.map((p) => [p.label, p.value])}
            />
          </TablaToggle>
        }
      >
        <BarsChart
          points={mercaderia}
          formatter={(n) => entero.format(n)}
          ariaLabel="Mercadería procesada por día"
          barLabel={(p) => `${p.label}: ${entero.format(p.value)} unidades`}
        />
      </GraficoCard>
    </div>
  )
}