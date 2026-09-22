/**
 * Movement service — append-only spine (movement-engine.md) + engine surface.
 *
 * - `movement_kind_permitted` mirrors the SQL helper of
 *   0003_authorization_helpers.sql client-side FOR UX ONLY; the RLS INSERT
 *   policy (0004_rls.sql movement_insert) re-validates every write
 *   server-side. Security lives in the database, never in button visibility.
 * - `ejecutarMovimiento` runs the full guard pipeline (I1..I7, pure module
 *   `@/lib/movement-guards`) with bounded reads, then applies the mutation.
 *   The DEPLOYED transactional path (BEGIN → locks → validate → insert →
 *   audit → COMMIT, movement-engine.md §Transactional) runs in the
 *   server-side engine (Edge Function) and supersedes this provisional
 *   client path. Column lists and payloads are identical for both.
 * - REST-safe subset on this surface: whole-lot transitions and
 *   append-only corrections. Multi-entity rollups (arrival, egress) and
 *   split (child lot + parent reduction, ADR 0003 Σ) raise
 *   `MovementEngineError(codigo="ENGINE_DEPENDENCIA")` instead of faking
 *   non-atomic writes (same stance as cargoService's splitItem).
 * - audit_log is written ONLY by triggers/engine (audit.md §Registration
 *   doctrine; RLS grants no INSERT) — this class never writes audit rows.
 */

import type { SupabaseClient } from "@supabase/supabase-js"

import {
  CARGO_ITEM_COLUMNS,
  ITEM_LOT_COLUMNS,
  LOCATION_COLUMNS,
  LOCATION_OCCUPANCY_COLUMNS,
  MANIFEST_COLUMNS,
  MOVEMENT_COLUMNS,
  QUARANTINE_OP_COLUMNS,
  SEIZURE_OP_COLUMNS,
} from "@/services/columns"
import {
  esReplayDuplicado,
  fallosDe,
  hayFallos,
  MOVEMENT_KIND_PERMISSION,
  validarMovimiento,
} from "@/lib/movement-guards"
import type {
  EngineCandidate,
  EngineCandidateItem,
  GuardResult,
  ValidationContext,
} from "@/lib/movement-guards"
import type {
  CreateMovementInput,
  MovementFiltros,
  PaginationFiltros,
} from "@/services/shared"
import type {
  CargoItemRow,
  CargoManifestRow,
  ItemLotRow,
  LocationOccupancyRow,
  LocationRow,
  MovementItemRow,
  MovementKind,
  MovementRow,
  PermissionCode,
  QuarantineOperationRow,
  RoleCode,
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

// Re-exported from the pure guards module so the adapters demo keep
// importing the kind→permission map from here (no runtime cycle).
export { MOVEMENT_KIND_PERMISSION }

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

  /**
   * Engine command: runs guards I1..I7 (@/lib/movement-guards) against a
   * bounded read model, then applies the safe mutation. Throws
   * `MovementEngineError` when guards fail or the kind needs the server-side
   * engine (split / arrival / egress). Replays the SAME operation_key return
   * the existing movement with `duplicado: true` (ME-07) — never a second row.
   */
  ejecutarMovimiento(input: CreateMovementInput): Promise<EngineResultado>
  /** Idempotency lookup — movements.operation_key is unique per org (ADR 0010). */
  buscarPorOperationKey(operationKey: string): Promise<MovementRow | null>
  /** Fresh idempotency key: `${kind}:<uuid>` (fallback keyed by time + random). */
  generarOperationKey(kind: MovementKind): string
  /** Append-only correction of an existing movement (business-rules.md §8, AC-E8-3). */
  registrarCorreccion(movementId: number, motivo: string, operationKey?: string | null): Promise<MovementRow>
}

/** Engine verdict: applied movement, or an idempotent replay (ME-07). */
export interface EngineResultado {
  movimiento: MovementRow
  /** true ⇒ the caller's operation_key already produced this row (replay). */
  duplicado: boolean
  /** Every guard verdict (pass + fail); empty when `duplicado` short-circuits. */
  validaciones: GuardResult[]
}

/** Engine rejection carrying the aggregate guard verdicts (never first-fail). */
export class MovementEngineError extends Error {
  readonly validaciones: GuardResult[]
  /** "VALIDACION" (guards failed) or "ENGINE_DEPENDENCIA" (server-side engine owns it). */
  readonly codigo: string

  constructor(validaciones: GuardResult[], codigo = "VALIDACION", mensaje?: string) {
    const falladas = fallosDe(validaciones)
    super(
      mensaje ??
        (falladas.length > 0
          ? falladas.map((v) => `[${v.guard} ${v.code}] ${v.message}`).join(" · ")
          : "Movimiento rechazado por el engine"),
    )
    this.name = "MovementEngineError"
    this.validaciones = validaciones
    this.codigo = codigo
  }
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

  // -------------------------------------------------------------------
  // Engine surface (I1..I7 + safe mutation)
  // -------------------------------------------------------------------

  async ejecutarMovimiento(input: CreateMovementInput): Promise<EngineResultado> {
    const opKey = input.operationKey ?? null

    // ME-07 fast path: the SAME operation_key already produced a movement.
    if (opKey) {
      const existente = await this.buscarPorOperationKey(opKey)
      if (existente) {
        return { movimiento: existente, duplicado: true, validaciones: [] }
      }
    }

    const ctx = await this.armarContexto(input, opKey)
    const candidato: EngineCandidate = {
      kind: input.kind,
      manifestId: input.manifestId ?? null,
      facilityId: input.facilityId ?? null,
      locationId: input.locationId ?? null,
      motivo: input.motivo ?? null,
      operationKey: opKey,
      previousMovementId: input.previousMovementId ?? null,
      items: input.items as EngineCandidateItem[] | undefined,
    }

    const validaciones = validarMovimiento(candidato, ctx)

    // Race-safe replay: I7 may detect the duplicate inside the pipeline.
    if (esReplayDuplicado(validaciones) && ctx.existentePorOperationKey) {
      return { movimiento: ctx.existentePorOperationKey, duplicado: true, validaciones: [] }
    }
    if (hayFallos(validaciones)) {
      throw new MovementEngineError(validaciones)
    }

    const movimiento = await this.ejecutarSupabase(input, ctx, opKey)
    return { movimiento, duplicado: false, validaciones }
  }

  async buscarPorOperationKey(operationKey: string): Promise<MovementRow | null> {
    const client = requireClient(this.client)
    const { data, error } = await client
      .from("movements")
      .select(MOVEMENT_COLUMNS)
      .eq("operation_key", operationKey)
      .maybeSingle()
    if (error) throw new Error(`movements por operation_key: ${error.message}`)
    return (data as MovementRow | null) ?? null
  }

  generarOperationKey(kind: MovementKind): string {
    const id =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
    return `${kind}:${id}`
  }

  async registrarCorreccion(
    movementId: number,
    motivo: string,
    operationKey?: string | null,
  ): Promise<MovementRow> {
    const client = requireClient(this.client)
    const { data: original, error } = await client
      .from("movements")
      .select(MOVEMENT_COLUMNS)
      .eq("id", movementId)
      .maybeSingle()
    if (error) throw new Error(`movement ${movementId}: ${error.message}`)
    if (!original) {
      throw new MovementEngineError([], "VALIDACION", `El movimiento #${movementId} no existe`)
    }
    // business-rules.md §8 (AC-E8-3): la corrección hereda el contexto del
    // movimiento original (manifest/facility/ubicación), nunca lleva items.
    const o = original as MovementRow
    const resultado = await this.ejecutarMovimiento({
      kind: "correction",
      manifestId: o.manifest_id ?? null,
      facilityId: o.facility_id ?? null,
      locationId: o.location_id ?? null,
      previousMovementId: movementId,
      motivo,
      operationKey,
    })
    return resultado.movimiento
  }

  /**
   * Bounded read model for the guard pipeline. Every read is id-filtered,
   * never unbounded history (audit.md §Query design). I1 vectors come from
   * the authoritative RPC (`movement_kind_permitted`) + `has_role` only for
   * release (rbac.md §3); occupancy comes from the derived
   * `location_occupancy` view so I3/I4 and the DB agree (0005_views.sql).
   */
  private async armarContexto(
    input: CreateMovementInput,
    opKey: string | null,
  ): Promise<ValidationContext> {
    const client = requireClient(this.client)

    // --- I1 ---
    let permisos: PermissionCode[] = []
    const requerido = MOVEMENT_KIND_PERMISSION[input.kind]
    const requeridos = (Array.isArray(requerido) ? requerido : [requerido]) as PermissionCode[]
    const permitido = await this.movimientoPermitido(input.kind)
    if (permitido) permisos = [...requeridos]

    let roles: RoleCode[] = []
    if (input.kind === "release") {
      const [adminRes, supRes] = await Promise.all([
        client.rpc("has_role", { _role: "admin" }),
        client.rpc("has_role", { _role: "supervisor" }),
      ])
      if (!adminRes.error && adminRes.data) roles.push("admin")
      if (!supRes.error && supRes.data) roles.push("supervisor")
    }

    // --- lotes e ítems involucrados ---
    const items = input.items ?? []
    const lotIds = [...new Set(items.map((i) => i.itemLotId))]

    const lotes = new Map<string, ItemLotRow>()
    if (lotIds.length > 0) {
      const { data, error } = await client
        .from("item_lots")
        .select(ITEM_LOT_COLUMNS)
        .in("id", lotIds)
      if (error) throw new Error(`item_lots: ${error.message}`)
      for (const row of data ?? []) lotes.set(row.id, row)
    }

    // egress no lleva items, pero I6 necesita TODOS los lotes del manifiesto
    // para el chequeo de retenidos (AC-E2-2) — lectura acotada por manifiesto.
    if (input.kind === "egress" && input.manifestId) {
      const { data, error } = await client
        .from("item_lots")
        .select(ITEM_LOT_COLUMNS)
        .eq("manifest_id", input.manifestId)
      if (error) throw new Error(`item_lots (egress, por manifiesto): ${error.message}`)
      for (const row of data ?? []) {
        if (!lotes.has(row.id)) lotes.set(row.id, row)
      }
    }

    const cargoItemIds = [...new Set([...lotes.values()].map((l) => l.cargo_item_id))]
    const itemsMap = new Map<string, CargoItemRow>()
    if (cargoItemIds.length > 0) {
      const { data, error } = await client
        .from("cargo_items")
        .select(CARGO_ITEM_COLUMNS)
        .in("id", cargoItemIds)
      if (error) throw new Error(`cargo_items: ${error.message}`)
      for (const row of data ?? []) itemsMap.set(row.id, row)
    }

    // ADR 0003 Σ: splits need ALL leaf lots per involved item.
    const lotesDelItem = new Map<string, readonly ItemLotRow[]>()
    if (input.kind === "split" && cargoItemIds.length > 0) {
      const { data, error } = await client
        .from("item_lots")
        .select(ITEM_LOT_COLUMNS)
        .in("cargo_item_id", cargoItemIds)
      if (error) throw new Error(`item_lots (por ítem, split): ${error.message}`)
      for (const row of data ?? []) {
        const actuales = lotesDelItem.get(row.cargo_item_id) ?? []
        lotesDelItem.set(row.cargo_item_id, [...actuales, row])
      }
    }

    // --- manifiestos ---
    const manifestIds = [
      ...new Set(
        [input.manifestId, ...[...lotes.values()].map((l) => l.manifest_id)].filter(
          (x): x is string => !!x,
        ),
      ),
    ]
    const manifests = new Map<string, CargoManifestRow>()
    if (manifestIds.length > 0) {
      const { data, error } = await client
        .from("cargo_manifests")
        .select(MANIFEST_COLUMNS)
        .in("id", manifestIds)
      if (error) throw new Error(`cargo_manifests: ${error.message}`)
      for (const row of data ?? []) manifests.set(row.id, row)
    }

    // --- ubicaciones (destinos, orígenes, checkpoints actuales de los lotes) ---
    const locIds = [
      ...new Set(
        [
          input.locationId,
          ...[...lotes.values()].map((l) => l.current_location_id),
          ...items.flatMap((i) => [i.origenLocationId, i.destinoLocationId]),
        ].filter((x): x is string => !!x),
      ),
    ]
    const locations = new Map<string, LocationRow>()
    if (locIds.length > 0) {
      const { data, error } = await client
        .from("locations")
        .select(LOCATION_COLUMNS)
        .in("id", locIds)
      if (error) throw new Error(`locations: ${error.message}`)
      for (const row of data ?? []) locations.set(row.id, row)
    }

    // --- ocupación derivada (vista; I3/I4 usan el mismo número que el DB) ---
    const ocupacion = new Map<string, LocationOccupancyRow>()
    if (locIds.length > 0) {
      const { data, error } = await client
        .from("location_occupancy")
        .select(LOCATION_OCCUPANCY_COLUMNS)
        .in("location_id", locIds)
      if (error) throw new Error(`location_occupancy: ${error.message}`)
      for (const row of data ?? []) ocupacion.set(row.location_id, row)
    }

    // --- historial acotado (arrival/egress/correction existence checks) ---
    const movimientos: MovementRow[] = []
    if (input.previousMovementId != null) {
      const { data, error } = await client
        .from("movements")
        .select(MOVEMENT_COLUMNS)
        .eq("id", input.previousMovementId)
        .maybeSingle()
      if (error) throw new Error(`movement ${input.previousMovementId}: ${error.message}`)
      if (data) movimientos.push(data as MovementRow)
    }
    if ((input.kind === "arrival" || input.kind === "egress") && input.manifestId) {
      const { data, error } = await client
        .from("movements")
        .select(MOVEMENT_COLUMNS)
        .eq("manifest_id", input.manifestId)
        .in("kind", ["arrival", "egress"])
        .limit(20)
      if (error) throw new Error(`movements (secuencia ${input.kind}): ${error.message}`)
      movimientos.push(...((data ?? []) as MovementRow[]))
    }

    // --- I7 ---
    const existentePorOperationKey = opKey ? await this.buscarPorOperationKey(opKey) : null

    // --- I5: casos de hold abiertos (solo cuando un release los consulta) ---
    const quarantine = new Map<string, QuarantineOperationRow>()
    const seizure = new Map<string, SeizureOperationRow>()
    if (input.kind === "release" && lotIds.length > 0) {
      const [qRes, sRes] = await Promise.all([
        client
          .from("quarantine_operations")
          .select(QUARANTINE_OP_COLUMNS)
          .in("item_lot_id", lotIds)
          .eq("status", "open"),
        client
          .from("seizure_operations")
          .select(SEIZURE_OP_COLUMNS)
          .in("item_lot_id", lotIds)
          .eq("status", "open"),
      ])
      if (qRes.error) throw new Error(`quarantine_operations: ${qRes.error.message}`)
      if (sRes.error) throw new Error(`seizure_operations: ${sRes.error.message}`)
      for (const row of qRes.data ?? []) quarantine.set(row.item_lot_id, row)
      for (const row of sRes.data ?? []) seizure.set(row.item_lot_id, row)
    }

    return {
      permisos,
      roles,
      lotes,
      lotesDelItem,
      items: itemsMap,
      manifests,
      locations,
      ocupacion,
      movimientos,
      existentePorOperationKey,
      holdsAbiertos: { quarantine, seizure },
    }
  }

  /**
   * REST-safe mutation (whole-lot kinds only; see the class docstring):
   * movements + movement_items inserts, then per-lot state transitions
   * (single-row updates) and specialized hold rows. Not a transaction —
   * the deployed Edge Function owns atomicity; each step fails loudly.
   */
  private async ejecutarSupabase(
    input: CreateMovementInput,
    ctx: ValidationContext,
    opKey: string | null,
  ): Promise<MovementRow> {
    const client = requireClient(this.client)
    const operatorId = input.operatorId ?? (await this.sessionUserId())
    const occurredAt = input.ocurridoEn ?? new Date().toISOString()

    switch (input.kind) {
      case "arrival":
      case "egress":
        throw new MovementEngineError(
          [],
          "ENGINE_DEPENDENCIA",
          `'${input.kind}' transiciona manifiesto + lotes + camión como una sola transacción; lo ejecuta el engine server-side (Edge Function), no el cliente REST`,
        )
      case "split":
        throw new MovementEngineError(
          [],
          "ENGINE_DEPENDENCIA",
          "split crea el lote hijo y reduce el padre atómicamente (Σ balance, ADR 0003); lo ejecuta el engine server-side (patrón splitItem de cargoService)",
        )
      default:
        break
    }

    const { data: movement, error: movError } = await client
      .from("movements")
      .insert({
        kind: input.kind,
        facility_id: input.facilityId ?? null,
        manifest_id: input.manifestId ?? null,
        operator_id: operatorId,
        location_id: input.locationId ?? null,
        reason: input.motivo ?? null,
        previous_movement_id: input.previousMovementId ?? null,
        operation_key: opKey,
        payload: input.payload ?? null,
        occurred_at: occurredAt,
      })
      .select(MOVEMENT_COLUMNS)
      .single()
    if (movError) throw new Error(`movements insert (${input.kind}): ${movError.message}`)
    const movimiento = movement as MovementRow

    const items = input.items ?? []
    if (items.length > 0) {
      const { error: itemsError } = await client.from("movement_items").insert(
        items.map((item) => ({
          movement_id: movimiento.id,
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

    // Whole-lot state transitions (flows.md) — one bounded update per lot.
    const manifest = input.manifestId ? (ctx.manifests.get(input.manifestId) ?? null) : null
    for (const it of items) {
      const lot = ctx.lotes.get(it.itemLotId)
      if (!lot) continue
      const destino = it.destinoLocationId ?? input.locationId ?? null
      let update: Partial<Pick<ItemLotRow, "status" | "current_location_id" | "current_truck_id">> | null = null
      switch (input.kind) {
        case "discharge":
          update = { status: "discharged", current_truck_id: null, current_location_id: destino }
          break
        case "store":
          update = { status: "in_warehouse", current_location_id: destino }
          break
        case "transfer":
          update = { current_location_id: destino }
          break
        case "scan_in":
          update = { status: "checked" }
          break
        case "quarantine":
          update = { status: "in_quarantine", current_location_id: destino ?? lot.current_location_id }
          break
        case "seizure":
          update = { status: "seized", current_location_id: destino ?? lot.current_location_id }
          break
        case "release":
          update = { status: "released" }
          break
        case "load_out":
          update = {
            status: "loaded_out",
            current_location_id: null,
            current_truck_id: it.destinoTruckId ?? manifest?.truck_id ?? null,
          }
          break
        case "return_to_truck":
          update = {
            status: "on_truck",
            current_location_id: null,
            current_truck_id: it.destinoTruckId ?? manifest?.truck_id ?? null,
          }
          break
        case "scan_out":
        case "scale":
          update = null // spine-only surface row; the station flow owns those transitions
          break
        default:
          break
      }
      if (update) {
        const { error: updError } = await client.from("item_lots").update(update).eq("id", it.itemLotId)
        if (updError) throw new Error(`item_lots update (${it.itemLotId}): ${updError.message}`)
      }
    }

    // Specialized hold rows (ADR 0011 append-only).
    if (input.kind === "quarantine" || input.kind === "seizure") {
      for (const it of items) {
        const lot = ctx.lotes.get(it.itemLotId)
        const organizationId = lot?.organization_id ?? null
        if (input.kind === "quarantine") {
          const { error } = await client.from("quarantine_operations").insert({
            organization_id: organizationId,
            movement_id: movimiento.id,
            item_lot_id: it.itemLotId,
            reason: input.motivo ?? "",
            status: "open",
            opened_by: operatorId ?? "",
            opened_at: occurredAt,
          })
          if (error) throw new Error(`quarantine_operations insert: ${error.message}`)
        } else {
          const { error } = await client.from("seizure_operations").insert({
            organization_id: organizationId,
            movement_id: movimiento.id,
            item_lot_id: it.itemLotId,
            legal_ref: input.motivo ?? null,
            status: "open",
            opened_by: operatorId ?? "",
            opened_at: occurredAt,
          })
          if (error) throw new Error(`seizure_operations insert: ${error.message}`)
        }
      }
    }

    if (input.kind === "release") {
      for (const it of items) {
        const lot = ctx.lotes.get(it.itemLotId)
        const tabla = lot?.status === "seized" ? "seizure_operations" : "quarantine_operations"
        const { error } = await client
          .from(tabla)
          .update({
            status: "resolved",
            resolution_note: input.motivo ?? null,
            resolved_at: occurredAt,
            resolved_by: operatorId,
          })
          .eq("item_lot_id", it.itemLotId)
          .eq("status", "open")
        if (error) throw new Error(`${tabla} resolve: ${error.message}`)
      }
    }

    return movimiento
  }

  private async sessionUserId(): Promise<string | null> {
    const client = requireClient(this.client)
    const { data } = await client.auth.getSession()
    return data.session?.user.id ?? null
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