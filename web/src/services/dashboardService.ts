/**
 * Dashboard service — aggregated KPIs only (Fase 12, ADR 0013).
 *
 * Reads the dashboard_metrics view (0005_views.sql v8): ONE aggregated row
 * per organization — the client never receives raw history to compute
 * statistics (operational-dashboard.md §Aggregation views). The view is
 * security_invoker, so the caller needs the module read permissions of the
 * underlying signals; RLS scopes the row to the caller's org.
 */

import type { SupabaseClient } from "@supabase/supabase-js"

import { DASHBOARD_METRICS_COLUMNS } from "@/services/columns"
import type { DashboardMetricsRow } from "@/types"

function requireClient(client: SupabaseClient | null): SupabaseClient {
  if (!client) {
    throw new Error("Supabase no configurado — activá VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY")
  }
  return client
}

export interface DashboardService {
  obtenerMetricas(): Promise<DashboardMetricsRow | null>
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
}