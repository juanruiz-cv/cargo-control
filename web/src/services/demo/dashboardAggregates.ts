/**
 * Demo dashboard aggregates (Fase 12) — pure mirror of the v8 dashboard_*
 * views in supabase/migrations/0005_views.sql.
 *
 * The demo adapter (adapters.ts DemoDashboardService) MUST return the same
 * numbers the SQL views would for the same story, so the derivations below
 * follow the SQL subquery-by-subquery: trucks_in_yard, trucks_waiting and
 * trucks_discharging re-implement their EXISTS/UNION shapes; the
 * merchandise KPIs derive from the same signals the derived views use
 * (station_queue for scanner/scale, open quarantine/seizure operations for
 * hold_open); sectors reuse computarOcupaciones (the demo twin of the
 * location_occupancy view). QA DB-01..DB-50 assert the seed expectations.
 *
 * Keeping the logic here (pure, no service state) lets the verification
 * script run the exact same code the page consumes.
 */

import { computarOcupaciones } from "@/lib/movement-guards"
import type { SerieFila, SerieFiltros, SerieTipo } from "@/services/dashboardService"
import type { DemoState } from "@/services/demo/seed"
import type {
  DashboardMetricsRow,
  DashboardOccupancySnapshotRow,
  ItemLotRow,
  MovementKind,
  MovementRow,
} from "@/types"

/** Local calendar-day key ("YYYY-MM-DD") — mirrors day_bucket's session-tz truncation. */
export function dayBucketKey(iso: string): string {
  const d = new Date(iso)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const dd = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${dd}`
}

/**
 * Window bound for a series — the pure twin of dashboardService
 * ventanaDesde + the Reports extension (T14):
 *   - default: bucket(now-(dias-1)) like the Supabase path;
 *   - `filtros.desde`/`filtros.hasta` (ISO instants, Reports) override the
 *     window: desde = inclusive day start, hasta = exclusive upper edge
 *     (start of the next day). Returns calendar-day keys for dayBucketKey
 *     comparisons; `hasta` is null when open-ended.
 */
export function ventanaDemo(filtros: SerieFiltros | undefined): { desde: string; hasta: string | null } {
  if (filtros?.desde !== undefined) {
    const desde = dayBucketKey(filtros.desde)
    const hasta =
      filtros?.hasta !== undefined
        ? dayBucketKey(new Date(new Date(filtros.hasta).getTime() - 1).toISOString())
        : null
    return { desde, hasta }
  }
  const dias = Math.max(1, Math.min(filtros?.dias ?? 30, 90))
  const inicio = new Date()
  inicio.setDate(inicio.getDate() - (dias - 1))
  inicio.setHours(0, 0, 0, 0)
  return { desde: dayBucketKey(inicio.toISOString()), hasta: null }
}

// ---------------------------------------------------------------------
// Helpers (per-truck movement facts)
// ---------------------------------------------------------------------

const KINDS_DESCARGA: readonly MovementKind[] = ["discharge", "split", "transfer", "store"]

function movimientosDeTruck(state: DemoState, truckId: string): MovementRow[] {
  const manifestsDelTruck = state.manifests
    .filter((m) => m.truck_id === truckId)
    .map((m) => m.id)
  return state.movements.filter(
    (mv) => mv.manifest_id !== null && manifestsDelTruck.includes(mv.manifest_id),
  )
}

/** SQL convention: (b occurred AFTER a) — timestamptz, then id tiebreak. */
function esPosterior(b: MovementRow, a: MovementRow): boolean {
  return b.occurred_at > a.occurred_at || (b.occurred_at === a.occurred_at && b.id > a.id)
}

function ultimoMovimientoDeTruck(state: DemoState, truckId: string): MovementRow | null {
  const movs = movimientosDeTruck(state, truckId)
  if (movs.length === 0) return null
  return [...movs].sort((a, b) => (a.occurred_at === b.occurred_at ? b.id - a.id : b.occurred_at.localeCompare(a.occurred_at)))[0]
}

/**
 * Pending station queue for a lot — mirrors the station_queue view
 * (0005_views.sql v6): a lot at a scan/scale checkpoint is QUEUED until
 * the placement movement carries a completed operation (scan result
 * 'success' / scale within_tolerance). Non-success results keep it pending.
 */
function estacionPendienteDeLote(state: DemoState, lot: ItemLotRow): "scan" | "scale" | null {
  const checkpoint = state.locations.find((l) => l.id === lot.current_location_id)
  if (!checkpoint || checkpoint.type !== "checkpoint") return null
  if (checkpoint.checkpoint_kind !== "scan" && checkpoint.checkpoint_kind !== "scale") return null
  // Mirrors station_queue (0005_views.sql v6): the placement is the LATEST
  // movement_item that carried the lot to its current checkpoint; the lot
  // leaves the queue only when that placement carries a completed op. With
  // NO placement at all, `so.movement_id = NULL` never matches — the lot
  // stays queued (seed SCANNER-1 story).
  const placement = [...state.movementItems]
    .reverse()
    .find((mi) => mi.item_lot_id === lot.id && mi.to_location_id === lot.current_location_id)
  const completada =
    placement !== undefined &&
    (checkpoint.checkpoint_kind === "scan"
      ? state.scannerOps.some((o) => o.movement_id === placement.movement_id && o.result === "success")
      : state.scaleOps.some((o) => o.movement_id === placement.movement_id && o.within_tolerance === true))
  return completada ? null : checkpoint.checkpoint_kind
}

function pendientesPorTipo(state: DemoState): { scan: ItemLotRow[]; scale: ItemLotRow[] } {
  const scan: ItemLotRow[] = []
  const scale: ItemLotRow[] = []
  for (const lot of state.lots) {
    const pending = estacionPendienteDeLote(state, lot)
    if (pending === "scan") scan.push(lot)
    if (pending === "scale") scale.push(lot)
  }
  return { scan, scale }
}

// ---------------------------------------------------------------------
// dashboard_metrics (0005_views.sql lines 213-338)
// ---------------------------------------------------------------------

export function computarMetricasDemo(state: DemoState): DashboardMetricsRow {
  // 1/2/3 — Camiones
  const enYard = new Set<string>()
  const enEspera = new Set<string>()
  const enDescarga = new Set<string>()

  for (const truck of state.trucks) {
    const movs = movimientosDeTruck(state, truck.id)
    const llegadas = movs.filter((mv) => mv.kind === "arrival")

    // 1. ARRIVED: any arrival with NO egress after it (SQL lines 219-234)
    const llegoYNoSalio = llegadas.some(
      (a) => !movs.some((mv) => mv.kind === "egress" && esPosterior(mv, a)),
    )
    if (llegoYNoSalio) enYard.add(truck.id)

    // 2. WAITING: 'available' + arrival IS the latest movement + no open
    //    holds on the truck's lots + no pending station queue (SQL 240-269)
    const ultimo = ultimoMovimientoDeTruck(state, truck.id)
    const llegadaEsUltima = ultimo !== null && ultimo.kind === "arrival" && llegadas.includes(ultimo)
    const lotesDelTruck = state.lots.filter((l) => {
      const m = state.manifests.find((mf) => mf.id === l.manifest_id)
      return m?.truck_id === truck.id
    })
    const tieneRetencionAbierta = lotesDelTruck.some(
      (l) => l.status === "in_quarantine" || l.status === "seized",
    )
    const { scan, scale } = pendientesPorTipo(state)
    const pendientesDelTruck = [...scan, ...scale].some((l) => lotesDelTruck.includes(l))
    if (truck.status === "available" && llegadaEsUltima && !tieneRetencionAbierta && !pendientesDelTruck) {
      enEspera.add(truck.id)
    }

    // 3. IN_PROCESS (latest movement discharge/split/transfer/store) UNION
    //    PARTIALLY_UNLOADED (discharge/split exist AND on-truck lots remain)
    //    (SQL 276-299)
    const enProceso = ultimo !== null && KINDS_DESCARGA.includes(ultimo.kind)
    const parcial =
      movs.some((mv) => mv.kind === "discharge" || mv.kind === "split") &&
      state.lots.some((l) => l.current_truck_id === truck.id)
    if (enProceso || parcial) enDescarga.add(truck.id)
  }

  // 4/5 — Mercadería almacenada (SQL 301-310)
  let storedQty = 0
  let storedKg = 0
  for (const l of state.lots) {
    if (l.status !== "in_warehouse") continue
    const item = state.items.find((i) => i.id === l.cargo_item_id)
    storedQty += l.quantity
    storedKg += l.quantity * (l.unit_weight_kg ?? item?.unit_weight_kg ?? 0)
  }

  // 5/6 — Colas de estaciones (SQL 311-319, via station_queue mirror)
  const pendientes = pendientesPorTipo(state)
  const scannerQty = pendientes.scan.reduce((acc, l) => acc + l.quantity, 0)
  const scaleQty = pendientes.scale.reduce((acc, l) => acc + l.quantity, 0)

  // 7/8 — Retenciones abiertas (SQL 320-328, via hold_open mirror: OPEN ops)
  let quarantineQty = 0
  let seizedQty = 0
  for (const op of state.quarantineOps) {
    if (op.status !== "open") continue
    const lot = state.lots.find((l) => l.id === op.item_lot_id)
    if (lot) quarantineQty += lot.quantity
  }
  for (const op of state.seizureOps) {
    if (op.status !== "open") continue
    const lot = state.lots.find((l) => l.id === op.item_lot_id)
    if (lot) seizedQty += lot.quantity
  }

  // 9/10 — Sectores ocupados/libres (SQL 329-337, location_occupancy mirror)
  const ocupaciones = computarOcupaciones(state.locations, state.lots, state.items)
  let occupied = 0
  let free = 0
  for (const row of ocupaciones.values()) {
    if (row.occupancy_kg > 0 || row.occupancy_m3 > 0 || row.occupancy_units > 0) occupied += 1
    else free += 1
  }

  return {
    organization_id: state.organization.id,
    trucks_in_yard: enYard.size,
    trucks_waiting: enEspera.size,
    trucks_discharging: enDescarga.size,
    merchandise_stored: storedQty,
    merchandise_stored_weight_kg: Math.round(storedKg * 100) / 100,
    merchandise_in_scanner: scannerQty,
    merchandise_in_scale: scaleQty,
    merchandise_in_quarantine: quarantineQty,
    merchandise_seized: seizedQty,
    sectors_occupied: occupied,
    sectors_free: free,
  }
}

// ---------------------------------------------------------------------
// dashboard_series_* (0005_views.sql lines 348-390)
// Window filter: day bucket >= window start (same as the client's gte).
// ---------------------------------------------------------------------

export function computarSerieDemo(
  state: DemoState,
  tipo: SerieTipo,
  filtros?: SerieFiltros,
): SerieFila[] {
  const { desde, hasta } = ventanaDemo(filtros)

  const enVentana = (mv: MovementRow): boolean => {
    const dia = dayBucketKey(mv.occurred_at)
    return dia >= desde && (hasta === null || dia <= hasta)
  }

  const etapas: SerieFila[] = []
  if (tipo === "arrivals") {
    // count(*) per day where kind='arrival' (SQL 348-356)
    const porDia = new Map<string, number>()
    for (const mv of state.movements) {
      if (mv.kind !== "arrival" || !enVentana(mv)) continue
      const dia = dayBucketKey(mv.occurred_at)
      porDia.set(dia, (porDia.get(dia) ?? 0) + 1)
    }
    for (const [dia, n] of [...porDia.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      etapas.push({ organization_id: state.organization.id, liquidity_day: `${dia}T00:00:00.000Z`, arrivals: n })
    }
  } else if (tipo === "movements") {
    // count(*) per (day, kind) (SQL 358-366)
    const porDiaKind = new Map<string, Map<MovementKind, number>>()
    for (const mv of state.movements) {
      if (filtros?.kind && mv.kind !== filtros.kind) continue
      if (!enVentana(mv)) continue
      const dia = dayBucketKey(mv.occurred_at)
      let kinds = porDiaKind.get(dia)
      if (!kinds) {
        kinds = new Map()
        porDiaKind.set(dia, kinds)
      }
      kinds.set(mv.kind, (kinds.get(mv.kind) ?? 0) + 1)
    }
    for (const [dia, kinds] of [...porDiaKind.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      for (const [kind, n] of [...kinds.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
        etapas.push({ organization_id: state.organization.id, liquidity_day: `${dia}T00:00:00.000Z`, kind, movements: n })
      }
    }
  } else if (tipo === "trucks_processed") {
    // count(distinct truck_id) per day where kind='egress' (SQL 370-379)
    const porDia = new Map<string, Set<string>>()
    for (const mv of state.movements) {
      if (mv.kind !== "egress" || !enVentana(mv)) continue
      const manifest = state.manifests.find((m) => m.id === mv.manifest_id)
      if (!manifest?.truck_id) continue
      const dia = dayBucketKey(mv.occurred_at)
      let trucks = porDia.get(dia)
      if (!trucks) {
        trucks = new Set()
        porDia.set(dia, trucks)
      }
      trucks.add(manifest.truck_id)
    }
    for (const [dia, trucks] of [...porDia.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      etapas.push({ organization_id: state.organization.id, liquidity_day: `${dia}T00:00:00.000Z`, trucks_processed: trucks.size })
    }
  } else {
    // sum(movement_items.quantity) per day (SQL 382-390)
    const porDia = new Map<string, number>()
    for (const mv of state.movements) {
      if (!enVentana(mv)) continue
      const dia = dayBucketKey(mv.occurred_at)
      const total = state.movementItems
        .filter((mi) => mi.movement_id === mv.id)
        .reduce((acc, mi) => acc + mi.quantity, 0)
      porDia.set(dia, (porDia.get(dia) ?? 0) + total)
    }
    for (const [dia, n] of [...porDia.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      etapas.push({ organization_id: state.organization.id, liquidity_day: `${dia}T00:00:00.000Z`, merchandise_processed: n })
    }
  }
  return etapas
}

// ---------------------------------------------------------------------
// dashboard_occupancy_snapshot (0005_views.sql lines 394-401)
// ---------------------------------------------------------------------

export function computarSnapshotOcupacionDemo(state: DemoState): DashboardOccupancySnapshotRow[] {
  const ocupaciones = computarOcupaciones(state.locations, state.lots, state.items)
  const filas: DashboardOccupancySnapshotRow[] = []
  for (const row of ocupaciones.values()) {
    if (row.pct_kg === null && row.pct_m3 === null && row.pct_units === null) continue
    filas.push({
      location_id: row.location_id,
      organization_id: row.organization_id,
      facility_id: row.facility_id,
      code: row.code,
      occupancy_kg: row.occupancy_kg,
      occupancy_m3: row.occupancy_m3,
      occupancy_units: row.occupancy_units,
      // SQL uses round(pct, 1) — location_occupancy → same 1-decimal pct.
      pct_kg: row.pct_kg === null ? null : Math.round(row.pct_kg * 10) / 10,
      pct_m3: row.pct_m3 === null ? null : Math.round(row.pct_m3 * 10) / 10,
      pct_units: row.pct_units === null ? null : Math.round(row.pct_units * 10) / 10,
    })
  }
  return filas.sort((a, b) => a.code.localeCompare(b.code))
}