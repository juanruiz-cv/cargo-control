/**
 * Demo report aggregates (T14) — pure mirror of the REPORTES module for the
 * in-memory adapter.
 *
 * The demo ReportService (adapters.ts DemoReportService) must return the
 * SAME rows the Supabase implementation would for the same story, so the
 * derivations below reuse the Fase 12 pure mirrors (computarSerieDemo,
 * computarOcupaciones) and the same bounded-page semantics (applyLimit in
 * the adapter). Keeping the logic here (pure, no service state) lets the
 * verification script run the exact same code the page consumes.
 */

import { computarOcupaciones } from "@/lib/movement-guards"
import { computarSerieDemo } from "@/services/demo/dashboardAggregates"
import type { FilaReporte, FiltrosReporte } from "@/services/reportService"
import type { DemoState } from "@/services/demo/seed"
import type {
  CargoManifestRow,
  ItemLotRow,
  LocationOccupancyRow,
  MovementKind,
  MovementRow,
  QuarantineOperationRow,
  ScannerOperationRow,
  ScaleOperationRow,
  SeizureOperationRow,
  ScannerResult,
} from "@/types"

// ---------------------------------------------------------------------
// Shared enrichment helpers (demo twin of the Supabase in() reads)
// ---------------------------------------------------------------------

/** demo twin of fetchUsers — name map by user id. */
export function demoUsuarios(state: DemoState): Map<string, string> {
  const mapa = new Map<string, string>()
  for (const u of state.users) mapa.set(u.id, u.full_name ?? u.id)
  return mapa
}

/** demo twin of fetchItems — cargo_item by id (sku + description). */
export function demoItems(state: DemoState): Map<string, { sku: string | null; description: string }> {
  const mapa = new Map<string, { sku: string | null; description: string }>()
  for (const i of state.items) mapa.set(i.id, { sku: i.sku, description: i.description })
  return mapa
}

/** demo twin of fetchLotes — item_lot by id (bounded to the page ids). */
export function demoLotes(state: DemoState): Map<string, ItemLotRow> {
  return new Map(state.lots.map((l) => [l.id, l]))
}

/** Window predicate for operation timestamps (same since/until semantics). */
function enVentana(
  ts: string,
  filtros?: { since?: string; hasta?: string },
): boolean {
  if (filtros?.since !== undefined && ts < filtros.since) return false
  if (filtros?.hasta !== undefined && ts >= filtros.hasta) return false
  return true
}

function paginaDe<T>(rows: T[], pagina?: { limit?: number; offset?: number }): T[] {
  const limit = Math.min(pagina?.limit ?? 25, 500)
  const offset = pagina?.offset ?? 0
  return rows.slice(offset, offset + limit)
}

// ---------------------------------------------------------------------
// Report aggregates
// ---------------------------------------------------------------------

/** Camiones: bounded page (plate order) + señales + descargas count. */
export function computarReporteCamiones(
  state: DemoState,
  filtros?: FiltrosReporte,
  pagina?: { limit?: number; offset?: number },
): { filas: FilaReporte[]; total: number } {
  let rows = state.trucks
  if (filtros?.estado) rows = rows.filter((t) => t.status === filtros.estado)
  if (filtros?.placa) rows = rows.filter((t) => t.plate.toLowerCase().includes(filtros.placa!.toLowerCase()))
  const total = rows.length
  const page = paginaDe([...rows].sort((a, b) => a.plate.localeCompare(b.plate)), pagina)

  // Demo twin of DemoTruckService.obtenerSeñales (T-21): same positional
  // contract, derived directly from the store for the current page.
  const descargas = computarDescargasPorCamion(state)
  const filas: FilaReporte[] = page.map((camion) => {
    const manifestIds = state.manifests.filter((m) => m.truck_id === camion.id).map((m) => m.id)
    const movs = state.movements.filter((m) => m.manifest_id !== null && manifestIds.includes(m.manifest_id))
    const arribos = movs.filter((m) => m.kind === "arrival").sort((a, b) => a.occurred_at.localeCompare(b.occurred_at))
    const egresos = movs.filter((m) => m.kind === "egress").sort((a, b) => a.occurred_at.localeCompare(b.occurred_at))
    const ultima = [...movs].sort(
      (a, b) => (a.occurred_at === b.occurred_at ? b.id - a.id : b.occurred_at.localeCompare(a.occurred_at)),
    )[0]
    return {
      placa: camion.plate,
      estado: camion.status,
      manifiestos: manifestIds.length,
      ingresos: arribos.length,
      egresos: egresos.length,
      descargas: descargas.get(camion.id) ?? 0,
      primeraLlegada: arribos[0]?.occurred_at ?? null,
      ultimoEgreso: egresos[egresos.length - 1]?.occurred_at ?? null,
      ultimaOperacion: ultima?.occurred_at ?? null,
    }
  })
  return { filas, total }
}

/** Descargas (kind='discharge') per truck — demo twin of the bounded in() query. */
export function computarDescargasPorCamion(state: DemoState): Map<string, number> {
  const resultado = new Map<string, number>()
  for (const mv of state.movements) {
    if (mv.kind !== "discharge" || mv.manifest_id === null) continue
    const manifest = state.manifests.find((m) => m.id === mv.manifest_id)
    if (!manifest?.truck_id) continue
    resultado.set(manifest.truck_id, (resultado.get(manifest.truck_id) ?? 0) + 1)
  }
  return resultado
}

/**
 * Ingresos/Egresos resumen: merge of the arrivals + trucks_processed series
 * (same aggregated merge the Supabase path does server-side).
 */
export function computarResumenIngresosEgresos(state: DemoState, filtros?: FiltrosReporte): FilaReporte[] {
  const arribos = computarSerieDemo(state, "arrivals", { desde: filtros?.desde, hasta: filtros?.hasta })
  const egresos = computarSerieDemo(state, "trucks_processed", { desde: filtros?.desde, hasta: filtros?.hasta })
  const porDia = new Map<string, { ingresos: number; egresos: number }>()
  for (const fila of arribos) {
    if (!("arrivals" in fila)) continue
    const dia = fila.liquidity_day
    porDia.set(dia, { ingresos: fila.arrivals, egresos: porDia.get(dia)?.egresos ?? 0 })
  }
  for (const fila of egresos) {
    if (!("trucks_processed" in fila)) continue
    const previo = porDia.get(fila.liquidity_day) ?? { ingresos: 0, egresos: 0 }
    porDia.set(fila.liquidity_day, { ingresos: previo.ingresos, egresos: fila.trucks_processed })
  }
  return [...porDia.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([dia, cuenta]) => ({ dia, ingresos: cuenta.ingresos, egresos: cuenta.egresos }))
}

/** Carga: page of manifests + Σ items of THAT page (row assembly, not statistics). */
export function computarReporteCarga(
  state: DemoState,
  filtros?: FiltrosReporte,
  pagina?: { limit?: number; offset?: number },
): { filas: FilaReporte[]; total: number } {
  let rows: CargoManifestRow[] = state.manifests
  if (filtros?.estado) rows = rows.filter((m) => m.status === filtros.estado)
  if (filtros?.desde) rows = rows.filter((m) => enVentana(m.created_at, { since: filtros?.desde }))
  if (filtros?.hasta) rows = rows.filter((m) => enVentana(m.created_at, { hasta: filtros?.hasta }))
  const total = rows.length
  const page = paginaDe([...rows].sort((a, b) => b.created_at.localeCompare(a.created_at)), pagina)

  const cantidad = new Map<string, { cantidad: number; peso: number }>()
  for (const item of state.items) {
    if (!page.some((m) => m.id === item.manifest_id)) continue
    const previo = cantidad.get(item.manifest_id) ?? { cantidad: 0, peso: 0 }
    cantidad.set(item.manifest_id, {
      cantidad: previo.cantidad + item.total_quantity,
      peso: previo.peso + item.total_quantity * (item.unit_weight_kg ?? 0),
    })
  }
  const placa = new Map(state.trucks.map((t) => [t.id, t.plate]))
  const filas: FilaReporte[] = page.map((m) => ({
    codigo: m.code,
    placa: m.truck_id ? (placa.get(m.truck_id) ?? "—") : "—",
    estado: m.status,
    cantidad: cantidad.get(m.id)?.cantidad ?? 0,
    peso: cantidad.get(m.id)?.peso ?? 0,
    destino: m.destination,
  }))
  return { filas, total }
}

/** Movimientos: demo twin of dashboard_series_movements aggregation. */
export function computarReporteMovimientos(state: DemoState, filtros?: FiltrosReporte): FilaReporte[] {
  const serie = computarSerieDemo(state, "movements", {
    desde: filtros?.desde,
    hasta: filtros?.hasta,
    kind: filtros?.kind as MovementKind | undefined,
  })
  return [...serie]
    .sort((a, b) => b.liquidity_day.localeCompare(a.liquidity_day))
    .map((fila) =>
      "kind" in fila
        ? { dia: fila.liquidity_day, tipo: fila.kind, cantidad: fila.movements }
        : { dia: fila.liquidity_day, tipo: null, cantidad: 0 },
    )
}

/** Ocupación: demo twin of location_occupancy (v3) via computarOcupaciones. */
export function computarReporteOcupacion(state: DemoState): { filas: FilaReporte[]; total: number } {
  const ocupaciones: Map<string, LocationOccupancyRow> = computarOcupaciones(state.locations, state.lots, state.items)
  const filas: FilaReporte[] = [...ocupaciones.values()]
    .sort((a, b) => a.code.localeCompare(b.code))
    .map((fila) => ({
      ubicacion: fila.code,
      ocupadas: fila.occupancy_units,
      capacidad: fila.capacity_max_units,
      pct: fila.pct_units,
      kg: fila.occupancy_kg,
      m3: fila.occupancy_m3,
    }))
  return { filas, total: filas.length }
}

/** Scanner: page of scanner_operations (demo) + enrichment. */
export function computarReporteScanner(
  state: DemoState,
  filtros?: FiltrosReporte,
  pagina?: { limit?: number; offset?: number },
): { filas: FilaReporte[]; total: number } {
  let rows: ScannerOperationRow[] = state.scannerOps
  if (filtros?.resultado) rows = rows.filter((o) => o.result === (filtros.resultado as ScannerResult))
  rows = rows.filter((o) => enVentana(o.scanned_at, filtros))
  const total = rows.length
  const page = paginaDe([...rows].sort((a, b) => b.scanned_at.localeCompare(a.scanned_at)), pagina)
  const items = demoItems(state)
  const lotes = demoLotes(state)
  const usuarios = demoUsuarios(state)
  const filas: FilaReporte[] = page.map((op) => {
    const lot = lotes.get(op.item_lot_id)
    const item = lot ? items.get(lot.cargo_item_id) : undefined
    return {
      fecha: op.scanned_at,
      lote: item?.sku ?? lot?.id ?? op.item_lot_id,
      mercaderia: item?.description ?? "—",
      codigo: op.scanned_code,
      resultado: op.result,
      operador: op.operator_id ? (usuarios.get(op.operator_id) ?? op.operator_id) : "—",
    }
  })
  return { filas, total }
}

/** Balanza: page of scale_operations (demo) + enrichment. */
export function computarReporteBalanza(
  state: DemoState,
  filtros?: FiltrosReporte,
  pagina?: { limit?: number; offset?: number },
): { filas: FilaReporte[]; total: number } {
  let rows: ScaleOperationRow[] = state.scaleOps
  if (filtros?.dentroTolerancia !== undefined) {
    rows = rows.filter((o) => o.within_tolerance === filtros.dentroTolerancia)
  }
  rows = rows.filter((o) => enVentana(o.weighed_at, filtros))
  const total = rows.length
  const page = paginaDe([...rows].sort((a, b) => b.weighed_at.localeCompare(a.weighed_at)), pagina)
  const items = demoItems(state)
  const lotes = demoLotes(state)
  const usuarios = demoUsuarios(state)
  const filas: FilaReporte[] = page.map((op) => {
    const lot = lotes.get(op.item_lot_id)
    const item = lot ? items.get(lot.cargo_item_id) : undefined
    return {
      fecha: op.weighed_at,
      lote: item?.sku ?? lot?.id ?? op.item_lot_id,
      mercaderia: item?.description ?? "—",
      neto: op.net_kg,
      esperado: op.expected_kg,
      tolerancia: op.tolerance_kg,
      dentro: op.within_tolerance,
      operador: op.operator_id ? (usuarios.get(op.operator_id) ?? op.operator_id) : "—",
    }
  })
  return { filas, total }
}

/** Rezago: page of quarantine_operations (demo) + enrichment. */
export function computarReporteRezago(
  state: DemoState,
  filtros?: FiltrosReporte,
  pagina?: { limit?: number; offset?: number },
): { filas: FilaReporte[]; total: number } {
  let rows: QuarantineOperationRow[] = state.quarantineOps
  if (filtros?.estado) rows = rows.filter((o) => o.status === filtros.estado)
  rows = rows.filter((o) => enVentana(o.opened_at, filtros))
  const total = rows.length
  const page = paginaDe([...rows].sort((a, b) => b.opened_at.localeCompare(a.opened_at)), pagina)
  const items = demoItems(state)
  const lotes = demoLotes(state)
  const usuarios = demoUsuarios(state)
  const filas: FilaReporte[] = page.map((op) => {
    const lot = lotes.get(op.item_lot_id)
    const item = lot ? items.get(lot.cargo_item_id) : undefined
    return {
      apertura: op.opened_at,
      lote: item?.sku ?? lot?.id ?? op.item_lot_id,
      mercaderia: item?.description ?? "—",
      motivo: op.reason,
      estado: op.status,
      operador: op.opened_by ? (usuarios.get(op.opened_by) ?? op.opened_by) : "—",
    }
  })
  return { filas, total }
}

/** Secuestro: page of seizure_operations (demo) + enrichment + adjuntos. */
export function computarReporteSecuestro(
  state: DemoState,
  filtros?: FiltrosReporte,
  pagina?: { limit?: number; offset?: number },
): { filas: FilaReporte[]; total: number } {
  let rows: SeizureOperationRow[] = state.seizureOps
  if (filtros?.estado) rows = rows.filter((o) => o.status === filtros.estado)
  rows = rows.filter((o) => enVentana(o.opened_at, filtros))
  const total = rows.length
  const page = paginaDe([...rows].sort((a, b) => b.opened_at.localeCompare(a.opened_at)), pagina)
  const items = demoItems(state)
  const lotes = demoLotes(state)
  const usuarios = demoUsuarios(state)
  const documentos = new Map<string, number>()
  for (const adjunto of state.attachments) {
    if (adjunto.entity_type !== "seizure_operation") continue
    documentos.set(adjunto.entity_id, (documentos.get(adjunto.entity_id) ?? 0) + 1)
  }
  const filas: FilaReporte[] = page.map((op) => {
    const lot = lotes.get(op.item_lot_id)
    const item = lot ? items.get(lot.cargo_item_id) : undefined
    return {
      apertura: op.opened_at,
      lote: item?.sku ?? lot?.id ?? op.item_lot_id,
      mercaderia: item?.description ?? "—",
      refLegal: op.legal_ref,
      estado: op.status,
      operador: op.opened_by ? (usuarios.get(op.opened_by) ?? op.opened_by) : "—",
      documentos: documentos.get(op.id) ?? 0,
    }
  })
  return { filas, total }
}

/** Auditoría total demo — mirror of the Supabase exact count (created_at window). */
export function computarTotalAuditoriaDemo(
  state: DemoState,
  filtros?: { accion?: string; desde?: string; hasta?: string },
): number {
  let rows = state.auditLog
  if (filtros?.accion) rows = rows.filter((a) => a.action === filtros.accion)
  if (filtros?.desde !== undefined) rows = rows.filter((a) => a.created_at >= filtros.desde!)
  if (filtros?.hasta !== undefined) rows = rows.filter((a) => a.created_at < filtros.hasta!)
  return rows.length
}

export type { MovementRow, ScannerResult }