/**
 * Dashboard service — aggregated KPIs only (Fase 12, ADR 0013).
 *
 * Reads ONLY the dashboard_* views (0005_views.sql v8): ONE aggregated row
 * per organization for metrics, day-aggregated series rows, and occupancy
 * pct rows for charts — the client never receives raw history to compute
 * statistics (operational-dashboard.md §Aggregation views). The views are
 * security_invoker, so the caller needs the module read permissions of the
 * underlying signals; RLS scopes every row to the caller's org.
 *
 * Window semantics: series views return every day; the caller bounds the
 * window with `liquidity_day >= start-of-window` (mirrors the demo adapter
 * in services/demo/dashboardAggregates.ts). Windows are display-only —
 * no client-side aggregation happens.
 */

import type { SupabaseClient } from "@supabase/supabase-js"

import {
  DASHBOARD_METRICS_COLUMNS,
  DASHBOARD_OCCUPANCY_SNAPSHOT_COLUMNS,
  DASHBOARD_SERIES_ARRIVALS_COLUMNS,
  DASHBOARD_SERIES_MERCHANDISE_PROCESSED_COLUMNS,
  DASHBOARD_SERIES_MOVEMENTS_COLUMNS,
  DASHBOARD_SERIES_TRUCKS_PROCESSED_COLUMNS,
} from "@/services/columns"
import type {
  DashboardMetricsRow,
  DashboardOccupancySnapshotRow,
  DashboardSeriesArrivalsRow,
  DashboardSeriesMerchandiseProcessedRow,
  DashboardSeriesMovementsRow,
  DashboardSeriesTrucksProcessedRow,
} from "@/types"
import type { MovementKind } from "@/types/enums"

function requireClient(client: SupabaseClient | null): SupabaseClient {
  if (!client) {
    throw new Error("Supabase no configurado — activá VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY")
  }
  return client
}

/** Chart series identifiers (operational-dashboard.md §Chart series). */
export type SerieTipo = "arrivals" | "movements" | "trucks_processed" | "merchandise_processed"

/** Row of any dashboard_series_* view. */
export type SerieFila =
  | DashboardSeriesArrivalsRow
  | DashboardSeriesMovementsRow
  | DashboardSeriesTrucksProcessedRow
  | DashboardSeriesMerchandiseProcessedRow

export interface SerieFiltros {
  /** Days of history INCLUDING today — [today-(dias-1), today]. Default 30, clamped 1..90. */
  dias?: number
  /** movements only: filter by movement kind. */
  kind?: MovementKind
  /**
   * Explicit full-day window (Reports, T14): `desde` = inclusive day start,
   * `hasta` = exclusive upper edge (start of the NEXT day), both ISO
   * instants. When set, they override `dias`. The dashboard never passes
   * them — behavior is unchanged without them.
   */
  desde?: string
  hasta?: string
}

export interface DashboardService {
  obtenerMetricas(): Promise<DashboardMetricsRow | null>
  obtenerSerie(tipo: SerieTipo, filtros?: SerieFiltros): Promise<SerieFila[]>
  obtenerOcupacionSnapshot(): Promise<DashboardOccupancySnapshotRow[]>
}

/**
 * Inclusive start of the window as ISO: the session-local midnight of
 * today-(dias-1). The SQL views bucket days with day_bucket() (session
 * timezone truncation), so comparing the bucket (a local-midnight
 * timestamptz) against this instant is exactly `liquidity_day >= trunc`.
 */
function ventanaDesde(filtros: SerieFiltros | undefined): string {
  const dias = Math.max(1, Math.min(filtros?.dias ?? 30, 90))
  const inicio = new Date()
  inicio.setDate(inicio.getDate() - (dias - 1))
  inicio.setHours(0, 0, 0, 0)
  return inicio.toISOString()
}

export class SupabaseDashboardService implements DashboardService {
  private readonly client: SupabaseClient | null

  constructor(client: SupabaseClient | null) {
    this.client = client
  }

  async obtenerMetricas(): Promise<DashboardMetricsRow | null> {
    const client = requireClient(this.client)
    const { data, error } = await client
      .from("dashboard_metrics")
      .select(DASHBOARD_METRICS_COLUMNS)
      .limit(1)
      .maybeSingle()
    if (error) throw new Error(`dashboard_metrics: ${error.message}`)
    return (data as DashboardMetricsRow | null) ?? null
  }

  async obtenerSerie(tipo: SerieTipo, filtros?: SerieFiltros): Promise<SerieFila[]> {
    const client = requireClient(this.client)
    const tablas = {
      arrivals: { table: "dashboard_series_arrivals", columns: DASHBOARD_SERIES_ARRIVALS_COLUMNS },
      movements: { table: "dashboard_series_movements", columns: DASHBOARD_SERIES_MOVEMENTS_COLUMNS },
      trucks_processed: {
        table: "dashboard_series_trucks_processed",
        columns: DASHBOARD_SERIES_TRUCKS_PROCESSED_COLUMNS,
      },
      merchandise_processed: {
        table: "dashboard_series_merchandise_processed",
        columns: DASHBOARD_SERIES_MERCHANDISE_PROCESSED_COLUMNS,
      },
    } as const
    const cfg = tablas[tipo]
    let query = client
      .from(cfg.table)
      .select(cfg.columns)
      .gte("liquidity_day", filtros?.desde ?? ventanaDesde(filtros))
    if (filtros?.hasta) query = query.lt("liquidity_day", filtros.hasta)
    if (filtros?.kind) query = query.eq("kind", filtros.kind)
    const { data, error } = await query.order("liquidity_day", { ascending: true })
    if (error) throw new Error(`${cfg.table}: ${error.message}`)
    return (data as unknown as SerieFila[] | null) ?? []
  }

  async obtenerOcupacionSnapshot(): Promise<DashboardOccupancySnapshotRow[]> {
    const client = requireClient(this.client)
    const { data, error } = await client
      .from("dashboard_occupancy_snapshot")
      .select(DASHBOARD_OCCUPANCY_SNAPSHOT_COLUMNS)
      .order("code", { ascending: true })
    if (error) throw new Error(`dashboard_occupancy_snapshot: ${error.message}`)
    return (data as DashboardOccupancySnapshotRow[] | null) ?? []
  }
}