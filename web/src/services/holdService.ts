/**
 * Hold service — rezago (quarantine) & secuestro (seizure), Fase 10 (ADR 0011).
 *
 * Resolution is a SERVER-SIDE supervisor flow by design (rbac.md §3,
 * states.md): opening = movement kind quarantine/seizure + operation row +
 * lot freeze; resolving = movement kind 'release' + a status update that RLS
 * DOES NOT grant the client (quarantine_operations/seizure_operations have
 * no UPDATE/DELETE policies, 0004_rls.sql). The Supabase `resolver`
 * therefore reports the engine dependency explicitly; the DEMO adapter
 * implements the full flow in memory (dev only).
 */

import type { SupabaseClient } from "@supabase/supabase-js"

import {
  QUARANTINE_OP_COLUMNS,
  SEIZURE_OP_COLUMNS,
} from "@/services/columns"
import { SupabaseMovementService } from "@/services/movementService"
import type { MovementExecutionInput, QuarantineHoldFiltros, SeizureHoldFiltros } from "@/services/shared"
import type {
  ItemLotRow,
  QuarantineOperationRow,
  SeizureOperationRow,
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

export interface QuarantineOpenInput extends MovementExecutionInput {
  itemLotId: string
  /** Required (flows.md guard table: quarantine → reason required). */
  reason: string
  /** Destination location; must exist, be active and allows_hold. */
  locationId?: string
  notas?: string | null
}

export interface SeizureOpenInput extends MovementExecutionInput {
  itemLotId: string
  /** Required (flows.md guard table: seizure → legal_ref required). */
  legalRef: string
  locationId?: string
  notas?: string | null
}

export interface HoldResolveInput {
  resolutionNote: string
  resolvedBy?: string
  operationKey?: string
}

export interface QuarantineHoldService {
  listar(filtros?: QuarantineHoldFiltros): Promise<QuarantineOperationRow[]>
  crear(input: QuarantineOpenInput): Promise<QuarantineOperationRow>
  /** Server-side supervisor flow; the client path reports the engine dependency. */
  resolver(id: string, input: HoldResolveInput): Promise<QuarantineOperationRow>
}

export interface SeizureHoldService {
  listar(filtros?: SeizureHoldFiltros): Promise<SeizureOperationRow[]>
  crear(input: SeizureOpenInput): Promise<SeizureOperationRow>
  /** Server-side supervisor flow; the client path reports the engine dependency. */
  resolver(id: string, input: HoldResolveInput): Promise<SeizureOperationRow>
}

export interface HoldService {
  quarantine: QuarantineHoldService
  seizure: SeizureHoldService
}

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

/** Destination must exist, be active and allow holds (rezago/secuestro staging). */
async function assertHoldLocation(client: SupabaseClient, locationId?: string): Promise<void> {
  if (!locationId) return
  const { data, error } = await client
    .from("locations")
    .select("id, active, allows_hold")
    .eq("id", locationId)
    .maybeSingle()
  if (error) throw new Error(`location ${locationId}: ${error.message}`)
  if (!data) throw new Error(`La location ${locationId} no existe`)
  if (!data.active) throw new Error(`La location ${locationId} está inactiva`)
  if (!data.allows_hold) throw new Error(`La location ${locationId} no permite holds (allows_hold=false)`)
}

export class SupabaseHoldService implements HoldService {
  readonly quarantine: QuarantineHoldService
  readonly seizure: SeizureHoldService
  private readonly movements: SupabaseMovementService

  constructor(client: SupabaseClient | null) {
    this.movements = new SupabaseMovementService(client)
    this.quarantine = new SupabaseQuarantineHoldService(client, this.movements)
    this.seizure = new SupabaseSeizureHoldService(client, this.movements)
  }
}

class SupabaseQuarantineHoldService implements QuarantineHoldService {
  private readonly client: SupabaseClient | null
  private readonly movements: SupabaseMovementService

  constructor(client: SupabaseClient | null, movements: SupabaseMovementService) {
    this.client = client
    this.movements = movements
  }

  async listar(filtros?: QuarantineHoldFiltros): Promise<QuarantineOperationRow[]> {
    const client = requireClient(this.client)
    let query = client.from("quarantine_operations").select(QUARANTINE_OP_COLUMNS)

    if (filtros?.estado) query = query.eq("status", filtros.estado)
    if (filtros?.itemLotId) query = query.eq("item_lot_id", filtros.itemLotId)
    if (filtros?.movementId !== undefined) query = query.eq("movement_id", filtros.movementId)
    if (filtros?.abiertoPor) query = query.eq("opened_by", filtros.abiertoPor)
    if (filtros?.since) query = query.gte("opened_at", filtros.since)
    if (filtros?.until) query = query.lt("opened_at", filtros.until)

    query = query.order("opened_at", { ascending: false })
    query = applyWindow(query, filtros)

    const { data, error } = await query
    if (error) throw new Error(`quarantine_operations: ${error.message}`)
    return (data ?? []) as QuarantineOperationRow[]
  }

  async crear(input: QuarantineOpenInput): Promise<QuarantineOperationRow> {
    const client = requireClient(this.client)
    if (!input.reason.trim()) throw new Error("El motivo (reason) es obligatorio para abrir un rezago")
    if (!input.operatorId) throw new Error("operatorId es obligatorio al abrir un rezago (opened_by es NOT NULL)")

    const lot = await fetchLot(client, input.itemLotId)
    await assertHoldLocation(client, input.locationId)

    const movement = await this.movements.crearMovimiento({
      kind: "quarantine",
      manifestId: lot.manifest_id,
      operatorId: input.operatorId ?? null,
      ocurridoEn: input.ocurridoEn,
      operationKey: input.operationKey,
      motivo: input.reason,
      locationId: input.locationId ?? lot.current_location_id,
      items: [
        {
          itemLotId: lot.id,
          cantidad: lot.quantity,
          origenLocationId: lot.current_location_id,
          destinoLocationId: input.locationId ?? lot.current_location_id,
          notas: input.notas,
        },
      ],
    })

    const { data: operation, error: opError } = await client
      .from("quarantine_operations")
      .insert({
        movement_id: movement.id,
        item_lot_id: input.itemLotId,
        reason: input.reason,
        opened_by: input.operatorId,
      })
      .select(QUARANTINE_OP_COLUMNS)
      .single()
    if (opError) throw new Error(`quarantine_operations insert: ${opError.message}`)

    // Freeze the lot (states.md): status in_quarantine + placement at the hold area.
    const { error: lotError } = await client
      .from("item_lots")
      .update({
        status: "in_quarantine",
        current_location_id: input.locationId ?? lot.current_location_id,
        current_truck_id: null,
      })
      .eq("id", lot.id)
    if (lotError) throw new Error(`item_lots update ${lot.id}: ${lotError.message}`)

    return operation as QuarantineOperationRow
  }

  async resolver(id: string, _input: HoldResolveInput): Promise<QuarantineOperationRow> {
    throw new Error(
      `Resolver rezago ${id} requiere el flujo server-side de supervisor (movimiento 'release' + update de estado): ` +
        "RLS no concede UPDATE sobre quarantine_operations (ADR 0011). " +
        "El adaptador DEMO implementa la resolución completa para desarrollo.",
    )
  }
}

class SupabaseSeizureHoldService implements SeizureHoldService {
  private readonly client: SupabaseClient | null
  private readonly movements: SupabaseMovementService

  constructor(client: SupabaseClient | null, movements: SupabaseMovementService) {
    this.client = client
    this.movements = movements
  }

  async listar(filtros?: SeizureHoldFiltros): Promise<SeizureOperationRow[]> {
    const client = requireClient(this.client)
    let query = client.from("seizure_operations").select(SEIZURE_OP_COLUMNS)

    if (filtros?.estado) query = query.eq("status", filtros.estado)
    if (filtros?.itemLotId) query = query.eq("item_lot_id", filtros.itemLotId)
    if (filtros?.movementId !== undefined) query = query.eq("movement_id", filtros.movementId)
    if (filtros?.abiertoPor) query = query.eq("opened_by", filtros.abiertoPor)
    if (filtros?.since) query = query.gte("opened_at", filtros.since)
    if (filtros?.until) query = query.lt("opened_at", filtros.until)

    query = query.order("opened_at", { ascending: false })
    query = applyWindow(query, filtros)

    const { data, error } = await query
    if (error) throw new Error(`seizure_operations: ${error.message}`)
    return (data ?? []) as SeizureOperationRow[]
  }

  async crear(input: SeizureOpenInput): Promise<SeizureOperationRow> {
    const client = requireClient(this.client)
    if (!input.legalRef.trim()) throw new Error("La referencia legal (legal_ref) es obligatoria para abrir un secuestro")
    if (!input.operatorId) throw new Error("operatorId es obligatorio al abrir un secuestro (opened_by es NOT NULL)")

    const lot = await fetchLot(client, input.itemLotId)
    await assertHoldLocation(client, input.locationId)

    const movement = await this.movements.crearMovimiento({
      kind: "seizure",
      manifestId: lot.manifest_id,
      operatorId: input.operatorId ?? null,
      ocurridoEn: input.ocurridoEn,
      operationKey: input.operationKey,
      motivo: input.notas ?? null,
      locationId: input.locationId ?? lot.current_location_id,
      items: [
        {
          itemLotId: lot.id,
          cantidad: lot.quantity,
          origenLocationId: lot.current_location_id,
          destinoLocationId: input.locationId ?? lot.current_location_id,
          notas: input.notas,
        },
      ],
    })

    const { data: operation, error: opError } = await client
      .from("seizure_operations")
      .insert({
        movement_id: movement.id,
        item_lot_id: input.itemLotId,
        legal_ref: input.legalRef,
        opened_by: input.operatorId,
      })
      .select(SEIZURE_OP_COLUMNS)
      .single()
    if (opError) throw new Error(`seizure_operations insert: ${opError.message}`)

    // Block the lot (states.md): status seized + placement at the hold area.
    const { error: lotError } = await client
      .from("item_lots")
      .update({
        status: "seized",
        current_location_id: input.locationId ?? lot.current_location_id,
        current_truck_id: null,
      })
      .eq("id", lot.id)
    if (lotError) throw new Error(`item_lots update ${lot.id}: ${lotError.message}`)

    return operation as SeizureOperationRow
  }

  async resolver(id: string, _input: HoldResolveInput): Promise<SeizureOperationRow> {
    throw new Error(
      `Resolver secuestro ${id} requiere el flujo server-side de supervisor (movimiento 'release' + update de estado): ` +
        "RLS no concede UPDATE sobre seizure_operations (ADR 0011). " +
        "El adaptador DEMO implementa la resolución completa para desarrollo.",
    )
  }
}