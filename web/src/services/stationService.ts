/**
 * Station service — scanner & scale checkpoints (Fase 10, ADR 0011).
 *
 * Both operation types are append-only detail rows of a movement
 * (movement_id NOT NULL). A scan creates a movement of kind scan_in
 * (lot → 'checked', states.md) or scan_out; a weight creates a movement of
 * kind 'scale' plus the scale_operation row (within_tolerance is NOT NULL).
 *
 * `obtenerColaPendiente` reads the station_queue view (0005_views.sql v6):
 * lots placed at a checkpoint with no completed operation FOR THAT
 * PLACEMENT — the pending-queue projection the station screens render.
 * (Extension over the requested surface; the view is the documented read
 * model for these stations, special-areas.md §Derived views.)
 */

import type { SupabaseClient } from "@supabase/supabase-js"

import { SCALE_OP_COLUMNS, SCANNER_OP_COLUMNS, STATION_QUEUE_COLUMNS } from "@/services/columns"
import { SupabaseMovementService } from "@/services/movementService"
import type { ScaleOpFiltros, ScannerOpFiltros } from "@/services/shared"
import type {
  ItemLotRow,
  MovementKind,
  ScaleOperationRow,
  ScannerOperationRow,
  ScannerResult,
  StationQueueRow,
} from "@/types"

function requireClient(client: SupabaseClient | null): SupabaseClient {
  if (!client) {
    throw new Error("Supabase no configurado — activá VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY")
  }
  return client
}

function applyWindow<T>(query: { range: (start: number, end: number) => T }, filtros?: { limit?: number; offset?: number }): T {
  const limit = Math.min(filtros?.limit ?? 100, 500)
  const offset = filtros?.offset ?? 0
  return query.range(offset, offset + limit - 1)
}

export interface ScannerOpInput {
  itemLotId: string
  scannedCode: string
  deviceId?: string | null
  result?: ScannerResult
  /** Default 'scan_in'; 'scan_out' leaves the lot status untouched. */
  kind?: "scan_in" | "scan_out"
  operatorId?: string | null
  ocurridoEn?: string
  operationKey?: string
}

export interface ScaleOpInput {
  itemLotId: string
  grossKg?: number | null
  tareKg?: number | null
  netKg?: number | null
  expectedKg?: number | null
  toleranceKg?: number | null
  withinTolerance: boolean
  deviceId?: string | null
  operatorId?: string | null
  ocurridoEn?: string
  operationKey?: string
}

export interface ScannerStationService {
  listarOperaciones(filtros?: ScannerOpFiltros): Promise<ScannerOperationRow[]>
  crearOperacionScan(input: ScannerOpInput): Promise<ScannerOperationRow>
}

export interface ScaleStationService {
  listarOperaciones(filtros?: ScaleOpFiltros): Promise<ScaleOperationRow[]>
  crearOperacionEscala(input: ScaleOpInput): Promise<ScaleOperationRow>
}

export interface StationService {
  scanner: ScannerStationService
  escala: ScaleStationService
  /** station_queue view (v6): pending lots at scan/scale checkpoints. */
  obtenerColaPendiente(kind?: "scan" | "scale"): Promise<StationQueueRow[]>
}

/** Shared lot lookup used by both station flows. */
async function fetchLot(client: SupabaseClient, itemLotId: string): Promise<ItemLotRow> {
  const { data, error } = await client
    .from("item_lots")
    .select(
      "id, organization_id, manifest_id, cargo_item_id, parent_lot_id, quantity, uom, status, current_location_id, current_truck_id, unit_weight_kg, unit_volume_m3, created_via_movement_id, created_at, updated_at",
    )
    .eq("id", itemLotId)
    .maybeSingle()
  if (error) throw new Error(`item_lot ${itemLotId}: ${error.message}`)
  if (!data) throw new Error(`Lote ${itemLotId} no encontrado`)
  return data as ItemLotRow
}

export class SupabaseStationService implements StationService {
  readonly scanner: ScannerStationService
  readonly escala: ScaleStationService
  private readonly client: SupabaseClient | null
  private readonly movements: SupabaseMovementService

  constructor(client: SupabaseClient | null) {
    this.client = client
    this.movements = new SupabaseMovementService(client)
    this.scanner = new SupabaseScannerStationService(client, this.movements)
    this.escala = new SupabaseScaleStationService(client, this.movements)
  }

  async obtenerColaPendiente(kind?: "scan" | "scale"): Promise<StationQueueRow[]> {
    const client = requireClient(this.client)
    let query = client.from("station_queue").select(STATION_QUEUE_COLUMNS)
    if (kind) query = query.eq("queue_kind", kind)
    query = query.order("created_at", { ascending: true })

    const { data, error } = await query
    if (error) throw new Error(`station_queue: ${error.message}`)
    return (data ?? []) as StationQueueRow[]
  }
}

class SupabaseScannerStationService implements ScannerStationService {
  private readonly client: SupabaseClient | null
  private readonly movements: SupabaseMovementService

  constructor(client: SupabaseClient | null, movements: SupabaseMovementService) {
    this.client = client
    this.movements = movements
  }

  async listarOperaciones(filtros?: ScannerOpFiltros): Promise<ScannerOperationRow[]> {
    const client = requireClient(this.client)
    let query = client.from("scanner_operations").select(SCANNER_OP_COLUMNS)

    if (filtros?.itemLotId) query = query.eq("item_lot_id", filtros.itemLotId)
    if (filtros?.movementId !== undefined) query = query.eq("movement_id", filtros.movementId)
    if (filtros?.resultado) query = query.eq("result", filtros.resultado)
    if (filtros?.since) query = query.gte("scanned_at", filtros.since)
    if (filtros?.until) query = query.lt("scanned_at", filtros.until)

    query = query.order("scanned_at", { ascending: false })
    query = applyWindow(query, filtros)

    const { data, error } = await query
    if (error) throw new Error(`scanner_operations: ${error.message}`)
    return (data ?? []) as ScannerOperationRow[]
  }

  async crearOperacionScan(input: ScannerOpInput): Promise<ScannerOperationRow> {
    const client = requireClient(this.client)
    const lot = await fetchLot(client, input.itemLotId)
    const kind: MovementKind = input.kind ?? "scan_in"

    const movement = await this.movements.crearMovimiento({
      kind,
      manifestId: lot.manifest_id,
      operatorId: input.operatorId ?? null,
      ocurridoEn: input.ocurridoEn,
      operationKey: input.operationKey,
      locationId: lot.current_location_id,
      items: [
        {
          itemLotId: lot.id,
          cantidad: lot.quantity,
          destinoLocationId: lot.current_location_id,
        },
      ],
    })

    const { data: operation, error: opError } = await client
      .from("scanner_operations")
      .insert({
        movement_id: movement.id,
        item_lot_id: input.itemLotId,
        scanned_code: input.scannedCode,
        device_id: input.deviceId ?? null,
        result: input.result ?? "success",
        operator_id: input.operatorId ?? null,
      })
      .select(SCANNER_OP_COLUMNS)
      .single()
    if (opError) throw new Error(`scanner_operations insert: ${opError.message}`)

    // scan_in marks the lot checked (states.md); scan_out does not change
    // status. Non-success captures (not_found/ambiguous/error) still write
    // the append-only row but DO NOT advance the lot — it stays pending in
    // the station queue (SBF-05; station_queue keeps only result='success').
    if (kind === "scan_in" && (input.result ?? "success") === "success") {
      const { error: lotError } = await client
        .from("item_lots")
        .update({ status: "checked" })
        .eq("id", lot.id)
      if (lotError) throw new Error(`item_lots update ${lot.id}: ${lotError.message}`)
    }

    return operation as ScannerOperationRow
  }
}

class SupabaseScaleStationService implements ScaleStationService {
  private readonly client: SupabaseClient | null
  private readonly movements: SupabaseMovementService

  constructor(client: SupabaseClient | null, movements: SupabaseMovementService) {
    this.client = client
    this.movements = movements
  }

  async listarOperaciones(filtros?: ScaleOpFiltros): Promise<ScaleOperationRow[]> {
    const client = requireClient(this.client)
    let query = client.from("scale_operations").select(SCALE_OP_COLUMNS)

    if (filtros?.itemLotId) query = query.eq("item_lot_id", filtros.itemLotId)
    if (filtros?.movementId !== undefined) query = query.eq("movement_id", filtros.movementId)
    if (filtros?.dentroTolerancia !== undefined) query = query.eq("within_tolerance", filtros.dentroTolerancia)
    if (filtros?.since) query = query.gte("weighed_at", filtros.since)
    if (filtros?.until) query = query.lt("weighed_at", filtros.until)

    query = query.order("weighed_at", { ascending: false })
    query = applyWindow(query, filtros)

    const { data, error } = await query
    if (error) throw new Error(`scale_operations: ${error.message}`)
    return (data ?? []) as ScaleOperationRow[]
  }

  async crearOperacionEscala(input: ScaleOpInput): Promise<ScaleOperationRow> {
    const client = requireClient(this.client)
    const lot = await fetchLot(client, input.itemLotId)

    const movement = await this.movements.crearMovimiento({
      kind: "scale",
      manifestId: lot.manifest_id,
      operatorId: input.operatorId ?? null,
      ocurridoEn: input.ocurridoEn,
      operationKey: input.operationKey,
      locationId: lot.current_location_id,
      items: [
        {
          itemLotId: lot.id,
          cantidad: lot.quantity,
          destinoLocationId: lot.current_location_id,
        },
      ],
    })

    const { data: operation, error: opError } = await client
      .from("scale_operations")
      .insert({
        movement_id: movement.id,
        item_lot_id: input.itemLotId,
        gross_kg: input.grossKg ?? null,
        tare_kg: input.tareKg ?? null,
        net_kg: input.netKg ?? null,
        expected_kg: input.expectedKg ?? null,
        tolerance_kg: input.toleranceKg ?? null,
        within_tolerance: input.withinTolerance,
        device_id: input.deviceId ?? null,
        operator_id: input.operatorId ?? null,
      })
      .select(SCALE_OP_COLUMNS)
      .single()
    if (opError) throw new Error(`scale_operations insert: ${opError.message}`)

    return operation as ScaleOperationRow
  }
}