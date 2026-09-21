/**
 * Read-side view rows — Cargo Control frontend.
 *
 * Mirror of supabase/migrations/0005_views.sql (v3/v6/v8). All views are
 * `security_invoker = true`, so the base tables' RLS policies apply; the
 * client only ever receives aggregated/derived rows.
 */

import type { ItemLotStatus, MovementKind } from "@/types/enums"

/** v3: location_occupancy (capacity-occupancy.md §6) — one row per location. */
export interface LocationOccupancyRow {
  location_id: string
  organization_id: string
  facility_id: string
  code: string
  occupancy_kg: number
  occupancy_m3: number
  occupancy_units: number
  missing_weight_lots: number // lots without weight data (flagged, not zeroed)
  missing_volume_lots: number // lots without volume data (flagged, not zeroed)
  capacity_max_kg: number | null
  capacity_max_volume_m3: number | null
  capacity_max_units: number | null
  available_kg: number | null
  available_m3: number | null
  available_units: number | null
  pct_kg: number | null // null when capacity is null (unlimited)
  pct_m3: number | null
  pct_units: number | null
}

/**
 * v6: station_queue — lots placed at a scan/scale checkpoint without a
 * completed operation row FOR THAT PLACEMENT (special-areas.md §Derived
 * views).
 */
export interface StationQueueRow {
  queue_kind: "scan" | "scale"
  item_lot_id: string
  organization_id: string
  manifest_id: string
  cargo_item_id: string
  lot_status: ItemLotStatus
  quantity: number
  uom: string
  checkpoint_location_id: string
  checkpoint_code: string
  sku: string | null
  item_description: string
  manifest_code: string
  truck_id: string | null
  created_at: string
}

/** v6: hold_open — open rezago/secuestro cases with lot/item/manifest context. */
export interface HoldOpenRow {
  hold_type: "quarantine" | "seizure"
  operation_id: string
  organization_id: string
  item_lot_id: string
  status: "open" | "resolved" | "released"
  reason: string | null // null for seizure rows
  legal_ref: string | null // null for quarantine rows
  opened_by: string
  opened_at: string
  resolution_note: string | null
  manifest_id: string
  cargo_item_id: string
  current_location_id: string | null
  current_truck_id: string | null
  lot_status: ItemLotStatus
  quantity: number
  uom: string
  sku: string | null
  item_description: string
  manifest_code: string
}

/**
 * v8: dashboard_metrics — the 10 KPI values as one aggregated row per
 * organization (operational-dashboard.md §Metric derivations).
 */
export interface DashboardMetricsRow {
  organization_id: string
  trucks_in_yard: number
  trucks_waiting: number
  trucks_discharging: number
  merchandise_stored: number // Σ qty of in_warehouse lots
  merchandise_stored_weight_kg: number
  merchandise_in_scanner: number
  merchandise_in_scale: number
  merchandise_in_quarantine: number
  merchandise_seized: number
  sectors_occupied: number
  sectors_free: number
}

/** v8: dashboard_series_arrivals — daily arrival counts. */
export interface DashboardSeriesArrivalsRow {
  organization_id: string
  liquidity_day: string // day_bucket(occurred_at), session timezone
  arrivals: number
}

/** v8: dashboard_series_movements — daily movement counts per kind. */
export interface DashboardSeriesMovementsRow {
  organization_id: string
  liquidity_day: string
  kind: MovementKind
  movements: number
}

/** v8: dashboard_series_trucks_processed — distinct trucks per day with egress. */
export interface DashboardSeriesTrucksProcessedRow {
  organization_id: string
  liquidity_day: string
  trucks_processed: number
}

/** v8: dashboard_series_merchandise_processed — Σ movement_items.quantity per day. */
export interface DashboardSeriesMerchandiseProcessedRow {
  organization_id: string
  liquidity_day: string
  merchandise_processed: number
}

/** v8: dashboard_occupancy_snapshot — pct rows for chart/card rendering. */
export interface DashboardOccupancySnapshotRow {
  location_id: string
  organization_id: string
  facility_id: string
  code: string
  occupancy_kg: number
  occupancy_m3: number
  occupancy_units: number
  pct_kg: number | null
  pct_m3: number | null
  pct_units: number | null
}