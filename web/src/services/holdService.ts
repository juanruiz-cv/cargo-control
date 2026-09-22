/**
 * Hold service — rezago (quarantine) & secuestro (seizure), Fase 10 (ADR 0011).
 *
 * Opening a case IS the engine command (spec §5): `ejecutarMovimiento` runs
 * guards I1..I7 (permission, frozen-lot gate, active destination with
 * allows_hold, required motivo/reason) and applies movement + lot freeze +
 * the append-only operation row + audit in ONE surface (special-areas.md
 * §REZAGO/§SECUESTRO). The client never inserts a second op row — it fetches
 * the engine-created row back by movement_id.
 *
 * Resolution is a SERVER-SIDE supervisor flow by design (rbac.md §3,
 * states.md): resolving = movement kind 'release' + a status update that RLS
 * DOES NOT grant the client (quarantine_operations/seizure_operations have
 * no UPDATE/DELETE policies, 0004_rls.sql). The Supabase `resolver`
 * therefore reports the engine dependency explicitly (ENGINE_DEPENDENCIA);
 * the DEMO adapter implements the full flow in memory (dev only).
 */

import type { SupabaseClient } from "@supabase/supabase-js"

import {
  HOLD_OPEN_COLUMNS,
  QUARANTINE_OP_COLUMNS,
  SEIZURE_OP_COLUMNS,
} from "@/services/columns"
import { MovementEngineError, SupabaseMovementService } from "@/services/movementService"
import type { MovementExecutionInput, QuarantineHoldFiltros, SeizureHoldFiltros } from "@/services/shared"
import type {
  HoldOpenRow,
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
  /**
   * hold_open view (0005_views.sql v6): OPEN rezago/secuestro cases with
   * lot/item/manifest context (frozen/blocked visibility, special-areas.md
   * §Derived views). Rows are open-only by view definition.
   */
  obtenerAbiertos(kind?: "quarantine" | "seizure"): Promise<HoldOpenRow[]>
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

/**
 * Fetch the operation row the engine created for `movementId`. The client
 * never inserts op rows itself (ADR 0011 append-only; the engine wrote them).
 */
async function fetchHoldRow<T>(
  client: SupabaseClient,
  table: "quarantine_operations" | "seizure_operations",
  columns: string,
  movementId: number,
): Promise<T> {
  const { data, error } = await client
    .from(table)
    .select(columns)
    .eq("movement_id", movementId)
    .maybeSingle()
  if (error) throw new Error(`${table} (movement ${movementId}): ${error.message}`)
  if (!data) throw new Error(`La operación de ${table} no se registró al ejecutar el movimiento (engine)`)
  return data as T
}

export class SupabaseHoldService implements HoldService {
  readonly quarantine: QuarantineHoldService
  readonly seizure: SeizureHoldService
  private readonly client: SupabaseClient | null

  constructor(client: SupabaseClient | null) {
    this.client = client
    this.quarantine = new SupabaseQuarantineHoldService(client)
    this.seizure = new SupabaseSeizureHoldService(client)
  }

  async obtenerAbiertos(kind?: "quarantine" | "seizure"): Promise<HoldOpenRow[]> {
    const client = requireClient(this.client)
    let query = client.from("hold_open").select(HOLD_OPEN_COLUMNS)
    if (kind) query = query.eq("hold_type", kind)
    query = query.order("opened_at", { ascending: false })

    const { data, error } = await query
    if (error) throw new Error(`hold_open: ${error.message}`)
    return (data ?? []) as HoldOpenRow[]
  }
}

class SupabaseQuarantineHoldService implements QuarantineHoldService {
  private readonly client: SupabaseClient | null
  private readonly movements: SupabaseMovementService

  constructor(client: SupabaseClient | null) {
    this.client = client
    this.movements = new SupabaseMovementService(client)
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

    // Spec §5: opening a hold IS the engine command — guards I1..I7
    // (quarantine.create permission, frozen-lot gate, active destination
    // with allows_hold, required motivo) + whole-lot transition + the
    // append-only quarantine_operations row + audit, all in ONE surface.
    const resultado = await this.movements.ejecutarMovimiento({
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

    // The engine inserted the op row with the movement; fetch it back by
    // movement_id instead of inserting a second row (ADR 0011 append-only).
    return fetchHoldRow<QuarantineOperationRow>(
      client,
      "quarantine_operations",
      QUARANTINE_OP_COLUMNS,
      resultado.movimiento.id,
    )
  }

  async resolver(id: string, _input: HoldResolveInput): Promise<QuarantineOperationRow> {
    throw new MovementEngineError(
      [],
      "ENGINE_DEPENDENCIA",
      `Resolver rezago ${id} requiere el flujo server-side de supervisor (movimiento 'release' + update de estado): ` +
        "RLS no concede UPDATE sobre quarantine_operations (ADR 0011). " +
        "El adaptador DEMO implementa la resolución completa para desarrollo.",
    )
  }
}

class SupabaseSeizureHoldService implements SeizureHoldService {
  private readonly client: SupabaseClient | null
  private readonly movements: SupabaseMovementService

  constructor(client: SupabaseClient | null) {
    this.client = client
    this.movements = new SupabaseMovementService(client)
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

    // Spec §5: opening a legal hold IS the engine command — guards I1..I7
    // (seizure.create permission, frozen-lot gate, active destination with
    // allows_hold, required motivo) + whole-lot transition + the append-only
    // seizure_operations row (`motivo` carries the legal_ref; the engine
    // writes it to `legal_ref`) + audit, all in ONE surface.
    const resultado = await this.movements.ejecutarMovimiento({
      kind: "seizure",
      manifestId: lot.manifest_id,
      operatorId: input.operatorId ?? null,
      ocurridoEn: input.ocurridoEn,
      operationKey: input.operationKey,
      motivo: input.legalRef,
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

    // The engine inserted the op row with the movement; fetch it back by
    // movement_id instead of inserting a second row (ADR 0011 append-only).
    return fetchHoldRow<SeizureOperationRow>(
      client,
      "seizure_operations",
      SEIZURE_OP_COLUMNS,
      resultado.movimiento.id,
    )
  }

  async resolver(id: string, _input: HoldResolveInput): Promise<SeizureOperationRow> {
    throw new MovementEngineError(
      [],
      "ENGINE_DEPENDENCIA",
      `Resolver secuestro ${id} requiere el flujo server-side de supervisor (movimiento 'release' + update de estado): ` +
        "RLS no concede UPDATE sobre seizure_operations (ADR 0011). " +
        "El adaptador DEMO implementa la resolución completa para desarrollo.",
    )
  }
}