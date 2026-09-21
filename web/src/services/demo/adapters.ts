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
//   - The demo session starts SIGNED-IN as demo@cargocontrol.local
//     (role configurable via options.role, default 'admin').
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
import { MOVEMENT_KIND_PERMISSION, type MovementService } from "@/services/movementService"
import type { MovementDetail } from "@/services/movementService"
import type {
  AuthService,
  LoginResult,
  SesionInfo,
} from "@/services/authService"
import type {
  ScaleStationService,
  ScannerStationService,
  StationService,
} from "@/services/stationService"
import type { ScaleOpInput, ScannerOpInput } from "@/services/stationService"
import type { TruckService } from "@/services/truckService"
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
import type { LocationFiltros } from "@/services/shared"
import {
  DEMO_EMAIL,
  DEMO_PASSWORD,
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

let idCounter = 0

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
    this.sessionUser = state.users.find((u) => u.email === DEMO_EMAIL) ?? null
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
    if (!user || password !== DEMO_PASSWORD) {
      throw demoError(`credenciales inválidas (use ${DEMO_EMAIL} / ${DEMO_PASSWORD})`)
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

  async perfilActual(): Promise<UserRow | null> {
    return this.sessionUser ? clone(this.sessionUser) : null
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

  async obtener(id: string): Promise<TruckRow | null> {
    const truck = this.state.trucks.find((t) => t.id === id)
    return truck ? clone(truck) : null
  }

  async crear(datos: TruckInsert): Promise<TruckRow> {
    requirePermission(this.state, "truck.create", "crear camión")
    if (this.state.trucks.some((t) => t.plate === datos.plate)) {
      throw demoError(`patente ${datos.plate} ya existe`)
    }
    const truck: TruckRow = {
      id: demoId("truck"),
      organization_id: this.state.organization.id,
      transport_company_id: datos.transport_company_id ?? null,
      plate: datos.plate,
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
    Object.assign(truck, cambios, { updated_at: nowIso() })
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
    if (manifest.status !== "closed") {
      throw demoError(`el manifiesto ${manifestId} debe estar 'closed' para egresar`)
    }
    const movement = createDemoMovement(this.state, {
      kind: "egress",
      manifestId,
      facilityId: manifest.facility_id,
      operatorId: input?.operatorId ?? null,
      ocurridoEn: input?.ocurridoEn,
      operationKey: input?.operationKey,
      motivo: input?.motivo,
    })
    if (manifest.truck_id) {
      const truck = this.state.trucks.find((t) => t.id === manifest.truck_id)
      if (truck) truck.status = "in_route"
    }
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
// Factory
// ---------------------------------------------------------------------

export interface DemoServices {
  auth: AuthService
  trucks: TruckService
  cargo: CargoService
  movements: MovementService
  locations: LocationService
  stations: StationService
  holds: HoldService
  audit: AuditService
  dashboard: DashboardService
}

export function createDemoServices(options: DemoServiceOptions = {}): DemoServices {
  const state = createDemoState()
  state.role = options.role ?? "admin"

  const movements = new DemoMovementService(state)
  return {
    auth: new DemoAuthService(state),
    trucks: new DemoTruckService(state),
    cargo: new DemoCargoService(state, movements),
    movements,
    locations: new DemoLocationService(state),
    stations: new DemoStationService(state),
    holds: new DemoHoldService(state),
    audit: new DemoAuditService(state),
    dashboard: new DemoDashboardService(state),
  }
}