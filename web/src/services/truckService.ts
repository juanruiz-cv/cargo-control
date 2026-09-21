/**
 * Truck service — fleet module (Fase 7, ADR 0008).
 *
 * Entry/exit are NOT timestamp columns: they are `arrival`/`egress`
 * movements on the append-only spine (0001_schema.sql note + entities.md),
 * so registrarEntrada/registrarSalida delegate to the movement service and
 * then apply the documented base-status/rollup touches:
 *
 *   - arrival  → truck.status 'in_playon', manifest → 'in_playon',
 *                cargo_items pending → on_truck (states.md cargo_item §pending)
 *   - egress   → truck.status 'in_route'
 *
 * The authoritative state transitions belong to the server-side engine
 * (engine path supersedes this provisional client update sequence); here
 * they keep the dev/demo experience coherent under RLS.
 */

import type { SupabaseClient } from "@supabase/supabase-js"

import {
  ITEM_LOT_COLUMNS,
  MANIFEST_COLUMNS,
  MOVEMENT_COLUMNS,
  TRUCK_COLUMNS,
  TRANSPORT_COMPANY_COLUMNS,
} from "@/services/columns"
import { SupabaseMovementService } from "@/services/movementService"
import type { MovementExecutionInput, TruckFiltros } from "@/services/shared"
import type {
  CargoManifestRow,
  CargoManifestStatus,
  ItemLotRow,
  MovementKind,
  MovementRow,
  TransportCompanyRow,
  TruckInsert,
  TruckRow,
  TruckUpdate,
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

/** Plate normalization, shared by every adapter (trim + uppercase). */
export function normalizePlate(raw: string): string {
  return raw.trim().toUpperCase()
}

/** Manifiesto of a truck as exposed by the signals projection. */
export interface TruckManifestRef {
  id: string
  code: string
  notes: string | null
  status: CargoManifestStatus
  truckId: string | null
}

/**
 * Read-side signals for badge derivation (ADR 0008 §2). Built with bounded
 * queries only — never one query per truck (T-21).
 */
export interface TruckSignals {
  truckId: string
  manifestCount: number
  arrivalCount: number
  egressCount: number
  firstArrivalAt: string | null
  lastEgressAt: string | null
  latestMovementKind: MovementKind | null
  latestMovementAt: string | null
  hasDischargeOrSplit: boolean
  openQuarantine: boolean
  openSeizure: boolean
  openScanner: boolean
  openScale: boolean
  onTruckLots: number
  /** Earliest-arrived manifest able to egress (≥1 arrival, 0 egress, no frozen lots, not closed). */
  egressibleManifestId: string | null
  /** Non-closed manifests — the Observaciones source (manifest notes). */
  openManifests: TruckManifestRef[]
}

export function emptySignals(truckId: string): TruckSignals {
  return {
    truckId,
    manifestCount: 0,
    arrivalCount: 0,
    egressCount: 0,
    firstArrivalAt: null,
    lastEgressAt: null,
    latestMovementKind: null,
    latestMovementAt: null,
    hasDischargeOrSplit: false,
    openQuarantine: false,
    openSeizure: false,
    openScanner: false,
    openScale: false,
    onTruckLots: 0,
    egressibleManifestId: null,
    openManifests: [],
  }
}

/**
 * Pure derivation shared by the Supabase and demo adapters: same signals,
 * same badge. `scanCheckpointIds`/`scaleCheckpointIds` let the client
 * approximate "open scanner/scale ops" as lots sitting at a checkpoint
 * location — the same convention the dashboard KPIs and the station queue
 * use; the engine's scanner_operations/scale_operations stay authoritative.
 */
export function buildTruckSignals(
  truckId: string,
  manifests: readonly CargoManifestRow[],
  movements: readonly MovementRow[],
  lots: readonly ItemLotRow[],
  scanCheckpointIds: readonly string[],
  scaleCheckpointIds: readonly string[],
): TruckSignals {
  const delCamion = manifests.filter((m) => m.truck_id === truckId)
  const manifestIds = new Set(delCamion.map((m) => m.id))
  const lotes = lots.filter((l) => manifestIds.has(l.manifest_id))
  const movimientos = movements
    .filter((m) => m.manifest_id !== null && manifestIds.has(m.manifest_id))
    .sort((a, b) => a.occurred_at.localeCompare(b.occurred_at) || a.id - b.id)
  const arribos = movimientos.filter((m) => m.kind === "arrival")
  const egresos = movimientos.filter((m) => m.kind === "egress")
  const ultimo = movimientos.length > 0 ? movimientos[movimientos.length - 1] : null
  const scanIds = new Set(scanCheckpointIds)
  const scaleIds = new Set(scaleCheckpointIds)

  const egresables = delCamion
    .filter((m) => {
      if (m.status === "closed") return false
      const tieneArribo = arribos.some((mo) => mo.manifest_id === m.id)
      const tieneEgreso = egresos.some((mo) => mo.manifest_id === m.id)
      const congelado = lotes.some(
        (l) => l.manifest_id === m.id && (l.status === "in_quarantine" || l.status === "seized"),
      )
      return tieneArribo && !tieneEgreso && !congelado
    })
    .sort((a, b) => {
      const arriboA = arribos.find((mo) => mo.manifest_id === a.id)?.occurred_at ?? ""
      const arriboB = arribos.find((mo) => mo.manifest_id === b.id)?.occurred_at ?? ""
      return arriboA.localeCompare(arriboB)
    })

  return {
    truckId,
    manifestCount: delCamion.length,
    arrivalCount: arribos.length,
    egressCount: egresos.length,
    firstArrivalAt: arribos.length > 0 ? arribos[0].occurred_at : null,
    lastEgressAt: egresos.length > 0 ? egresos[egresos.length - 1].occurred_at : null,
    latestMovementKind: ultimo?.kind ?? null,
    latestMovementAt: ultimo?.occurred_at ?? null,
    hasDischargeOrSplit: movimientos.some((m) => m.kind === "discharge" || m.kind === "split"),
    openQuarantine: lotes.some((l) => l.status === "in_quarantine"),
    openSeizure: lotes.some((l) => l.status === "seized"),
    openScanner: lotes.some((l) => l.current_location_id !== null && scanIds.has(l.current_location_id)),
    openScale: lotes.some((l) => l.current_location_id !== null && scaleIds.has(l.current_location_id)),
    onTruckLots: lotes.filter((l) => l.status === "on_truck").length,
    egressibleManifestId: egresables[0]?.id ?? null,
    openManifests: delCamion
      .filter((m) => m.status !== "closed")
      .map((m) => ({ id: m.id, code: m.code, notes: m.notes, status: m.status, truckId: m.truck_id })),
  }
}

/** Checkpoint ids by kind (scan/scale) from the locations read. */
function checkpointIds(rows: { id: string; checkpoint_kind: string | null }[]): { scan: string[]; scale: string[] } {
  const scan: string[] = []
  const scale: string[] = []
  for (const row of rows) {
    if (row.checkpoint_kind === "scan") scan.push(row.id)
    else if (row.checkpoint_kind === "scale") scale.push(row.id)
  }
  return { scan, scale }
}

export interface TruckService {
  listar(filtros?: TruckFiltros): Promise<TruckRow[]>
  obtener(id: string): Promise<TruckRow | null>
  crear(datos: TruckInsert): Promise<TruckRow>
  actualizar(id: string, cambios: TruckUpdate): Promise<TruckRow>
  /** Truck entry: 'arrival' movement + base-status/rollup touches (ADR 0008). */
  registrarEntrada(manifestId: string, input?: MovementExecutionInput): Promise<MovementRow>
  /** Truck exit: 'egress' movement (truck.exit; admin/supervisor per rbac.md). */
  registrarSalida(manifestId: string, input?: MovementExecutionInput): Promise<MovementRow>
  /** Derived-status signals for the given trucks (bounded reads; T-21). */
  obtenerSeñales(truckIds: string[]): Promise<TruckSignals[]>
  /** Active transport companies, ordered by name (dialog select source). */
  listarCompanias(): Promise<TransportCompanyRow[]>
  /** Exact row count (select id head). Called only when a full page renders (T-02). */
  contar(filtros?: TruckFiltros): Promise<number>
}

export class SupabaseTruckService implements TruckService {
  private readonly client: SupabaseClient | null
  private readonly movements: SupabaseMovementService

  constructor(client: SupabaseClient | null) {
    this.client = client
    this.movements = new SupabaseMovementService(client)
  }

  async listar(filtros?: TruckFiltros): Promise<TruckRow[]> {
    const client = requireClient(this.client)
    let query = client.from("trucks").select(TRUCK_COLUMNS)

    if (filtros?.estado) query = query.eq("status", filtros.estado)
    if (filtros?.companiaId) query = query.eq("transport_company_id", filtros.companiaId)
    if (filtros?.buscar) query = query.ilike("plate", `%${filtros.buscar}%`)

    query = query.order("plate", { ascending: true })
    query = applyWindow(query, filtros)

    const { data, error } = await query
    if (error) throw new Error(`trucks: ${error.message}`)
    return (data ?? []) as TruckRow[]
  }

  async contar(filtros?: TruckFiltros): Promise<number> {
    const client = requireClient(this.client)
    let query = client.from("trucks").select("id", { count: "exact", head: true })
    if (filtros?.estado) query = query.eq("status", filtros.estado)
    if (filtros?.companiaId) query = query.eq("transport_company_id", filtros.companiaId)
    if (filtros?.buscar) query = query.ilike("plate", `%${filtros.buscar}%`)
    const { count, error } = await query
    if (error) throw new Error(`trucks count: ${error.message}`)
    return count ?? 0
  }

  async listarCompanias(): Promise<TransportCompanyRow[]> {
    const client = requireClient(this.client)
    const { data, error } = await client
      .from("transport_companies")
      .select(TRANSPORT_COMPANY_COLUMNS)
      .eq("status", "active")
      .order("name", { ascending: true })
    if (error) throw new Error(`transport_companies: ${error.message}`)
    return (data ?? []) as TransportCompanyRow[]
  }

  async obtenerSeñales(truckIds: string[]): Promise<TruckSignals[]> {
    if (truckIds.length === 0) return []
    const client = requireClient(this.client)
    const [manifestsRes, locationsRes] = await Promise.all([
      client
        .from("cargo_manifests")
        .select(MANIFEST_COLUMNS)
        .in("truck_id", truckIds),
      client
        .from("locations")
        .select("id, checkpoint_kind")
        .eq("type", "checkpoint"),
    ])
    if (manifestsRes.error) throw new Error(`trucks signals (manifests): ${manifestsRes.error.message}`)
    if (locationsRes.error) throw new Error(`trucks signals (locations): ${locationsRes.error.message}`)
    const checkpoints = checkpointIds((locationsRes.data ?? []) as { id: string; checkpoint_kind: string | null }[])
    const manifests = (manifestsRes.data ?? []) as CargoManifestRow[]
    const manifestIds = manifests.map((m) => m.id)
    if (manifestIds.length === 0) {
      return truckIds.map((id) => buildTruckSignals(id, [], [], [], checkpoints.scan, checkpoints.scale))
    }
    const [movementsRes, lotsRes] = await Promise.all([
      client
        .from("movements")
        .select(MOVEMENT_COLUMNS)
        .in("manifest_id", manifestIds),
      client
        .from("item_lots")
        .select(ITEM_LOT_COLUMNS)
        .in("manifest_id", manifestIds),
    ])
    if (movementsRes.error) throw new Error(`trucks signals (movements): ${movementsRes.error.message}`)
    if (lotsRes.error) throw new Error(`trucks signals (lots): ${lotsRes.error.message}`)
    const movements = (movementsRes.data ?? []) as MovementRow[]
    const lots = (lotsRes.data ?? []) as ItemLotRow[]
    return truckIds.map((id) => buildTruckSignals(id, manifests, movements, lots, checkpoints.scan, checkpoints.scale))
  }

  async obtener(id: string): Promise<TruckRow | null> {
    const client = requireClient(this.client)
    const { data, error } = await client
      .from("trucks")
      .select(TRUCK_COLUMNS)
      .eq("id", id)
      .maybeSingle()
    if (error) throw new Error(`truck ${id}: ${error.message}`)
    return (data as TruckRow | null) ?? null
  }

  async crear(datos: TruckInsert): Promise<TruckRow> {
    const client = requireClient(this.client)
    const { data, error } = await client
      .from("trucks")
      .insert({
        transport_company_id: datos.transport_company_id ?? null,
        plate: normalizePlate(datos.plate),
        capacity_kg: datos.capacity_kg ?? null,
        status: datos.status ?? "available",
      })
      .select(TRUCK_COLUMNS)
      .single()
    if (error) throw new Error(`trucks insert: ${error.message}`)
    return data as TruckRow
  }

  async actualizar(id: string, cambios: TruckUpdate): Promise<TruckRow> {
    const client = requireClient(this.client)
    const { data, error } = await client
      .from("trucks")
      .update({
        ...(cambios.transport_company_id !== undefined ? { transport_company_id: cambios.transport_company_id } : {}),
        ...(cambios.plate !== undefined ? { plate: normalizePlate(cambios.plate) } : {}),
        ...(cambios.capacity_kg !== undefined ? { capacity_kg: cambios.capacity_kg } : {}),
        ...(cambios.status !== undefined ? { status: cambios.status } : {}),
      })
      .eq("id", id)
      .select(TRUCK_COLUMNS)
      .single()
    if (error) throw new Error(`trucks update ${id}: ${error.message}`)
    return data as TruckRow
  }

  async registrarEntrada(manifestId: string, input?: MovementExecutionInput): Promise<MovementRow> {
    const client = requireClient(this.client)
    const { data: manifest, error: mError } = await client
      .from("cargo_manifests")
      .select(MANIFEST_COLUMNS)
      .eq("id", manifestId)
      .maybeSingle()
    if (mError) throw new Error(`manifest ${manifestId}: ${mError.message}`)
    if (!manifest) throw new Error(`Manifest ${manifestId} no encontrado`)
    const m = manifest as CargoManifestRow

    const movement = await this.movements.crearMovimiento({
      kind: "arrival",
      manifestId,
      facilityId: m.facility_id,
      operatorId: input?.operatorId ?? null,
      ocurridoEn: input?.ocurridoEn,
      operationKey: input?.operationKey,
      motivo: input?.motivo,
    })

    // Provisional rollup touches (documented in the header): the server
    // engine owns these transitions; RLS permits them under cargo.update.
    const manifestUpdate: { status: CargoManifestStatus } = { status: "in_playon" }
    const { error: manifestError } = await client
      .from("cargo_manifests")
      .update(manifestUpdate)
      .eq("id", manifestId)
    if (manifestError) throw new Error(`manifest rollup ${manifestId}: ${manifestError.message}`)

    if (manifest.truck_id) {
      const { error: truckError } = await client
        .from("trucks")
        .update({ status: "in_playon" })
        .eq("id", manifest.truck_id)
      if (truckError) throw new Error(`truck rollup ${manifest.truck_id}: ${truckError.message}`)
    }

    const { error: itemsError } = await client
      .from("cargo_items")
      .update({ status: "on_truck" })
      .eq("manifest_id", manifestId)
      .eq("status", "pending")
    if (itemsError) throw new Error(`items rollup ${manifestId}: ${itemsError.message}`)

    return movement
  }

  async registrarSalida(manifestId: string, input?: MovementExecutionInput): Promise<MovementRow> {
    const client = requireClient(this.client)
    const { data: manifest, error: mError } = await client
      .from("cargo_manifests")
      .select(MANIFEST_COLUMNS)
      .eq("id", manifestId)
      .maybeSingle()
    if (mError) throw new Error(`manifest ${manifestId}: ${mError.message}`)
    if (!manifest) throw new Error(`Manifest ${manifestId} no encontrado`)
    const m = manifest as CargoManifestRow

    const movement = await this.movements.crearMovimiento({
      kind: "egress",
      manifestId,
      facilityId: m.facility_id,
      operatorId: input?.operatorId ?? null,
      ocurridoEn: input?.ocurridoEn,
      operationKey: input?.operationKey,
      motivo: input?.motivo, // egress is a sensitive kind: reason recommended
    })

    if (manifest.truck_id) {
      const { error: truckError } = await client
        .from("trucks")
        .update({ status: "in_route" })
        .eq("id", manifest.truck_id)
      if (truckError) throw new Error(`truck rollup ${manifest.truck_id}: ${truckError.message}`)
    }

    return movement
  }
}