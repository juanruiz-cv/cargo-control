/**
 * Movement service — append-only spine (movement-engine.md).
 *
 * - `movement_kind_permitted` mirrors the SQL helper of
 *   0003_authorization_helpers.sql client-side FOR UX ONLY; the RLS INSERT
 *   policy (0004_rls.sql movement_insert) re-validates every write
 *   server-side. Security lives in the database, never in button visibility.
 * - The Supabase implementation builds movement + movement_items as
 *   sequential inserts; the DEPLOYED transactional path (BEGIN → locks →
 *   validate → insert → audit → COMMIT, movement-engine.md §Transactional)
 *   runs in the server-side engine (Edge Function), which supersedes this
 *   provisional client path. Column list and payloads are identical for
 *   both.
 */

import type { SupabaseClient } from "@supabase/supabase-js"

import { MOVEMENT_COLUMNS } from "@/services/columns"
import type {
  CreateMovementInput,
  MovementFiltros,
  PaginationFiltros,
} from "@/services/shared"
import type {
  MovementItemRow,
  MovementKind,
  MovementRow,
  PermissionCode,
  QuarantineOperationRow,
  ScannerOperationRow,
  ScaleOperationRow,
  SeizureOperationRow,
} from "@/types"

function requireClient(client: SupabaseClient | null): SupabaseClient {
  if (!client) {
    throw new Error("Supabase no configurado — activá VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY")
  }
  return client
}

/**
 * kind → permission map, transpose of the SQL function
 * `movement_kind_permitted` (0003_authorization_helpers.sql §Type map,
 * authorization.md §3). `release` maps to the originating hold's create
 * permission (either code unlocks), with the supervisor gate enforced
 * server-side (rbac.md §3).
 */
export const MOVEMENT_KIND_PERMISSION: Record<
  MovementKind,
  PermissionCode | readonly PermissionCode[]
> = {
  arrival: "cargo.update",
  discharge: "cargo.update",
  split: "cargo.update",
  store: "cargo.update",
  correction: "cargo.update",
  transfer: "cargo.transfer",
  load_out: "cargo.transfer",
  return_to_truck: "cargo.transfer",
  scan_in: "scanner.create",
  scan_out: "scanner.create",
  scale: "scale.create",
  quarantine: "quarantine.create",
  seizure: "seizure.create",
  release: ["quarantine.create", "seizure.create"],
  egress: "truck.exit",
}

/** Movement detail: spine row + per-lot items + specialized operations. */
export interface MovementDetail {
  movement: MovementRow
  items: MovementItemRow[]
  scannerOps: ScannerOperationRow[]
  scaleOps: ScaleOperationRow[]
  quarantineOps: QuarantineOperationRow[]
  seizureOps: SeizureOperationRow[]
}

export interface MovementService {
  /** Timeline query, ordered occurred_at desc, id desc (movement-engine.md §Timeline). */
  listarMovimientos(filtros?: MovementFiltros): Promise<MovementRow[]>
  obtenerMovimiento(id: number): Promise<MovementDetail | null>
  /**
   * UX pre-check via the SQL helper (0003). The RLS policy is the real
   * validation; this never authorizes anything by itself.
   */
  movimientoPermitido(kind: MovementKind): Promise<boolean>
  /** Movements that touched a given lot (per-lot traceability). */
  listarPorItemLot(itemLotId: string, filtros?: PaginationFiltros): Promise<MovementRow[]>
  /** Create movement + movement_items (provisional client path; engine is authoritative). */
  crearMovimiento(input: CreateMovementInput): Promise<MovementRow>
}

export class SupabaseMovementService implements MovementService {
  private readonly client: SupabaseClient | null

  constructor(client: SupabaseClient | null) {
    this.client = client
  }

  async listarMovimientos(filtros?: MovementFiltros): Promise<MovementRow[]> {
    const client = requireClient(this.client)
    let query = client.from("movements").select(MOVEMENT_COLUMNS)

    if (filtros?.facilidadId) query = query.eq("facility_id", filtros.facilidadId)
    if (filtros?.kind) query = query.eq("kind", filtros.kind)
    if (filtros?.manifestId) query = query.eq("manifest_id", filtros.manifestId)
    if (filtros?.itemLotId) {
      // The timeline is lot-centric: resolve through movement_items.
      const { data: items } = await client
        .from("movement_items")
        .select("movement_id")
        .eq("item_lot_id", filtros.itemLotId)
      const movementIds = (items ?? []).map((i) => i.movement_id as number)
      if (movementIds.length === 0) return []
      query = query.in("id", movementIds)
    }
    if (filtros?.camionId) {
      const { data: manifests } = await client
        .from("cargo_manifests")
        .select("id")
        .eq("truck_id", filtros.camionId)
      const manifestIds = (manifests ?? []).map((m) => m.id as string)
      if (manifestIds.length === 0) return []
      query = query.in("manifest_id", manifestIds)
    }
    if (filtros?.operadorId) query = query.eq("operator_id", filtros.operadorId)
    if (filtros?.since) query = query.gte("occurred_at", filtros.since)
    if (filtros?.until) query = query.lt("occurred_at", filtros.until)

    query = query.order("occurred_at", { ascending: false }).order("id", { ascending: false })
    query = applyWindow(query, filtros)

    const { data, error } = await query
    if (error) throw new Error(`movements: ${error.message}`)
    return (data ?? []) as MovementRow[]
  }

  async obtenerMovimiento(id: number): Promise<MovementDetail | null> {
    const client = requireClient(this.client)
    const { data: movement, error: movError } = await client
      .from("movements")
      .select(MOVEMENT_COLUMNS)
      .eq("id", id)
      .maybeSingle()
    if (movError) throw new Error(`movement ${id}: ${movError.message}`)
    if (!movement) return null

    const [items, scannerOps, scaleOps, quarantineOps, seizureOps] = await Promise.all([
      client
        .from("movement_items")
        .select("id, movement_id, item_lot_id, quantity, from_location_id, to_location_id, from_truck_id, to_truck_id, notes")
        .eq("movement_id", id),
      client
        .from("scanner_operations")
        .select("id, organization_id, movement_id, item_lot_id, scanned_code, device_id, result, payload, scanned_at, operator_id")
        .eq("movement_id", id),
      client
        .from("scale_operations")
        .select("id, organization_id, movement_id, item_lot_id, gross_kg, tare_kg, net_kg, expected_kg, tolerance_kg, within_tolerance, device_id, weighed_at, operator_id")
        .eq("movement_id", id),
      client
        .from("quarantine_operations")
        .select("id, organization_id, movement_id, item_lot_id, reason, status, opened_by, opened_at, resolved_by, resolved_at, resolution_note")
        .eq("movement_id", id),
      client
        .from("seizure_operations")
        .select("id, organization_id, movement_id, item_lot_id, legal_ref, status, opened_by, opened_at, resolved_by, resolved_at, resolution_note")
        .eq("movement_id", id),
    ])

    return {
      movement: movement as MovementRow,
      items: (items.data ?? []) as MovementItemRow[],
      scannerOps: (scannerOps.data ?? []) as ScannerOperationRow[],
      scaleOps: (scaleOps.data ?? []) as ScaleOperationRow[],
      quarantineOps: (quarantineOps.data ?? []) as QuarantineOperationRow[],
      seizureOps: (seizureOps.data ?? []) as SeizureOperationRow[],
    }
  }

  async movimientoPermitido(kind: MovementKind): Promise<boolean> {
    const client = requireClient(this.client)
    const { data, error } = await client.rpc("movement_kind_permitted", { _kind: kind })
    if (error) {
      throw new Error(`movement_kind_permitted('${kind}'): ${error.message}`)
    }
    return data as boolean
  }

  async listarPorItemLot(itemLotId: string, filtros?: PaginationFiltros): Promise<MovementRow[]> {
    return this.listarMovimientos({ itemLotId, ...filtros })
  }

  async crearMovimiento(input: CreateMovementInput): Promise<MovementRow> {
    const client = requireClient(this.client)

    // UX pre-check only — RLS (movement_insert → movement_kind_permitted)
    // re-validates server-side on INSERT.
    const permitido = await this.movimientoPermitido(input.kind)
    if (!permitido) {
      throw new Error(`Movimiento tipo '${input.kind}' no permitido para el usuario actual`)
    }

    const { data: movement, error: movError } = await client
      .from("movements")
      .insert({
        kind: input.kind,
        facility_id: input.facilityId ?? null,
        manifest_id: input.manifestId ?? null,
        operator_id: input.operatorId ?? null,
        location_id: input.locationId ?? null,
        reason: input.motivo ?? null,
        previous_movement_id: input.previousMovementId ?? null,
        operation_key: input.operationKey ?? null,
        payload: input.payload ?? null,
        ...(input.ocurridoEn !== undefined ? { occurred_at: input.ocurridoEn } : {}),
      })
      .select(MOVEMENT_COLUMNS)
      .single()
    if (movError) throw new Error(`movements insert (${input.kind}): ${movError.message}`)

    if (input.items && input.items.length > 0) {
      const { error: itemsError } = await client.from("movement_items").insert(
        input.items.map((item) => ({
          movement_id: (movement as MovementRow).id,
          item_lot_id: item.itemLotId,
          quantity: item.cantidad,
          from_location_id: item.origenLocationId ?? null,
          to_location_id: item.destinoLocationId ?? null,
          from_truck_id: item.origenTruckId ?? null,
          to_truck_id: item.destinoTruckId ?? null,
          notes: item.notas ?? null,
        })),
      )
      if (itemsError) throw new Error(`movement_items insert: ${itemsError.message}`)
    }

    return movement as MovementRow
  }
}

/** Bounded reads only: the client never loads unbounded history (audit.md). */
function applyWindow<T>(
  query: { range: (start: number, end: number) => T },
  filtros?: PaginationFiltros,
): T {
  const limit = Math.min(filtros?.limit ?? 100, 500)
  const offset = filtros?.offset ?? 0
  return query.range(offset, offset + limit - 1)
}