// DEMO ONLY — dev data, never production.
//
// In-memory implementations of every service interface. They share one
// DemoState (fresh per createDemoServices call) and enforce the RBAC matrix
// (seed.ts ROLE_PERMISSIONS) like RLS would — throws on missing permission
// instead of silently returning empty rows. Production authorization is
// ONLY the database; this adapter exists so the UI is clickable without a
// Supabase backend.
//
// Behavioral notes:
//   - The demo session starts SIGNED-OUT (like production). The AuthProvider
//     restores a previous demo session from localStorage (cc.auth.demo-session)
//     to simulate persistence; otherwise the login screen offers a DEMO
//     button that signs in as demo@cargocontrol.local (role configurable via
//     options.role, default 'admin').
//   - Movement execution is fully in-memory INCLUDING splits (the
//     deferred-Σ trigger that blocks REST splits is a database concern).
//   - Hold resolution is implemented (the DB blocks it via RLS UPDATE
//     policies; the demo mirrors the supervisor flow).
//   - All ids are `demo/xxx` suffixes: never store them anywhere real.

import type {
  AuditService,
} from "@/services/auditService"
import type {
  DescargaInput,
  SplitItemInput,
  TransferItemInput,
} from "@/services/cargoService"
import type { CargoService } from "@/services/cargoService"
import type { DashboardService } from "@/services/dashboardService"
import type {
  HoldService,
} from "@/services/holdService"
import type { QuarantineOpenInput, SeizureOpenInput, HoldResolveInput } from "@/services/holdService"
import type { QuarantineHoldService, SeizureHoldService } from "@/services/holdService"
import type { LocationService } from "@/services/locationService"
import {
  PLACE_LOCATION,
  TIPO_CODIGO_PREFIJO,
  TIPOS_LUGAR,
  computarDiffLayout,
  type CambiosLayout,
  type CrearElementoInput,
  type CrearVersionInput,
  type EliminarElementoResultado,
  type GuardarBorradorInput,
  type LayoutConElementos,
  type LayoutDiff,
  type LayoutService,
  type LayoutVersionRow,
  type MapaOperativoResultado,
} from "@/services/layoutService"
import {
  MOVEMENT_KIND_PERMISSION,
  MovementEngineError,
  type EngineResultado,
  type MovementService,
} from "@/services/movementService"
import type { MovementDetail } from "@/services/movementService"
import {
  computarOcupaciones,
  esReplayDuplicado,
  hayFallos,
  validarMovimiento,
} from "@/lib/movement-guards"
import type {
  EngineCandidate,
  EngineCandidateItem,
  ValidationContext,
} from "@/lib/movement-guards"
import type {
  AuthService,
  LoginResult,
  SesionInfo,
} from "@/services/authService"
import { PERMISSION_CODES } from "@/services/permissionCatalog"
import type {
  ScaleStationService,
  ScannerStationService,
  StationService,
} from "@/services/stationService"
import type { ScaleOpInput, ScannerOpInput } from "@/services/stationService"
import { buildTruckSignals, normalizePlate, type TruckService, type TruckSignals } from "@/services/truckService"
import type {
  AuditLogFiltros,
  CreateMovementInput,
  ManifestFiltros,
  MovementExecutionInput,
  MovementFiltros,
  PaginationFiltros,
  QuarantineHoldFiltros,
  ScaleOpFiltros,
  ScannerOpFiltros,
  SeizureHoldFiltros,
  TruckFiltros,
} from "@/services/shared"
import type { LocationFiltros, LayoutFiltros } from "@/services/shared"
import {
  DEMO_EMAIL,
  createDemoState,
  hasPermission,
  type DemoState,
} from "@/services/demo/seed"
import type {
  AuditLogRow,
  CargoItemInsert,
  CargoItemRow,
  CargoManifestRow,
  CapacityUpdate,
  DashboardMetricsRow,
  ItemLotRow,
  Json,
  LayoutElementRow,
  LayoutRow,
  LocationOccupancyRow,
  LocationRow,
  ManifestInsert,
  MovementKind,
  MovementRow,
  PermissionCode,
  QuarantineOperationRow,
  RoleCode,
  ScannerOperationRow,
  ScaleOperationRow,
  SeizureOperationRow,
  StationQueueRow,
  TransportCompanyRow,
  TruckInsert,
  TruckRow,
  TruckUpdate,
  UserRow,
} from "@/types"

export interface DemoServiceOptions {
  /** Demo session role (default 'admin'); other lists enforce it via ROLE_PERMISSIONS. */
  role?: RoleCode
}

function demoError(message: string): Error {
  return new Error(`DEMO data adapter: ${message}`)
}

function clone<T>(value: T): T {
  return structuredClone(value)
}

function nowIso(): string {
  return new Date().toISOString()
}

// Counter base above the seed ids (seed.ts uses fixed ids like
// manifest-1/item-1-1/lot-1-1): starting from 0 would collide with the
// seed and make obtenerManifest resolve the WRONG manifest (find → first
// match). 100_000 keeps generated ids unique for any realistic session.
let idCounter = 100_000

/** Stable, unique-per-store demo id (no colons/brackets). */
function demoId(prefix: string): string {
  idCounter += 1
  return `${prefix}-${idCounter}`
}

function requirePermission(state: DemoState, permission: PermissionCode, action: string): void {
  if (!hasPermission(state.role, permission)) {
    throw demoError(`permiso '${permission}' requerido para '${action}' (rol actual: ${state.role})`)
  }
}

/** Movement-kind gate mirroring the SQL helper (OR semantics for release). */
function requireMovementKind(state: DemoState, kind: MovementKind): void {
  const required = MOVEMENT_KIND_PERMISSION[kind]
  const perms = Array.isArray(required) ? required : [required]
  if (!perms.some((p) => hasPermission(state.role, p))) {
    throw demoError(
      `movimiento '${kind}' no permitido para el rol '${state.role}' (requiere ${perms.join(" o ")})`,
    )
  }
}

function appendAudit(state: DemoState, row: Omit<AuditLogRow, "id" | "organization_id" | "created_at">): void {
  state.auditLog.push({
    ...row,
    id: state.auditLog.length + 1,
    organization_id: state.organization.id,
    created_at: nowIso(),
  })
}

/** Creates the movement + movement_items and returns the spine row. */
function createDemoMovement(state: DemoState, input: CreateMovementInput): MovementRow {
  requireMovementKind(state, input.kind)
  const movement: MovementRow = {
    id: state.nextMovementId++,
    organization_id: state.organization.id,
    facility_id: input.facilityId ?? state.facility.id,
    kind: input.kind,
    manifest_id: input.manifestId ?? null,
    operator_id: input.operatorId ?? null,
    location_id: input.locationId ?? null,
    occurred_at: input.ocurridoEn ?? nowIso(),
    created_at: nowIso(),
    reason: input.motivo ?? null,
    previous_movement_id: input.previousMovementId ?? null,
    operation_key: input.operationKey ?? null,
    payload: input.payload ?? null,
  }
  state.movements.push(movement)
  if (input.items && input.items.length > 0) {
    for (const item of input.items) {
      state.movementItems.push({
        id: state.nextMovementItemId++,
        movement_id: movement.id,
        item_lot_id: item.itemLotId,
        quantity: item.cantidad,
        from_location_id: item.origenLocationId ?? null,
        to_location_id: item.destinoLocationId ?? null,
        from_truck_id: item.origenTruckId ?? null,
        to_truck_id: item.destinoTruckId ?? null,
        notes: item.notas ?? null,
      })
    }
  }
  return clone(movement)
}

function applyLimit<T>(rows: T[], filtros?: PaginationFiltros): T[] {
  const limit = Math.min(filtros?.limit ?? 100, 500)
  const offset = filtros?.offset ?? 0
  return rows.slice(offset, offset + limit)
}

function findLot(state: DemoState, itemLotId: string): ItemLotRow {
  const lot = state.lots.find((l) => l.id === itemLotId)
  if (!lot) throw demoError(`lote ${itemLotId} no encontrado`)
  return lot
}

function findLocation(state: DemoState, locationId: string): LocationRow {
  const location = state.locations.find((l) => l.id === locationId)
  if (!location) throw demoError(`location ${locationId} no encontrada`)
  return location
}

function findManifest(state: DemoState, manifestId: string): CargoManifestRow {
  const manifest = state.manifests.find((m) => m.id === manifestId)
  if (!manifest) throw demoError(`manifiesto ${manifestId} no encontrado`)
  return manifest
}

function assertLocationAccepts(state: DemoState, locationId?: string): void {
  if (!locationId) return
  const location = findLocation(state, locationId)
  if (!location.active) throw demoError(`la location ${locationId} está inactiva`)
  if (!location.allows_hold) throw demoError(`la location ${locationId} no permite holds (allows_hold=false)`)
}

// ---------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------

class DemoAuthService implements AuthService {
  private readonly state: DemoState
  private sessionUser: UserRow | null

  constructor(state: DemoState) {
    this.state = state
    // Starts signed-out; the AuthProvider decides whether to auto-restore a
    // persisted demo session (localStorage) — not this adapter.
    this.sessionUser = null
  }

  private toSesionInfo(): SesionInfo {
    return {
      accessToken: this.sessionUser ? "demo-access-token" : null,
      userId: this.sessionUser?.id ?? null,
      email: this.sessionUser?.email ?? null,
      expiresAt: this.sessionUser ? Date.now() + 1000 * 60 * 60 * 8 : null,
    }
  }

  async iniciarSesion(email: string, password: string): Promise<LoginResult> {
    const user = this.state.users.find((u) => u.email === email)
    if (!user || password !== this.state.demoPassword) {
      throw demoError(`credenciales inválidas (use ${DEMO_EMAIL} / ${this.state.demoPassword})`)
    }
    // The operator account demos a restricted role; demo@ keeps the
    // configured demo role (options.role).
    this.state.role = email === DEMO_EMAIL ? this.state.role : "operator"
    this.sessionUser = user
    return { sesion: this.toSesionInfo(), perfil: clone(user) }
  }

  async cerrarSesion(): Promise<void> {
    this.sessionUser = null
  }

  async sesionActual(): Promise<SesionInfo> {
    return this.toSesionInfo()
  }

  async recuperarPassword(_email: string): Promise<void> {
    // DEMO: no email provider wired; the UI just shows the confirmation.
  }

  async verificarTokenRecuperacion(_tokenHash: string): Promise<void> {
    // DEMO: recovery links are simulated; the reset screen works with an
    // active session (or without one, mimicking the mail-less flow).
  }

  async perfilActual(): Promise<UserRow | null> {
    return this.sessionUser ? clone(this.sessionUser) : null
  }

  async permisosActuales(): Promise<PermissionCode[]> {
    if (!this.sessionUser) return []
    return PERMISSION_CODES.filter((code) => hasPermission(this.state.role, code))
  }

  async rolesActuales(): Promise<RoleCode[]> {
    return this.sessionUser ? [this.state.role] : []
  }

  async actualizarPassword(nuevaPassword: string): Promise<void> {
    this.state.demoPassword = nuevaPassword
  }
}

// ---------------------------------------------------------------------
// Movements
// ---------------------------------------------------------------------

class DemoMovementService implements MovementService {
  private readonly state: DemoState

  constructor(state: DemoState) {
    this.state = state
  }

  async listarMovimientos(filtros?: MovementFiltros): Promise<MovementRow[]> {
    requirePermission(this.state, "cargo.read", "listar movimientos")
    let rows = this.state.movements
    if (filtros?.facilidadId) rows = rows.filter((m) => m.facility_id === filtros.facilidadId)
    if (filtros?.kind) rows = rows.filter((m) => m.kind === filtros.kind)
    if (filtros?.manifestId) rows = rows.filter((m) => m.manifest_id === filtros.manifestId)
    if (filtros?.operadorId) rows = rows.filter((m) => m.operator_id === filtros.operadorId)
    if (filtros?.since) rows = rows.filter((m) => m.occurred_at >= filtros.since!)
    if (filtros?.until) rows = rows.filter((m) => m.occurred_at < filtros.until!)
    if (filtros?.itemLotId) {
      const touching = this.state.movementItems
        .filter((i) => i.item_lot_id === filtros.itemLotId)
        .map((i) => i.movement_id)
      rows = rows.filter((m) => touching.includes(m.id))
    }
    if (filtros?.camionId) {
      const manifests = this.state.manifests.filter((m) => m.truck_id === filtros.camionId).map((m) => m.id)
      rows = rows.filter((m) => m.manifest_id && manifests.includes(m.manifest_id))
    }
    rows = [...rows].sort((a, b) => b.occurred_at.localeCompare(a.occurred_at) || b.id - a.id)
    return clone(applyLimit(rows, filtros))
  }

  async obtenerMovimiento(id: number): Promise<MovementDetail | null> {
    const movement = this.state.movements.find((m) => m.id === id)
    if (!movement) return null
    return {
      movement: clone(movement),
      items: clone(this.state.movementItems.filter((i) => i.movement_id === id)),
      scannerOps: clone(this.state.scannerOps.filter((o) => o.movement_id === id)),
      scaleOps: clone(this.state.scaleOps.filter((o) => o.movement_id === id)),
      quarantineOps: clone(this.state.quarantineOps.filter((o) => o.movement_id === id)),
      seizureOps: clone(this.state.seizureOps.filter((o) => o.movement_id === id)),
    }
  }

  async movimientoPermitido(kind: MovementKind): Promise<boolean> {
    const required = MOVEMENT_KIND_PERMISSION[kind]
    const perms = Array.isArray(required) ? required : [required]
    return perms.some((p) => hasPermission(this.state.role, p))
  }

  async listarPorItemLot(itemLotId: string, filtros?: PaginationFiltros): Promise<MovementRow[]> {
    return this.listarMovimientos({ itemLotId, ...filtros })
  }

  // -------------------------------------------------------------------
  // Engine surface (I1..I7 + in-memory execution, mirror of the Supabase
  // implementation — but the demo CAN execute every kind, including split).
  // -------------------------------------------------------------------

  async ejecutarMovimiento(input: CreateMovementInput): Promise<EngineResultado> {
    const opKey = input.operationKey ?? null

    // ME-07 fast path: the SAME operation_key already produced a movement.
    if (opKey) {
      const existente = this.state.movements.find((m) => m.operation_key === opKey)
      if (existente) return { movimiento: clone(existente), duplicado: true, validaciones: [] }
    }

    const ctx = this.armarContextoDemo(input, opKey)
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
      return { movimiento: clone(ctx.existentePorOperationKey), duplicado: true, validaciones: [] }
    }
    if (hayFallos(validaciones)) {
      throw new MovementEngineError(validaciones)
    }

    const movimiento = this.ejecutarDemo(input)
    return { movimiento, duplicado: false, validaciones }
  }

  async buscarPorOperationKey(operationKey: string): Promise<MovementRow | null> {
    const existente = this.state.movements.find((m) => m.operation_key === operationKey)
    return existente ? clone(existente) : null
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
    const original = this.state.movements.find((m) => m.id === movementId)
    if (!original) {
      throw new MovementEngineError([], "VALIDACION", `El movimiento #${movementId} no existe`)
    }
    // AC-E8-3: la corrección hereda el contexto del movimiento original.
    const resultado = await this.ejecutarMovimiento({
      kind: "correction",
      manifestId: original.manifest_id ?? null,
      facilityId: original.facility_id ?? null,
      locationId: original.location_id ?? null,
      previousMovementId: movementId,
      motivo,
      operationKey,
    })
    return resultado.movimiento
  }

  /**
   * Bounded read model mirroring the Supabase `armarContexto`. Occupancy is
   * computed with the EXACT `location_occupancy` view semantics
   * (0005_views.sql) over the FULL store — a candidate must see competing
   * lots (e.g. SECTOR-01 already full with lot-1-4), not just its own.
   */
  private armarContextoDemo(
    input: CreateMovementInput,
    opKey: string | null,
  ): ValidationContext {
    const state = this.state
    const items = input.items ?? []
    const lotIds = new Set(items.map((i) => i.itemLotId))

    const lotes = new Map(
      state.lots.filter((l) => lotIds.has(l.id)).map((l) => [l.id, clone(l)] as const),
    )
    // egress no lleva items, pero I6 necesita TODOS los lotes del manifiesto
    // para el chequeo de retenidos (AC-E2-2).
    if (input.kind === "egress" && input.manifestId) {
      for (const l of state.lots.filter((lot) => lot.manifest_id === input.manifestId)) {
        if (!lotes.has(l.id)) lotes.set(l.id, clone(l))
      }
    }
    const cargoItemIds = new Set([...lotes.values()].map((l) => l.cargo_item_id))
    const itemsMap = new Map(
      state.items.filter((i) => cargoItemIds.has(i.id)).map((i) => [i.id, clone(i)] as const),
    )
    const lotesDelItem = new Map<string, readonly ItemLotRow[]>()
    if (input.kind === "split") {
      for (const id of cargoItemIds) {
        lotesDelItem.set(
          id,
          state.lots.filter((l) => l.cargo_item_id === id).map((l) => clone(l)),
        )
      }
    }

    const manifestIds = new Set(
      [input.manifestId, ...[...lotes.values()].map((l) => l.manifest_id)].filter(
        (x): x is string => !!x,
      ),
    )
    const manifests = new Map(
      state.manifests.filter((m) => manifestIds.has(m.id)).map((m) => [m.id, clone(m)] as const),
    )

    const locIds = new Set(
      [
        input.locationId,
        ...[...lotes.values()].map((l) => l.current_location_id),
        ...items.flatMap((i) => [i.origenLocationId, i.destinoLocationId]),
      ].filter((x): x is string => !!x),
    )
    const ubicaciones = state.locations.filter((l) => locIds.has(l.id))
    const locations = new Map(ubicaciones.map((l) => [l.id, clone(l)] as const))
    const ocupacion = computarOcupaciones(ubicaciones, state.lots, state.items)

    const movimientos = state.movements.filter(
      (m) =>
        (input.previousMovementId != null && m.id === input.previousMovementId) ||
        ((input.kind === "arrival" || input.kind === "egress") &&
          m.manifest_id === input.manifestId &&
          (m.kind === "arrival" || m.kind === "egress")),
    )
    const existentePorOperationKey = opKey
      ? (state.movements.find((m) => m.operation_key === opKey) ?? null)
      : null

    let quarantine = new Map<string, QuarantineOperationRow>()
    let seizure = new Map<string, SeizureOperationRow>()
    if (input.kind === "release") {
      quarantine = new Map(
        state.quarantineOps
          .filter((q) => lotIds.has(q.item_lot_id) && q.status === "open")
          .map((q) => [q.item_lot_id, clone(q)] as const),
      )
      seizure = new Map(
        state.seizureOps
          .filter((s) => lotIds.has(s.item_lot_id) && s.status === "open")
          .map((s) => [s.item_lot_id, clone(s)] as const),
      )
    }

    const requerido = MOVEMENT_KIND_PERMISSION[input.kind]
    const requeridos = (Array.isArray(requerido) ? requerido : [requerido]) as PermissionCode[]
    const permisos = requeridos.filter((p) => hasPermission(state.role, p))
    const roles: RoleCode[] =
      input.kind === "release" && (state.role === "admin" || state.role === "supervisor")
        ? [state.role]
        : []

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
   * In-memory mutation per kind (flows.md transitions + legacy rollups).
   * Audit rows use the audit.md CATALOG actions (movement.* / operation.* /
   * truck.*); the seed and the legacy cargo/hold flows still emit
   * `cargo.discharge` / `quarantine.create` / `seizure.create` — a known
   * deviation that this work does not touch.
   */
  private ejecutarDemo(input: CreateMovementInput): MovementRow {
    const state = this.state
    const operatorId = input.operatorId ?? "user-demo"
    const items = input.items ?? []
    const movement = createDemoMovement(state, input)
    const manifiesto = input.manifestId
      ? (state.manifests.find((m) => m.id === input.manifestId) ?? null)
      : null

    switch (input.kind) {
      case "arrival": {
        if (manifiesto) {
          manifiesto.status = "in_playon"
          if (manifiesto.truck_id) {
            const truck = state.trucks.find((t) => t.id === manifiesto!.truck_id)
            if (truck) truck.status = "in_playon"
          }
          for (const item of state.items.filter((i) => i.manifest_id === input.manifestId)) {
            item.status = "on_truck"
          }
          appendAudit(state, {
            actor_id: operatorId,
            action: "truck.arrival",
            entity_type: "cargo_manifest",
            entity_id: input.manifestId ?? "",
            before: null,
            after: { status: "in_playon" },
            reason: input.motivo ?? null,
            metadata: { movement_id: movement.id },
          })
        }
        break
      }
      case "discharge": {
        for (const it of items) {
          const lot = findLot(state, it.itemLotId)
          const before = {
            status: lot.status,
            current_location_id: lot.current_location_id,
            current_truck_id: lot.current_truck_id,
          }
          lot.status = "discharged"
          lot.current_location_id = it.destinoLocationId ?? input.locationId ?? lot.current_location_id
          lot.current_truck_id = null
          lot.updated_at = nowIso()
          appendAudit(state, {
            actor_id: operatorId,
            action: "movement.discharge",
            entity_type: "item_lot",
            entity_id: lot.id,
            before,
            after: {
              status: lot.status,
              current_location_id: lot.current_location_id,
              current_truck_id: null,
            },
            reason: input.motivo ?? null,
            metadata: { movement_id: movement.id },
          })
        }
        if (manifiesto) manifiesto.status = "discharged"
        break
      }
      case "split": {
        for (const it of items) {
          const parent = findLot(state, it.itemLotId)
          const before = parent.quantity
          parent.quantity = before - it.cantidad
          parent.updated_at = nowIso()
          const child: ItemLotRow = {
            id: demoId("lot"),
            organization_id: parent.organization_id,
            manifest_id: parent.manifest_id,
            cargo_item_id: parent.cargo_item_id,
            parent_lot_id: parent.id,
            quantity: it.cantidad,
            uom: parent.uom,
            status: parent.status,
            current_location_id: it.destinoLocationId ?? parent.current_location_id,
            current_truck_id: null,
            unit_weight_kg: parent.unit_weight_kg,
            unit_volume_m3: parent.unit_volume_m3,
            created_via_movement_id: movement.id,
            created_at: nowIso(),
            updated_at: nowIso(),
          }
          state.lots.push(child)
          appendAudit(state, {
            actor_id: operatorId,
            action: "movement.split",
            entity_type: "item_lot",
            entity_id: parent.id,
            before: { quantity: before },
            after: { quantity: parent.quantity, child_lot_id: child.id },
            reason: input.motivo ?? null,
            metadata: { movement_id: movement.id },
          })
        }
        break
      }
      case "store":
      case "transfer": {
        for (const it of items) {
          const lot = findLot(state, it.itemLotId)
          const destino = it.destinoLocationId ?? input.locationId ?? null
          const before = { status: lot.status, current_location_id: lot.current_location_id }
          lot.current_location_id = destino
          if (input.kind === "store") lot.status = "in_warehouse"
          lot.updated_at = nowIso()
          appendAudit(state, {
            actor_id: operatorId,
            action: "operation.load",
            entity_type: "item_lot",
            entity_id: lot.id,
            before,
            after: { status: lot.status, current_location_id: destino },
            reason: input.motivo ?? null,
            metadata: { movement_id: movement.id, movement_kind: input.kind },
          })
        }
        break
      }
      case "load_out":
      case "return_to_truck": {
        const truckId = items[0]?.destinoTruckId ?? manifiesto?.truck_id ?? null
        for (const it of items) {
          const lot = findLot(state, it.itemLotId)
          const before = {
            status: lot.status,
            current_location_id: lot.current_location_id,
            current_truck_id: lot.current_truck_id,
          }
          lot.status = input.kind === "load_out" ? "loaded_out" : "on_truck"
          lot.current_location_id = null
          lot.current_truck_id = it.destinoTruckId ?? truckId
          lot.updated_at = nowIso()
          appendAudit(state, {
            actor_id: operatorId,
            action: input.kind === "load_out" ? "operation.load" : "movement.return_to_truck",
            entity_type: "item_lot",
            entity_id: lot.id,
            before,
            after: {
              status: lot.status,
              current_location_id: null,
              current_truck_id: lot.current_truck_id,
            },
            reason: input.motivo ?? null,
            metadata: { movement_id: movement.id },
          })
        }
        break
      }
      case "scan_in":
      case "scan_out":
      case "scale": {
        for (const it of items) {
          const lot = findLot(state, it.itemLotId)
          const before = { status: lot.status }
          if (input.kind === "scan_in") lot.status = "checked"
          // scan_out / scale: la transición la posee la estación (ops rows).
          lot.updated_at = nowIso()
          appendAudit(state, {
            actor_id: operatorId,
            action: input.kind === "scale" ? "operation.scale" : "operation.scan",
            entity_type: "item_lot",
            entity_id: lot.id,
            before,
            after: { status: lot.status },
            reason: input.motivo ?? null,
            metadata: { movement_id: movement.id, movement_kind: input.kind },
          })
        }
        break
      }
      case "quarantine":
      case "seizure": {
        for (const it of items) {
          const lot = findLot(state, it.itemLotId)
          const before = { status: lot.status }
          lot.status = input.kind === "quarantine" ? "in_quarantine" : "seized"
          lot.current_location_id = it.destinoLocationId ?? input.locationId ?? lot.current_location_id
          lot.updated_at = nowIso()
          if (input.kind === "quarantine") {
            state.quarantineOps.push({
              id: `quar-${state.nextOpId++}`,
              organization_id: state.organization.id,
              movement_id: movement.id,
              item_lot_id: lot.id,
              reason: input.motivo ?? "",
              status: "open",
              opened_by: operatorId,
              opened_at: movement.occurred_at,
              resolved_by: null,
              resolved_at: null,
              resolution_note: null,
            })
          } else {
            state.seizureOps.push({
              id: `seiz-${state.nextOpId++}`,
              organization_id: state.organization.id,
              movement_id: movement.id,
              item_lot_id: lot.id,
              legal_ref: input.motivo ?? null,
              status: "open",
              opened_by: operatorId,
              opened_at: movement.occurred_at,
              resolved_by: null,
              resolved_at: null,
              resolution_note: null,
            })
          }
          appendAudit(state, {
            actor_id: operatorId,
            action: input.kind === "quarantine" ? "operation.quarantine" : "operation.seizure",
            entity_type: "item_lot",
            entity_id: lot.id,
            before,
            after: {
              status: lot.status,
              current_location_id: lot.current_location_id,
              operation_status: "open",
            },
            reason: input.motivo ?? null,
            metadata: { movement_id: movement.id },
          })
        }
        break
      }
      case "release": {
        for (const it of items) {
          const lot = findLot(state, it.itemLotId)
          const before = { status: lot.status }
          lot.status = "released"
          lot.updated_at = nowIso()
          for (const op of state.quarantineOps) {
            if (op.item_lot_id === lot.id && op.status === "open") {
              op.status = "resolved"
              op.resolution_note = input.motivo ?? null
              op.resolved_at = movement.occurred_at
              op.resolved_by = operatorId
            }
          }
          for (const op of state.seizureOps) {
            if (op.item_lot_id === lot.id && op.status === "open") {
              op.status = "resolved"
              op.resolution_note = input.motivo ?? null
              op.resolved_at = movement.occurred_at
              op.resolved_by = operatorId
            }
          }
          appendAudit(state, {
            actor_id: operatorId,
            action: "operation.release", // extensión documentada (audit.md no lista release)
            entity_type: "item_lot",
            entity_id: lot.id,
            before,
            after: { status: "released" },
            reason: input.motivo ?? null,
            metadata: { movement_id: movement.id },
          })
        }
        break
      }
      case "egress": {
        if (manifiesto) {
          if (manifiesto.truck_id) {
            const truck = state.trucks.find((t) => t.id === manifiesto!.truck_id)
            if (truck) truck.status = "in_route"
          }
          const enCamion = state.lots.filter(
            (l) => l.manifest_id === input.manifestId && l.current_truck_id === manifiesto!.truck_id,
          )
          // Provisional rollup mirror (flows.md Egress): with no on-truck
          // balance the manifest closes; with balance it stays open.
          if (enCamion.length === 0) manifiesto.status = "closed"
          appendAudit(state, {
            actor_id: operatorId,
            action: "truck.egress",
            entity_type: "cargo_manifest",
            entity_id: input.manifestId ?? "",
            before: null,
            after: { status: manifiesto.status, truck_status: "in_route" },
            reason: input.motivo ?? null,
            metadata: { movement_id: movement.id },
          })
        }
        break
      }
      case "correction": {
        appendAudit(state, {
          actor_id: operatorId,
          action: "movement.correction", // extensión documentada
          entity_type: "movement",
          entity_id: String(movement.previous_movement_id ?? ""),
          before: null,
          after: { correction_movement_id: movement.id },
          reason: input.motivo ?? null,
          metadata: null,
        })
        break
      }
      default:
        break
    }
    return movement
  }

  async crearMovimiento(input: CreateMovementInput): Promise<MovementRow> {
    return createDemoMovement(this.state, input)
  }
}

// ---------------------------------------------------------------------
// Trucks
// ---------------------------------------------------------------------

class DemoTruckService implements TruckService {
  private readonly state: DemoState

  constructor(state: DemoState) {
    this.state = state
  }

  async listar(filtros?: TruckFiltros): Promise<TruckRow[]> {
    requirePermission(this.state, "truck.read", "listar camiones")
    let rows = this.state.trucks
    if (filtros?.estado) rows = rows.filter((t) => t.status === filtros.estado)
    if (filtros?.companiaId) rows = rows.filter((t) => t.transport_company_id === filtros.companiaId)
    if (filtros?.buscar) rows = rows.filter((t) => t.plate.toLowerCase().includes(filtros.buscar!.toLowerCase()))
    rows = [...rows].sort((a, b) => a.plate.localeCompare(b.plate))
    return clone(applyLimit(rows, filtros))
  }

  async contar(filtros?: TruckFiltros): Promise<number> {
    requirePermission(this.state, "truck.read", "contar camiones")
    let rows = this.state.trucks
    if (filtros?.estado) rows = rows.filter((t) => t.status === filtros.estado)
    if (filtros?.companiaId) rows = rows.filter((t) => t.transport_company_id === filtros.companiaId)
    if (filtros?.buscar) rows = rows.filter((t) => t.plate.toLowerCase().includes(filtros.buscar!.toLowerCase()))
    return rows.length
  }

  async listarCompanias(): Promise<TransportCompanyRow[]> {
    requirePermission(this.state, "truck.read", "listar transportistas")
    return clone(
      [...this.state.companies]
        .filter((c) => c.status === "active")
        .sort((a, b) => a.name.localeCompare(b.name)),
    )
  }

  async obtenerSeñales(truckIds: string[]): Promise<TruckSignals[]> {
    requirePermission(this.state, "truck.read", "señales de camiones")
    if (truckIds.length === 0) return []
    const checkpoints = this.state.locations.filter((l) => l.type === "checkpoint")
    const scan = checkpoints.filter((l) => l.checkpoint_kind === "scan").map((l) => l.id)
    const scale = checkpoints.filter((l) => l.checkpoint_kind === "scale").map((l) => l.id)
    return truckIds.map((id) =>
      buildTruckSignals(id, this.state.manifests, this.state.movements, this.state.lots, scan, scale),
    )
  }

  async obtener(id: string): Promise<TruckRow | null> {
    const truck = this.state.trucks.find((t) => t.id === id)
    return truck ? clone(truck) : null
  }

  async crear(datos: TruckInsert): Promise<TruckRow> {
    requirePermission(this.state, "truck.create", "crear camión")
    const plate = normalizePlate(datos.plate)
    if (this.state.trucks.some((t) => t.plate === plate)) {
      throw demoError(`patente ${plate} ya existe`)
    }
    const truck: TruckRow = {
      id: demoId("truck"),
      organization_id: this.state.organization.id,
      transport_company_id: datos.transport_company_id ?? null,
      plate,
      capacity_kg: datos.capacity_kg ?? null,
      status: datos.status ?? "available",
      created_at: nowIso(),
      updated_at: nowIso(),
    }
    this.state.trucks.push(truck)
    return clone(truck)
  }

  async actualizar(id: string, cambios: TruckUpdate): Promise<TruckRow> {
    requirePermission(this.state, "truck.update", "actualizar camión")
    const truck = this.state.trucks.find((t) => t.id === id)
    if (!truck) throw demoError(`camión ${id} no encontrado`)
    const cambiosFinales: TruckUpdate = { ...cambios }
    if (cambios.plate !== undefined) {
      const plate = normalizePlate(cambios.plate)
      if (this.state.trucks.some((t) => t.id !== id && t.plate === plate)) {
        throw demoError(`patente ${plate} ya existe`)
      }
      cambiosFinales.plate = plate
    }
    Object.assign(truck, cambiosFinales, { updated_at: nowIso() })
    return clone(truck)
  }

  async registrarEntrada(manifestId: string, input?: MovementExecutionInput): Promise<MovementRow> {
    requirePermission(this.state, "cargo.update", "registrar entrada")
    const manifest = findManifest(this.state, manifestId)
    const movement = createDemoMovement(this.state, {
      kind: "arrival",
      manifestId,
      facilityId: manifest.facility_id,
      operatorId: input?.operatorId ?? null,
      ocurridoEn: input?.ocurridoEn,
      operationKey: input?.operationKey,
      motivo: input?.motivo,
    })
    if (manifest.truck_id) {
      const truck = this.state.trucks.find((t) => t.id === manifest.truck_id)
      if (truck) truck.status = "in_playon"
    }
    manifest.status = "in_playon"
    for (const item of this.state.items.filter((i) => i.manifest_id === manifestId)) {
      item.status = "on_truck"
    }
    appendAudit(this.state, {
      actor_id: input?.operatorId ?? "user-demo",
      action: "truck.arrival",
      entity_type: "cargo_manifest",
      entity_id: manifestId,
      before: null,
      after: { status: "in_playon" },
      reason: input?.motivo ?? null,
      metadata: null,
    })
    return movement
  }

  async registrarSalida(manifestId: string, input?: MovementExecutionInput): Promise<MovementRow> {
    requirePermission(this.state, "truck.exit", "registrar salida")
    const manifest = findManifest(this.state, manifestId)
    const movimientos = this.state.movements.filter((m) => m.manifest_id === manifestId)
    if (!movimientos.some((m) => m.kind === "arrival")) {
      throw demoError(`el manifiesto ${manifestId} no registró ingreso (movimiento 'arrival')`)
    }
    if (movimientos.some((m) => m.kind === "egress")) {
      throw demoError(`el manifiesto ${manifestId} ya egresó`)
    }
    // AC-E2-2 (business-rules.md §2): egress may acknowledge on-truck
    // remnants, but never while lots are frozen (rezago/secuestro).
    const congelados = this.state.lots.some(
      (l) => l.manifest_id === manifestId && (l.status === "in_quarantine" || l.status === "seized"),
    )
    if (congelados) {
      throw demoError(`el manifiesto ${manifestId} tiene lotes retenidos (rezago o secuestro)`)
    }
    const enCamion = this.state.lots.filter(
      (l) => l.manifest_id === manifestId && l.current_truck_id === manifest.truck_id,
    )
    const movement = createDemoMovement(this.state, {
      kind: "egress",
      manifestId,
      facilityId: manifest.facility_id,
      operatorId: input?.operatorId ?? null,
      ocurridoEn: input?.ocurridoEn,
      operationKey: input?.operationKey,
      motivo: input?.motivo, // egress is a sensitive kind: reason recommended
      payload: enCamion.length > 0 ? { acknowledged_on_truck_lots: enCamion.map((l) => l.id) } : null,
    })
    if (manifest.truck_id) {
      const truck = this.state.trucks.find((t) => t.id === manifest.truck_id)
      if (truck) truck.status = "in_route"
    }
    // Provisional rollup mirror (flows.md Egress): with no on-truck balance
    // the manifest closes; with a balance it stays open so the engine can
    // reconcile the acknowledged remnant.
    if (enCamion.length === 0) manifest.status = "closed"
    return movement
  }
}

// ---------------------------------------------------------------------
// Cargo (manifests, items, lots) — full in-memory split included
// ---------------------------------------------------------------------

class DemoCargoService implements CargoService {
  private readonly state: DemoState
  private readonly movements: DemoMovementService

  constructor(state: DemoState, movements: DemoMovementService) {
    this.state = state
    this.movements = movements
  }

  async listarManifests(filtros?: ManifestFiltros): Promise<CargoManifestRow[]> {
    requirePermission(this.state, "cargo.read", "listar manifiestos")
    let rows = this.state.manifests
    if (filtros?.estado) rows = rows.filter((m) => m.status === filtros.estado)
    if (filtros?.facilidadId) rows = rows.filter((m) => m.facility_id === filtros.facilidadId)
    if (filtros?.camionId) rows = rows.filter((m) => m.truck_id === filtros.camionId)
    if (filtros?.since) rows = rows.filter((m) => m.created_at >= filtros.since!)
    if (filtros?.until) rows = rows.filter((m) => m.created_at < filtros.until!)
    rows = [...rows].sort((a, b) => b.created_at.localeCompare(a.created_at))
    return clone(applyLimit(rows, filtros))
  }

  async contarManifests(filtros?: ManifestFiltros): Promise<number> {
    requirePermission(this.state, "cargo.read", "contar manifiestos")
    let rows = this.state.manifests
    if (filtros?.estado) rows = rows.filter((m) => m.status === filtros.estado)
    if (filtros?.facilidadId) rows = rows.filter((m) => m.facility_id === filtros.facilidadId)
    if (filtros?.camionId) rows = rows.filter((m) => m.truck_id === filtros.camionId)
    if (filtros?.since) rows = rows.filter((m) => m.created_at >= filtros.since!)
    if (filtros?.until) rows = rows.filter((m) => m.created_at < filtros.until!)
    return rows.length
  }

  async obtenerManifest(id: string): Promise<{
    manifest: CargoManifestRow
    items: { item: CargoItemRow; lots: ItemLotRow[] }[]
    movements: MovementRow[]
  } | null> {
    const manifest = this.state.manifests.find((m) => m.id === id)
    if (!manifest) return null
    const items = this.state.items
      .filter((i) => i.manifest_id === id)
      .sort((a, b) => a.line_number - b.line_number)
      .map((item) => ({
        item: clone(item),
        lots: clone(this.state.lots.filter((l) => l.cargo_item_id === item.id)),
      }))
    const movements = await this.movements.listarMovimientos({ manifestId: id })
    return { manifest: clone(manifest), items, movements }
  }

  async crearManifest(datos: ManifestInsert): Promise<CargoManifestRow> {
    requirePermission(this.state, "cargo.create", "crear manifiesto")
    if (this.state.manifests.some((m) => m.code === datos.code)) {
      throw demoError(`código ${datos.code} ya existe`)
    }
    const manifest: CargoManifestRow = {
      id: demoId("manifest"),
      organization_id: this.state.organization.id,
      facility_id: datos.facility_id,
      code: datos.code,
      truck_id: datos.truck_id ?? null,
      driver_id: datos.driver_id ?? null,
      transport_company_id: datos.transport_company_id ?? null,
      shipper_party_id: datos.shipper_party_id ?? null,
      client_party_id: datos.client_party_id ?? null,
      origin: datos.origin ?? null,
      destination: datos.destination ?? null,
      expected_weight_kg: datos.expected_weight_kg ?? null,
      arrival_date: datos.arrival_date ?? null,
      departure_date: datos.departure_date ?? null,
      status: "received",
      notes: datos.notes ?? null,
      created_by: datos.created_by ?? null,
      created_at: nowIso(),
      updated_at: nowIso(),
    }
    this.state.manifests.push(manifest)
    return clone(manifest)
  }

  async listarItems(manifestId: string): Promise<CargoItemRow[]> {
    requirePermission(this.state, "cargo.read", "listar ítems")
    return clone(this.state.items.filter((i) => i.manifest_id === manifestId).sort((a, b) => a.line_number - b.line_number))
  }

  async crearItem(manifestId: string, datos: CargoItemInsert): Promise<{ item: CargoItemRow; lots: ItemLotRow[] }> {
    requirePermission(this.state, "cargo.update", "crear ítem")
    const manifest = findManifest(this.state, manifestId)
    if (manifest.truck_id && !this.state.trucks.some((t) => t.id === manifest.truck_id)) {
      throw demoError(`camión ${manifest.truck_id} del manifiesto no existe`)
    }
    const item: CargoItemRow = {
      id: demoId("item"),
      organization_id: this.state.organization.id,
      manifest_id: manifestId,
      line_number: datos.line_number,
      sku: datos.sku ?? null,
      description: datos.description,
      category: datos.category ?? null,
      total_quantity: datos.total_quantity,
      uom: datos.uom ?? "unit",
      unit_weight_kg: datos.unit_weight_kg ?? null,
      unit_volume_m3: datos.unit_volume_m3 ?? null,
      status: manifest.truck_id ? "on_truck" : "pending",
      observations: datos.observations ?? null,
      created_at: nowIso(),
      updated_at: nowIso(),
    }
    this.state.items.push(item)
    // ADR 0003: initial lot carries the FULL quantity (leaf Σ = total).
    const lot: ItemLotRow = {
      id: demoId("lot"),
      organization_id: this.state.organization.id,
      manifest_id: manifestId,
      cargo_item_id: item.id,
      parent_lot_id: null,
      quantity: datos.total_quantity,
      uom: datos.uom ?? "unit",
      status: manifest.truck_id ? "on_truck" : "discharged",
      current_location_id: manifest.truck_id ? null : "loc-playon",
      current_truck_id: manifest.truck_id ?? null,
      unit_weight_kg: datos.unit_weight_kg ?? null,
      unit_volume_m3: datos.unit_volume_m3 ?? null,
      created_via_movement_id: null,
      created_at: nowIso(),
      updated_at: nowIso(),
    }
    this.state.lots.push(lot)
    return { item: clone(item), lots: [clone(lot)] }
  }

  async splitItem(input: SplitItemInput): Promise<MovementRow> {
    requirePermission(this.state, "cargo.update", "split de lote")
    if (!(input.cantidad > 0)) throw demoError("la cantidad del split debe ser mayor a 0")
    const parent = findLot(this.state, input.itemLotId)
    if (input.cantidad >= parent.quantity) {
      throw demoError(`cantidad del split (${input.cantidad}) debe ser menor al lote actual (${parent.quantity})`)
    }
    if (parent.status === "seized" || parent.status === "in_quarantine") {
      throw demoError(`el lote ${parent.id} está retenido (${parent.status}) y no puede dividirse`)
    }
    // Full in-memory split: parent reduced, child lot with parent_lot_id.
    parent.quantity -= input.cantidad
    parent.updated_at = nowIso()
    const destination = input.destinoLocationId ?? parent.current_location_id
    const child: ItemLotRow = {
      id: demoId("lot-split"),
      organization_id: this.state.organization.id,
      manifest_id: parent.manifest_id,
      cargo_item_id: parent.cargo_item_id,
      parent_lot_id: parent.id,
      quantity: input.cantidad,
      uom: parent.uom,
      status: parent.current_truck_id ? "on_truck" : parent.status,
      current_location_id: parent.current_truck_id ? null : destination,
      current_truck_id: parent.current_truck_id,
      unit_weight_kg: parent.unit_weight_kg,
      unit_volume_m3: parent.unit_volume_m3,
      created_via_movement_id: null,
      created_at: nowIso(),
      updated_at: nowIso(),
    }
    this.state.lots.push(child)
    const movement = createDemoMovement(this.state, {
      kind: "split",
      manifestId: parent.manifest_id,
      facilityId: findManifest(this.state, parent.manifest_id).facility_id,
      operatorId: input.operatorId ?? null,
      ocurridoEn: input.ocurridoEn,
      operationKey: input.operationKey,
      motivo: input.motivo,
      locationId: destination,
      items: [
        {
          itemLotId: parent.id,
          cantidad: child.quantity,
          origenLocationId: parent.current_location_id,
          destinoLocationId: destination,
          notas: input.notas,
        },
      ],
    })
    child.created_via_movement_id = movement.id
    return movement
  }

  async transferItem(input: TransferItemInput): Promise<MovementRow> {
    requirePermission(this.state, "cargo.transfer", "transferir lote")
    const lot = findLot(this.state, input.itemLotId)
    if (lot.status === "seized" || lot.status === "in_quarantine") {
      throw demoError(`el lote ${lot.id} está retenido (${lot.status}) y no puede transferirse`)
    }
    findLocation(this.state, input.destinoLocationId)
    const cantidad = input.cantidad ?? lot.quantity
    if (cantidad > lot.quantity) throw demoError(`cantidad (${cantidad}) excede el lote (${lot.quantity})`)
    const manifest = findManifest(this.state, lot.manifest_id)
    const movement = createDemoMovement(this.state, {
      kind: "transfer",
      manifestId: lot.manifest_id,
      facilityId: manifest.facility_id,
      operatorId: input.operatorId ?? null,
      ocurridoEn: input.ocurridoEn,
      operationKey: input.operationKey,
      motivo: input.motivo,
      locationId: input.destinoLocationId,
      items: [
        {
          itemLotId: lot.id,
          cantidad,
          origenLocationId: lot.current_location_id,
          destinoLocationId: input.destinoLocationId,
          notas: input.notas,
        },
      ],
    })
    lot.current_location_id = input.destinoLocationId
    lot.current_truck_id = null
    lot.updated_at = nowIso()
    return movement
  }

  async descargar(input: DescargaInput): Promise<MovementRow> {
    requirePermission(this.state, "cargo.update", "descargar manifiesto")
    findLocation(this.state, input.destinoLocationId)
    const manifest = findManifest(this.state, input.manifestId)
    const onTruck = this.state.lots.filter((l) => l.manifest_id === input.manifestId && l.status === "on_truck")
    if (onTruck.length === 0) {
      throw demoError(`el manifiesto ${input.manifestId} no tiene lotes on_truck`)
    }
    const movement = createDemoMovement(this.state, {
      kind: "discharge",
      manifestId: input.manifestId,
      facilityId: manifest.facility_id,
      operatorId: input.operatorId ?? null,
      ocurridoEn: input.ocurridoEn,
      operationKey: input.operationKey,
      motivo: input.motivo,
      locationId: input.destinoLocationId,
      items: onTruck.map((lot) => ({
        itemLotId: lot.id,
        cantidad: lot.quantity,
        origenTruckId: manifest.truck_id,
        destinoLocationId: input.destinoLocationId,
        notas: input.notas,
      })),
    })
    for (const lot of onTruck) {
      lot.status = "discharged"
      lot.current_location_id = input.destinoLocationId
      lot.current_truck_id = null
      lot.updated_at = nowIso()
    }
    manifest.status = "discharged"
    appendAudit(this.state, {
      actor_id: input.operatorId ?? "user-demo",
      action: "cargo.discharge",
      entity_type: "cargo_manifest",
      entity_id: input.manifestId,
      before: null,
      after: { status: "discharged" },
      reason: input.motivo ?? null,
      metadata: null,
    })
    return movement
  }
}

// ---------------------------------------------------------------------
// Locations
// ---------------------------------------------------------------------

class DemoLocationService implements LocationService {
  private readonly state: DemoState

  constructor(state: DemoState) {
    this.state = state
  }

  async listarLocations(filtros?: LocationFiltros): Promise<LocationRow[]> {
    requirePermission(this.state, "warehouse.read", "listar locations")
    let rows = this.state.locations
    if (filtros?.facilidadId) rows = rows.filter((l) => l.facility_id === filtros.facilidadId)
    if (filtros?.tipo) rows = rows.filter((l) => l.type === filtros.tipo)
    if (filtros?.checkpoint) rows = rows.filter((l) => l.checkpoint_kind === filtros.checkpoint)
    if (filtros?.activo !== undefined) rows = rows.filter((l) => l.active === filtros.activo)
    return clone(applyLimit([...rows].sort((a, b) => a.code.localeCompare(b.code)), filtros))
  }

  async obtenerOcupacion(facilidadId?: string): Promise<LocationOccupancyRow[]> {
    requirePermission(this.state, "warehouse.read", "ocupación de locations")
    return clone(
      this.state.locations
        .filter((l) => !facilidadId || l.facility_id === facilidadId)
        .map((location) => {
          const lots = this.state.lots.filter((l) => l.current_location_id === location.id)
          const occupancyKg = lots.reduce((acc, l) => acc + (l.unit_weight_kg ?? 0) * l.quantity, 0)
          const occupancyM3 = lots.reduce((acc, l) => acc + (l.unit_volume_m3 ?? 0) * l.quantity, 0)
          const occupancyUnits = lots.reduce((acc, l) => acc + l.quantity, 0)
          const missingWeight = lots.filter((l) => l.unit_weight_kg === null).length
          const missingVolume = lots.filter((l) => l.unit_volume_m3 === null).length
          const cap = (value: number | null): number | null => (value === null ? null : value)
          const available = (capValue: number | null, used: number): number | null =>
            capValue === null ? null : Math.max(capValue - used, 0)
          const pct = (capValue: number | null, used: number): number | null =>
            capValue === null || capValue === 0 ? null : Math.round((used / capValue) * 100)
          return {
            location_id: location.id,
            organization_id: location.organization_id,
            facility_id: location.facility_id,
            code: location.code,
            occupancy_kg: occupancyKg,
            occupancy_m3: occupancyM3,
            occupancy_units: occupancyUnits,
            missing_weight_lots: missingWeight,
            missing_volume_lots: missingVolume,
            capacity_max_kg: cap(location.capacity_max_kg),
            capacity_max_volume_m3: cap(location.capacity_max_volume_m3),
            capacity_max_units: cap(location.capacity_max_units),
            available_kg: available(location.capacity_max_kg, occupancyKg),
            available_m3: available(location.capacity_max_volume_m3, occupancyM3),
            available_units: available(location.capacity_max_units, occupancyUnits),
            pct_kg: pct(location.capacity_max_kg, occupancyKg),
            pct_m3: pct(location.capacity_max_volume_m3, occupancyM3),
            pct_units: pct(location.capacity_max_units, occupancyUnits),
          }
        }),
    )
  }

  async actualizarCapacidad(locationId: string, cambios: CapacityUpdate): Promise<LocationRow> {
    requirePermission(this.state, "warehouse.configure", "actualizar capacidad")
    const location = findLocation(this.state, locationId)
    Object.assign(location, cambios, { updated_at: nowIso() })
    return clone(location)
  }
}

// ---------------------------------------------------------------------
// Stations (scanner + scale + queue)
// ---------------------------------------------------------------------

class DemoScalaStationService implements ScaleStationService {
  private readonly state: DemoState

  constructor(state: DemoState) {
    this.state = state
  }

  async listarOperaciones(filtros?: ScaleOpFiltros): Promise<ScaleOperationRow[]> {
    requirePermission(this.state, "scale.read", "listar operaciones de balanza")
    let rows = this.state.scaleOps
    if (filtros?.itemLotId) rows = rows.filter((o) => o.item_lot_id === filtros.itemLotId)
    if (filtros?.movementId !== undefined) rows = rows.filter((o) => o.movement_id === filtros.movementId)
    if (filtros?.dentroTolerancia !== undefined) rows = rows.filter((o) => o.within_tolerance === filtros.dentroTolerancia)
    return clone(applyLimit([...rows].sort((a, b) => b.weighed_at.localeCompare(a.weighed_at)), filtros))
  }

  async crearOperacionEscala(input: ScaleOpInput): Promise<ScaleOperationRow> {
    requirePermission(this.state, "scale.create", "pesar lote")
    const lot = findLot(this.state, input.itemLotId)
    const movement = createDemoMovement(this.state, {
      kind: "scale",
      manifestId: lot.manifest_id,
      operatorId: input.operatorId ?? null,
      ocurridoEn: input.ocurridoEn,
      operationKey: input.operationKey,
      locationId: lot.current_location_id,
      items: [{ itemLotId: lot.id, cantidad: lot.quantity, destinoLocationId: lot.current_location_id }],
    })
    const op: ScaleOperationRow = {
      id: `scale-op-${this.state.nextOpId++}`,
      organization_id: this.state.organization.id,
      movement_id: movement.id,
      item_lot_id: input.itemLotId,
      gross_kg: input.grossKg ?? null,
      tare_kg: input.tareKg ?? null,
      net_kg: input.netKg ?? null,
      expected_kg: input.expectedKg ?? null,
      tolerance_kg: input.toleranceKg ?? null,
      within_tolerance: input.withinTolerance,
      device_id: input.deviceId ?? null,
      weighed_at: nowIso(),
      operator_id: input.operatorId ?? null,
    }
    this.state.scaleOps.push(op)
    return clone(op)
  }
}

class DemoScannerStationService implements ScannerStationService {
  private readonly state: DemoState

  constructor(state: DemoState) {
    this.state = state
  }

  async listarOperaciones(filtros?: ScannerOpFiltros): Promise<ScannerOperationRow[]> {
    requirePermission(this.state, "scanner.read", "listar operaciones de escáner")
    let rows = this.state.scannerOps
    if (filtros?.itemLotId) rows = rows.filter((o) => o.item_lot_id === filtros.itemLotId)
    if (filtros?.movementId !== undefined) rows = rows.filter((o) => o.movement_id === filtros.movementId)
    if (filtros?.resultado) rows = rows.filter((o) => o.result === filtros.resultado)
    return clone(applyLimit([...rows].sort((a, b) => b.scanned_at.localeCompare(a.scanned_at)), filtros))
  }

  async crearOperacionScan(input: ScannerOpInput): Promise<ScannerOperationRow> {
    requirePermission(this.state, "scanner.create", "escanear lote")
    const lot = findLot(this.state, input.itemLotId)
    const movement = createDemoMovement(this.state, {
      kind: input.kind ?? "scan_in",
      manifestId: lot.manifest_id,
      operatorId: input.operatorId ?? null,
      ocurridoEn: input.ocurridoEn,
      operationKey: input.operationKey,
      locationId: lot.current_location_id,
      items: [{ itemLotId: lot.id, cantidad: lot.quantity, destinoLocationId: lot.current_location_id }],
    })
    if (input.kind !== "scan_out") {
      lot.status = "checked"
      lot.updated_at = nowIso()
    }
    const op: ScannerOperationRow = {
      id: `scan-op-${this.state.nextOpId++}`,
      organization_id: this.state.organization.id,
      movement_id: movement.id,
      item_lot_id: input.itemLotId,
      scanned_code: input.scannedCode,
      device_id: input.deviceId ?? null,
      result: input.result ?? "success",
      payload: null,
      scanned_at: nowIso(),
      operator_id: input.operatorId ?? null,
    }
    this.state.scannerOps.push(op)
    return clone(op)
  }
}

class DemoStationService implements StationService {
  readonly scanner: ScannerStationService
  readonly escala: ScaleStationService
  private readonly state: DemoState

  constructor(state: DemoState) {
    this.state = state
    this.scanner = new DemoScannerStationService(state)
    this.escala = new DemoScalaStationService(state)
  }

  async obtenerColaPendiente(kind?: "scan" | "scale"): Promise<StationQueueRow[]> {
    requirePermission(this.state, "warehouse.read", "cola de estaciones")
    const rows: StationQueueRow[] = []
    for (const lot of this.state.lots) {
      const checkpoint = lot.current_location_id
        ? this.state.locations.find((l) => l.id === lot.current_location_id)
        : undefined
      if (!checkpoint || checkpoint.type !== "checkpoint") continue
      const queueKind = checkpoint.checkpoint_kind === "scan" ? "scan" : checkpoint.checkpoint_kind === "scale" ? "scale" : null
      if (!queueKind) continue
      if (kind && queueKind !== kind) continue
      // Pending = no operation row exists for this lot (any ok'd scan/scale of the placement).
      const done =
        queueKind === "scan"
          ? this.state.scannerOps.some((o) => o.item_lot_id === lot.id)
          : this.state.scaleOps.some((o) => o.item_lot_id === lot.id)
      if (done) continue
      const manifest = findManifest(this.state, lot.manifest_id)
      const item = this.state.items.find((i) => i.id === lot.cargo_item_id)
      rows.push({
        queue_kind: queueKind,
        item_lot_id: lot.id,
        organization_id: this.state.organization.id,
        manifest_id: lot.manifest_id,
        cargo_item_id: lot.cargo_item_id,
        lot_status: lot.status,
        quantity: lot.quantity,
        uom: lot.uom,
        checkpoint_location_id: checkpoint.id,
        checkpoint_code: checkpoint.code,
        sku: item?.sku ?? null,
        item_description: item?.description ?? "",
        manifest_code: manifest.code,
        truck_id: manifest.truck_id,
        created_at: lot.updated_at,
      })
    }
    return clone(rows.sort((a, b) => a.created_at.localeCompare(b.created_at)))
  }
}

// ---------------------------------------------------------------------
// Holds (quarantine + seizure, full supervision flow in-memory)
// ---------------------------------------------------------------------

class DemoQuarantineHoldService implements QuarantineHoldService {
  private readonly state: DemoState

  constructor(state: DemoState) {
    this.state = state
  }

  async listar(filtros?: QuarantineHoldFiltros): Promise<QuarantineOperationRow[]> {
    requirePermission(this.state, "quarantine.read", "listar rezagos")
    let rows = this.state.quarantineOps
    if (filtros?.estado) rows = rows.filter((o) => o.status === filtros.estado)
    if (filtros?.itemLotId) rows = rows.filter((o) => o.item_lot_id === filtros.itemLotId)
    if (filtros?.movementId !== undefined) rows = rows.filter((o) => o.movement_id === filtros.movementId)
    if (filtros?.abiertoPor) rows = rows.filter((o) => o.opened_by === filtros.abiertoPor)
    if (filtros?.since) rows = rows.filter((o) => o.opened_at >= filtros.since!)
    if (filtros?.until) rows = rows.filter((o) => o.opened_at < filtros.until!)
    return clone(applyLimit([...rows].sort((a, b) => b.opened_at.localeCompare(a.opened_at)), filtros))
  }

  async crear(input: QuarantineOpenInput): Promise<QuarantineOperationRow> {
    requirePermission(this.state, "quarantine.create", "abrir rezago")
    if (!input.reason.trim()) throw demoError("el motivo (reason) es obligatorio para abrir un rezago")
    if (!input.operatorId) throw demoError("operatorId es obligatorio al abrir un rezago (opened_by NOT NULL)")
    assertLocationAccepts(this.state, input.locationId)
    const lot = findLot(this.state, input.itemLotId)
    if (lot.status === "seized" || lot.status === "in_quarantine") {
      throw demoError(`el lote ${lot.id} ya está retenido (${lot.status})`)
    }
    const destination = input.locationId ?? lot.current_location_id ?? "loc-rezago"
    const movement = createDemoMovement(this.state, {
      kind: "quarantine",
      manifestId: lot.manifest_id,
      operatorId: input.operatorId,
      ocurridoEn: input.ocurridoEn,
      operationKey: input.operationKey,
      motivo: input.reason,
      locationId: destination,
      items: [
        {
          itemLotId: lot.id,
          cantidad: lot.quantity,
          origenLocationId: lot.current_location_id,
          destinoLocationId: destination,
          notas: input.notas,
        },
      ],
    })
    lot.status = "in_quarantine"
    lot.current_location_id = destination
    lot.current_truck_id = null
    lot.updated_at = nowIso()
    const op: QuarantineOperationRow = {
      id: `qu-${this.state.nextOpId++}`,
      organization_id: this.state.organization.id,
      movement_id: movement.id,
      item_lot_id: lot.id,
      reason: input.reason,
      status: "open",
      opened_by: input.operatorId,
      opened_at: nowIso(),
      resolved_by: null,
      resolved_at: null,
      resolution_note: null,
    }
    this.state.quarantineOps.push(op)
    appendAudit(this.state, {
      actor_id: input.operatorId,
      action: "quarantine.create",
      entity_type: "item_lot",
      entity_id: lot.id,
      before: null,
      after: { status: "in_quarantine" },
      reason: input.reason,
      metadata: null,
    })
    return clone(op)
  }

  async resolver(id: string, input: HoldResolveInput): Promise<QuarantineOperationRow> {
    const op = this.state.quarantineOps.find((o) => o.id === id)
    if (!op) throw demoError(`rezago ${id} no encontrado`)
    if (op.status === "resolved" || op.status === "released") throw demoError(`rezago ${id} ya resuelto`)
    resolveHold(this.state, "quarantine", op, input)
    op.status = "released"
    op.resolved_by = input.resolvedBy ?? null
    op.resolved_at = nowIso()
    op.resolution_note = input.resolutionNote
    appendAudit(this.state, {
      actor_id: input.resolvedBy ?? "user-demo",
      action: "quarantine.release",
      entity_type: "item_lot",
      entity_id: op.item_lot_id,
      before: null,
      after: { status: "released" },
      reason: input.resolutionNote,
      metadata: null,
    })
    return clone(op)
  }
}

class DemoSeizureHoldService implements SeizureHoldService {
  private readonly state: DemoState

  constructor(state: DemoState) {
    this.state = state
  }

  async listar(filtros?: SeizureHoldFiltros): Promise<SeizureOperationRow[]> {
    requirePermission(this.state, "seizure.read", "listar secuestros")
    let rows = this.state.seizureOps
    if (filtros?.estado) rows = rows.filter((o) => o.status === filtros.estado)
    if (filtros?.itemLotId) rows = rows.filter((o) => o.item_lot_id === filtros.itemLotId)
    if (filtros?.movementId !== undefined) rows = rows.filter((o) => o.movement_id === filtros.movementId)
    if (filtros?.abiertoPor) rows = rows.filter((o) => o.opened_by === filtros.abiertoPor)
    if (filtros?.since) rows = rows.filter((o) => o.opened_at >= filtros.since!)
    if (filtros?.until) rows = rows.filter((o) => o.opened_at < filtros.until!)
    return clone(applyLimit([...rows].sort((a, b) => b.opened_at.localeCompare(a.opened_at)), filtros))
  }

  async crear(input: SeizureOpenInput): Promise<SeizureOperationRow> {
    requirePermission(this.state, "seizure.create", "abrir secuestro")
    if (!input.legalRef.trim()) throw demoError("la referencia legal (legal_ref) es obligatoria para abrir un secuestro")
    if (!input.operatorId) throw demoError("operatorId es obligatorio al abrir un secuestro (opened_by NOT NULL)")
    assertLocationAccepts(this.state, input.locationId)
    const lot = findLot(this.state, input.itemLotId)
    if (lot.status === "seized" || lot.status === "in_quarantine") {
      throw demoError(`el lote ${lot.id} ya está retenido (${lot.status})`)
    }
    const destination = input.locationId ?? lot.current_location_id ?? "loc-secuestro"
    const movement = createDemoMovement(this.state, {
      kind: "seizure",
      manifestId: lot.manifest_id,
      operatorId: input.operatorId,
      ocurridoEn: input.ocurridoEn,
      operationKey: input.operationKey,
      motivo: input.notas ?? null,
      locationId: destination,
      items: [
        {
          itemLotId: lot.id,
          cantidad: lot.quantity,
          origenLocationId: lot.current_location_id,
          destinoLocationId: destination,
          notas: input.notas,
        },
      ],
    })
    lot.status = "seized"
    lot.current_location_id = destination
    lot.current_truck_id = null
    lot.updated_at = nowIso()
    const op: SeizureOperationRow = {
      id: `se-${this.state.nextOpId++}`,
      organization_id: this.state.organization.id,
      movement_id: movement.id,
      item_lot_id: lot.id,
      legal_ref: input.legalRef,
      status: "open",
      opened_by: input.operatorId,
      opened_at: nowIso(),
      resolved_by: null,
      resolved_at: null,
      resolution_note: null,
    }
    this.state.seizureOps.push(op)
    appendAudit(this.state, {
      actor_id: input.operatorId,
      action: "seizure.create",
      entity_type: "item_lot",
      entity_id: lot.id,
      before: null,
      after: { status: "seized" },
      reason: input.notas ?? null,
      metadata: null,
    })
    return clone(op)
  }

  async resolver(id: string, input: HoldResolveInput): Promise<SeizureOperationRow> {
    const op = this.state.seizureOps.find((o) => o.id === id)
    if (!op) throw demoError(`secuestro ${id} no encontrado`)
    if (op.status === "resolved") throw demoError(`secuestro ${id} ya resuelto`)
    resolveHold(this.state, "seizure", op, input)
    op.status = "resolved"
    op.resolved_by = input.resolvedBy ?? null
    op.resolved_at = nowIso()
    op.resolution_note = input.resolutionNote
    appendAudit(this.state, {
      actor_id: input.resolvedBy ?? "user-demo",
      action: "seizure.release",
      entity_type: "item_lot",
      entity_id: op.item_lot_id,
      before: null,
      after: { status: "released" },
      reason: input.resolutionNote,
      metadata: null,
    })
    return clone(op)
  }
}

/** Shared release: movement kind 'release' + lot unfreeze (supervisor gate). */
function resolveHold(
  state: DemoState,
  kind: "quarantine" | "seizure",
  op: { item_lot_id: string; movement_id: number },
  input: HoldResolveInput,
): void {
  // Supervisor gate: the RLS has no UPDATE policy on ops; the engine path
  // re-validates. The demo enforces the same two-role window.
  if (state.role !== "admin" && state.role !== "supervisor") {
    throw demoError(`resolver ${kind} requiere rol admin o supervisor (actual: ${state.role})`)
  }
  if (!input.resolutionNote.trim()) {
    throw demoError(`resolutionNote es obligatoria al resolver un ${kind}`)
  }
  const lot = findLot(state, op.item_lot_id)
  requireMovementKind(state, "release")
  createDemoMovement(state, {
    kind: "release",
    manifestId: lot.manifest_id,
    operatorId: input.resolvedBy ?? null,
    motivo: input.resolutionNote,
    locationId: lot.current_location_id,
    items: [
      {
        itemLotId: lot.id,
        cantidad: lot.quantity,
        origenLocationId: lot.current_location_id,
        destinoLocationId: lot.current_location_id,
        notas: input.resolutionNote,
      },
    ],
  })
  lot.status = "released"
  lot.updated_at = nowIso()
}

class DemoHoldService implements HoldService {
  readonly quarantine: QuarantineHoldService
  readonly seizure: SeizureHoldService

  constructor(state: DemoState) {
    this.quarantine = new DemoQuarantineHoldService(state)
    this.seizure = new DemoSeizureHoldService(state)
  }
}

// ---------------------------------------------------------------------
// Audit + dashboard
// ---------------------------------------------------------------------

class DemoAuditService implements AuditService {
  private readonly state: DemoState

  constructor(state: DemoState) {
    this.state = state
  }

  async listarAudit(filtros?: AuditLogFiltros): Promise<AuditLogRow[]> {
    requirePermission(this.state, "audit.read", "listar auditoría")
    let rows = this.state.auditLog
    if (filtros?.actorId) rows = rows.filter((a) => a.actor_id === filtros.actorId)
    if (filtros?.action) rows = rows.filter((a) => a.action === filtros.action)
    if (filtros?.entityType) rows = rows.filter((a) => a.entity_type === filtros.entityType)
    if (filtros?.entityId) rows = rows.filter((a) => a.entity_id === filtros.entityId)
    if (filtros?.since) rows = rows.filter((a) => a.created_at >= filtros.since!)
    if (filtros?.until) rows = rows.filter((a) => a.created_at < filtros.until!)
    return clone(applyLimit([...rows].sort((a, b) => b.created_at.localeCompare(a.created_at)), filtros))
  }

  async detalle(id: number): Promise<AuditLogRow | null> {
    const row = this.state.auditLog.find((a) => a.id === id)
    return row ? clone(row) : null
  }
}

class DemoDashboardService implements DashboardService {
  private readonly state: DemoState

  constructor(state: DemoState) {
    this.state = state
  }

  async obtenerMetricas(): Promise<DashboardMetricsRow | null> {
    requirePermission(this.state, "cargo.read", "métricas de dashboard")
    const lots = this.state.lots
    const inYard = this.state.trucks.filter((t) => t.status === "in_playon").length
    const sectorsZones = this.state.locations.filter((l) => l.type === "zone")
    const occupiedSectors = new Set(
      lots.filter((l) => l.current_location_id && this.state.locations.find((loc) => loc.id === l.current_location_id)?.type === "zone")
        .map((l) => l.current_location_id),
    ).size
    const sumQty = (predicate: (l: ItemLotRow) => boolean) =>
      lots.filter(predicate).reduce((acc, l) => acc + l.quantity, 0)
    const sumWeight = (predicate: (l: ItemLotRow) => boolean) =>
      lots.filter(predicate).reduce((acc, l) => acc + (l.unit_weight_kg ?? 0) * l.quantity, 0)
    return {
      organization_id: this.state.organization.id,
      trucks_in_yard: inYard,
      trucks_waiting: inYard,
      trucks_discharging: 0,
      merchandise_stored: sumQty((l) => l.status === "in_warehouse"),
      merchandise_stored_weight_kg: sumWeight((l) => l.status === "in_warehouse"),
      merchandise_in_scanner: sumQty(
        (l) => l.current_location_id === "loc-scanner",
      ),
      merchandise_in_scale: sumQty(
        (l) => l.current_location_id === "loc-balanza",
      ),
      merchandise_in_quarantine: sumQty((l) => l.status === "in_quarantine"),
      merchandise_seized: sumQty((l) => l.status === "seized"),
      sectors_occupied: occupiedSectors,
      sectors_free: sectorsZones.length - occupiedSectors,
    }
  }
}

// ---------------------------------------------------------------------
// Floor plans (Fase 4/14, ADR 0005/0015)
//
// Mirrors the Supabase client semantics 1:1, including the RLS-shaped
// constraints: no physical deletes (elements soft-hide via is_visible),
// draft-only edits, publish archives the previous published version of the
// same (facility, name), and audit rows are appended (server-side engine
// in production; in-memory here so the UI exercises the flow).
// ---------------------------------------------------------------------

class DemoLayoutService implements LayoutService {
  private readonly state: DemoState
  private readonly locations: DemoLocationService

  constructor(state: DemoState) {
    this.state = state
    this.locations = new DemoLocationService(state)
  }

  private conCreador(layout: LayoutRow): LayoutVersionRow {
    const creador = this.state.users.find((u) => u.id === layout.created_by)
    return { ...layout, creador_nombre: creador?.full_name ?? null }
  }

  private elementosVisibles(layoutId: string): LayoutElementRow[] {
    return this.state.layoutElements
      .filter((e) => e.layout_id === layoutId && e.is_visible)
      .sort((a, b) => a.z_index - b.z_index || a.id.localeCompare(b.id))
  }

  private proximoCodigo(elementType: LayoutElementRow["element_type"]): string {
    const prefijo = TIPO_CODIGO_PREFIJO[elementType]
    let max = 0
    for (const l of this.state.locations) {
      const match = /^[A-Z]+-(\d+)$/.exec(l.code)
      if (match) max = Math.max(max, Number.parseInt(match[1], 10))
    }
    return `${prefijo}-${String(max + 1).padStart(3, "0")}`
  }

  async listarVersiones(filtros?: LayoutFiltros): Promise<LayoutVersionRow[]> {
    requirePermission(this.state, "warehouse.read", "listar versiones de layouts")
    let rows = this.state.layouts
    if (filtros?.facilidadId) rows = rows.filter((l) => l.facility_id === filtros.facilidadId)
    if (filtros?.nombre) rows = rows.filter((l) => l.name === filtros.nombre)
    if (filtros?.estado) rows = rows.filter((l) => l.status === filtros.estado)
    const ordenadas = [...rows].sort(
      (a, b) => a.name.localeCompare(b.name) || b.version - a.version,
    )
    return clone(applyLimit(ordenadas.map((l) => this.conCreador(l)), filtros))
  }

  async obtenerLayout(id: string): Promise<LayoutVersionRow | null> {
    requirePermission(this.state, "warehouse.read", "obtener layout")
    const row = this.state.layouts.find((l) => l.id === id)
    return row ? clone(this.conCreador(row)) : null
  }

  async obtenerComparacionLayout(
    facilityId: string,
    name: string,
    fromVersion: number,
    toVersion: number,
  ): Promise<LayoutDiff> {
    requirePermission(this.state, "warehouse.read", "comparar versiones de layout")
    const versiones = this.state.layouts.filter(
      (l) => l.facility_id === facilityId && l.name === name,
    )
    const from = versiones.find((l) => l.version === fromVersion)
    const to = versiones.find((l) => l.version === toVersion)
    if (fromVersion > 0 && !from) throw demoError(`versión ${fromVersion} de "${name}" no existe`)
    if (!to) throw demoError(`versión ${toVersion} de "${name}" no existe`)
    return computarDiffLayout(
      fromVersion > 0 && from ? this.elementosVisibles(from.id) : [],
      this.elementosVisibles(to.id),
      { facilityId, name, fromVersion, toVersion },
    )
  }

  async obtenerLayoutConElementos(id: string): Promise<LayoutConElementos | null> {
    const layout = await this.obtenerLayout(id)
    if (!layout) return null
    return { layout, elementos: clone(this.elementosVisibles(id)) }
  }

  async obtenerLayoutPublicado(facilidadId: string): Promise<LayoutConElementos | null> {
    requirePermission(this.state, "warehouse.read", "obtener layout publicado")
    const publicado = [...this.state.layouts]
      .filter((l) => l.facility_id === facilidadId && l.status === "published")
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0]
    if (!publicado) return null
    return { layout: clone(publicado), elementos: clone(this.elementosVisibles(publicado.id)) }
  }

  async obtenerMapaOperativo(facilidadId: string): Promise<MapaOperativoResultado | null> {
    const publicado = await this.obtenerLayoutPublicado(facilidadId)
    if (!publicado) return null
    const [ubicaciones, ocupacion] = await Promise.all([
      this.locations.listarLocations({ facilidadId }),
      this.locations.obtenerOcupacion(facilidadId),
    ])
    const locById = new Map(ubicaciones.map((l) => [l.id, l]))
    const occByLoc = new Map(ocupacion.map((o) => [o.location_id, o]))
    return {
      layout: publicado.layout,
      elementos: publicado.elementos.map((elemento) => ({
        elemento,
        ubicacion: elemento.location_id ? locById.get(elemento.location_id) ?? null : null,
        ocupacion: elemento.location_id ? occByLoc.get(elemento.location_id) ?? null : null,
      })),
    }
  }

  async ubicacionesConHoldAbierto(_facilidadId: string): Promise<string[]> {
    requirePermission(this.state, "warehouse.read", "consultar holds abiertos del mapa")
    return Array.from(
      new Set(
        this.state.lots
          .filter((l) => l.status === "in_quarantine" || l.status === "seized")
          .map((l) => l.current_location_id)
          .filter((id): id is string => id !== null),
      ),
    )
  }

  async crearVersion(input: CrearVersionInput): Promise<LayoutConElementos> {
    requirePermission(this.state, "warehouse.configure", "crear versión de layout")
    const versiones = this.state.layouts.filter(
      (l) => l.facility_id === input.facilityId && l.name === input.name,
    )
    const version = versiones.reduce((max, l) => Math.max(max, l.version), 0) + 1
    const layout: LayoutRow = {
      id: demoId("lay"),
      organization_id: this.state.organization.id,
      facility_id: input.facilityId,
      name: input.name,
      version,
      status: "draft",
      created_by: input.actorId ?? null,
      description: input.description ?? null,
      changes: null,
      scale: 20,
      background: { grid: true, gridSize: 20, color: null } as Json,
      created_at: nowIso(),
      updated_at: nowIso(),
    }
    this.state.layouts.push(layout)

    let elementos: LayoutElementRow[] = []
    if (input.baseVersionId) {
      for (const e of this.elementosVisibles(input.baseVersionId)) {
        this.state.layoutElements.push({
          ...e,
          id: `layel-${this.state.nextElementId++}`,
          layout_id: layout.id,
          created_at: nowIso(),
          updated_at: nowIso(),
        })
      }
      elementos = this.elementosVisibles(layout.id)
    }

    appendAudit(this.state, {
      actor_id: input.actorId ?? this.state.users[0]?.id ?? null,
      action: "layout.create",
      entity_type: "layout",
      entity_id: layout.id,
      before: null,
      after: { name: layout.name, version: layout.version, status: "draft" },
      reason: input.description ?? null,
      metadata: null,
    })
    return { layout: clone(layout), elementos: clone(elementos) }
  }

  async guardarBorrador(input: GuardarBorradorInput): Promise<LayoutConElementos> {
    requirePermission(this.state, "warehouse.configure", "guardar borrador de layout")
    const layout = this.state.layouts.find((l) => l.id === input.layoutId)
    if (!layout) throw demoError(`layout ${input.layoutId} no existe`)
    if (layout.status !== "draft") throw demoError(`solo borradores se guardan (${layout.status})`)

    if (input.description !== undefined) layout.description = input.description
    if (input.escala !== undefined) layout.scale = input.escala
    if (input.background !== undefined) layout.background = input.background
    layout.updated_at = nowIso()

    const drafts = (input.elementos ?? []).map((e) => ({
      ...e,
      rotation: e.rotation ?? 0,
      z_index: e.z_index ?? 0,
      is_visible: e.is_visible ?? true,
    }))

    for (const draft of drafts) {
      if (draft.id) {
        const existing = this.state.layoutElements.find(
          (el) => el.id === draft.id && el.layout_id === input.layoutId,
        )
        if (existing) {
          Object.assign(existing, draft, { layout_id: input.layoutId, updated_at: nowIso() })
        } else {
          this.state.layoutElements.push({
            ...(draft as LayoutElementRow),
            id: draft.id,
            layout_id: input.layoutId,
            created_at: nowIso(),
            updated_at: nowIso(),
          })
        }
      } else {
        this.state.layoutElements.push({
          ...(draft as LayoutElementRow),
          id: `layel-${this.state.nextElementId++}`,
          layout_id: input.layoutId,
          created_at: nowIso(),
          updated_at: nowIso(),
        })
      }
    }

    const incomingIds = new Set(drafts.filter((d) => d.id).map((d) => d.id as string))
    for (const el of this.state.layoutElements) {
      if (
        el.layout_id === input.layoutId &&
        el.is_visible &&
        el.id !== undefined &&
        !incomingIds.has(el.id)
      ) {
        el.is_visible = false
        el.updated_at = nowIso()
      }
    }

    return { layout: clone(layout), elementos: clone(this.elementosVisibles(input.layoutId)) }
  }

  async publicarVersion(
    layoutId: string,
    cambios?: CambiosLayout | null,
    actorId?: string,
  ): Promise<LayoutVersionRow> {
    requirePermission(this.state, "warehouse.configure", "publicar versión de layout")
    const layout = this.state.layouts.find((l) => l.id === layoutId)
    if (!layout) throw demoError(`layout ${layoutId} no existe`)
    if (layout.status !== "draft") throw demoError(`solo versiones borrador se publican (${layout.status})`)

    for (const other of this.state.layouts) {
      if (
        other.facility_id === layout.facility_id &&
        other.name === layout.name &&
        other.status === "published" &&
        other.id !== layout.id
      ) {
        other.status = "archived"
        other.updated_at = nowIso()
      }
    }
    layout.status = "published"
    layout.changes = (cambios ?? layout.changes) as Json
    layout.updated_at = nowIso()

    appendAudit(this.state, {
      actor_id: actorId ?? this.state.users[0]?.id ?? null,
      action: "layout.publish",
      entity_type: "layout",
      entity_id: layout.id,
      before: { status: "draft" },
      after: { name: layout.name, version: layout.version, status: "published" },
      reason: null,
      metadata: null,
    })
    return clone(this.conCreador(layout))
  }

  async restaurarVersion(layoutId: string, actorId?: string): Promise<LayoutConElementos> {
    requirePermission(this.state, "warehouse.configure", "restaurar versión de layout")
    const source = this.state.layouts.find((l) => l.id === layoutId)
    if (!source) throw demoError(`layout ${layoutId} no existe`)

    const version = await this.crearVersion({
      facilityId: source.facility_id,
      name: source.name,
      description: `Restaurado desde versión ${source.version}`,
      baseVersionId: source.id,
      actorId,
    })
    const created = this.state.layouts.find((l) => l.id === version.layout.id)!
    appendAudit(this.state, {
      actor_id: actorId ?? this.state.users[0]?.id ?? null,
      action: "layout.restore",
      entity_type: "layout",
      entity_id: created.id,
      before: null,
      after: { name: created.name, version: created.version, status: "draft", restored_from: source.version },
      reason: `Restaurado desde versión ${source.version}`,
      metadata: null,
    })
    return version
  }

  async crearElemento(input: CrearElementoInput): Promise<LayoutElementRow> {
    requirePermission(this.state, "warehouse.configure", "crear elemento de layout")
    const esLugar = TIPOS_LUGAR.has(input.elementType)

    const layout = this.state.layouts.find((l) => l.id === input.layoutId)
    if (!layout) throw demoError(`layout ${input.layoutId} no existe`)

    let locationId: string | null = null
    if (esLugar) {
      const shape = PLACE_LOCATION[input.elementType]
      const codigo = this.proximoCodigo(input.elementType)
      const location: LocationRow = {
        id: demoId("loc"),
        organization_id: this.state.organization.id,
        facility_id: layout.facility_id,
        parent_id: null,
        type: shape.type,
        checkpoint_kind: shape.checkpoint_kind,
        code: codigo,
        name: codigo,
        physical_width: null,
        physical_height: null,
        physical_depth: null,
        physical_unit: "m",
        capacity_max_units: null,
        capacity_max_kg: null,
        capacity_max_volume_m3: null,
        allows_hold: shape.allows_hold,
        requires_authorization: false,
        notes: null,
        active: true,
        maintenance: false,
        created_at: nowIso(),
        updated_at: nowIso(),
      }
      this.state.locations.push(location)
      locationId = location.id
    }

    const elemento: LayoutElementRow = {
      id: `layel-${this.state.nextElementId++}`,
      layout_id: input.layoutId,
      location_id: locationId,
      element_type: input.elementType,
      code: null,
      name: esLugar ? null : input.name ?? null,
      description: null,
      x: input.x,
      y: input.y,
      visual_width: input.visualWidth,
      visual_height: input.visualHeight,
      rotation: 0,
      color: input.color ?? null,
      icon: input.icon ?? null,
      z_index: input.zIndex ?? 0,
      label: input.label ?? null,
      is_locked: false,
      is_visible: true,
      created_at: nowIso(),
      updated_at: nowIso(),
    }
    this.state.layoutElements.push(elemento)
    return clone(elemento)
  }

  async eliminarElemento(layoutId: string, elementId: string): Promise<EliminarElementoResultado> {
    requirePermission(this.state, "warehouse.configure", "eliminar elemento de layout")
    const elemento = this.state.layoutElements.find(
      (el) => el.id === elementId && el.layout_id === layoutId,
    )
    if (!elemento) return { elementoBorrado: false }

    elemento.is_visible = false
    elemento.updated_at = nowIso()
    return {
      elementoBorrado: true,
      aviso: elemento.location_id
        ? "El elemento se ocultó del plano; la ubicación y su historial se conservan (sin borrado físico por RLS)."
        : undefined,
    }
  }
}

// ---------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------

export interface DemoServices {
  /** Active adapter mode — lets the shell label/locks DEMO-only affordances. */
  mode: "demo"
  auth: AuthService
  trucks: TruckService
  cargo: CargoService
  movements: MovementService
  locations: LocationService
  stations: StationService
  holds: HoldService
  audit: AuditService
  dashboard: DashboardService
  layouts: LayoutService
}

export function createDemoServices(options: DemoServiceOptions = {}): DemoServices {
  const state = createDemoState()
  state.role = options.role ?? "admin"

  const movements = new DemoMovementService(state)
  return {
    mode: "demo",
    auth: new DemoAuthService(state),
    trucks: new DemoTruckService(state),
    cargo: new DemoCargoService(state, movements),
    movements,
    locations: new DemoLocationService(state),
    stations: new DemoStationService(state),
    holds: new DemoHoldService(state),
    audit: new DemoAuditService(state),
    dashboard: new DemoDashboardService(state),
    layouts: new DemoLayoutService(state),
  }
}