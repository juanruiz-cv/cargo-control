/**
 * Row types — Cargo Control frontend.
 *
 * One `XxxRow` interface per table of supabase/migrations/0001_schema.sql
 * (25 tables). Naming decision (documented, per task contract):
 *
 *   - Column NAMES keep the exact snake_case of the schema. There is no
 *     snake_case → camelCase mapping layer: row types are the identity
 *     mapping, which keeps `.select(...)` column lists and RLS-facing
 *     queries in lockstep with the SQL source of truth. Domain code that
 *     prefers camelCase can map at its own boundary when it lands.
 *   - timestamptz columns are typed `string` (ISO 8601) because that is
 *     what supabase-js returns; `numeric` columns are typed `number`.
 *   - `Json` mirrors Postgres jsonb.
 *
 * Insert/update payload types (`*Insert` / `*Update`) are included for the
 * tables the service layer writes; they follow the same conventions and
 * omit server-generated columns.
 */

import type {
  AttachmentEntityType,
  CargoItemStatus,
  CargoManifestStatus,
  CheckpointKind,
  FacilityStatus,
  FacilityType,
  ItemLotStatus,
  LayoutElementType,
  LayoutStatus,
  LocationType,
  MovementKind,
  OrganizationStatus,
  PartyType,
  PermissionCode,
  PhysicalUnit,
  QuarantineStatus,
  RegistryStatus,
  RoleCode,
  ScannerResult,
  SeizureStatus,
  TruckStatus,
  UserStatus,
} from "@/types/enums"

/** Postgres jsonb mirror. */
export type Json =
  | null
  | boolean
  | number
  | string
  | Json[]
  | { [key: string]: Json }

// ---------------------------------------------------------------------
// Tenancy (database.md §4.1)
// ---------------------------------------------------------------------

export interface OrganizationRow {
  id: string
  name: string
  status: OrganizationStatus
  created_at: string
  updated_at: string
}

export interface FacilityRow {
  id: string
  organization_id: string
  code: string // human-readable, unique per org
  name: string
  type: FacilityType
  address: string | null
  status: FacilityStatus
  created_at: string
  updated_at: string
}

// ---------------------------------------------------------------------
// Physical locations (operational truth — ADR 0004)
// ---------------------------------------------------------------------

export interface LocationRow {
  id: string
  organization_id: string
  facility_id: string
  parent_id: string | null // zone -> bin tree
  type: LocationType
  checkpoint_kind: CheckpointKind | null // only when type = 'checkpoint'
  code: string // unique per facility
  name: string | null
  // physical (real-world) dimensions; DISJOINT from visual px (ADR 0005)
  physical_width: number | null
  physical_height: number | null
  physical_depth: number | null
  physical_unit: PhysicalUnit
  // capacity (advisory maxima; occupancy is derived from item_lots)
  capacity_max_units: number | null
  capacity_max_kg: number | null
  capacity_max_volume_m3: number | null
  allows_hold: boolean // rezago/secuestro staging
  requires_authorization: boolean
  notes: string | null
  active: boolean
  maintenance: boolean // admin-set MANTENIMIENTO visual state (ADR 0012)
  created_at: string
  updated_at: string
}

// ---------------------------------------------------------------------
// Visual layouts (presentation only — ADR 0004 / ADR 0005)
// ---------------------------------------------------------------------

export interface LayoutRow {
  id: string
  organization_id: string
  facility_id: string
  name: string
  version: number // unique (facility_id, name, version) — a row IS a version
  status: LayoutStatus
  created_by: string | null
  description: string | null // Fase 14, ADR 0015
  changes: Json | null // ADR 0015: per-version change summary
  scale: number // px per meter (default 20)
  background: Json | null // canvas meta (color/image/grid)
  created_at: string
  updated_at: string
}

export interface LayoutElementRow {
  id: string
  layout_id: string
  location_id: string | null // place elements only (see CHECK constraint)
  element_type: LayoutElementType
  code: string | null // visual-only elements; places inherit location.code
  name: string | null // display name; falls back to location.name
  description: string | null
  x: number // px, top-left origin
  y: number
  visual_width: number | null
  visual_height: number | null
  rotation: number // degrees
  color: string | null
  icon: string | null
  z_index: number
  label: string | null
  is_locked: boolean
  is_visible: boolean
  created_at: string
  updated_at: string
}

// ---------------------------------------------------------------------
// Identity & access (RBAC, rbac.md)
// ---------------------------------------------------------------------

export interface UserRow {
  id: string
  organization_id: string
  auth_user_id: string // 1:1 with auth.users
  email: string
  full_name: string
  status: UserStatus
  created_at: string
  updated_at: string
}

export interface RoleRow {
  id: string
  code: RoleCode
  name: string // UI label (uppercase: 'ADMIN', ...)
  description: string | null
  created_at: string
  updated_at: string
}

export interface PermissionRow {
  id: string
  code: PermissionCode
  name: string
  description: string | null
  created_at: string
  updated_at: string
}

export interface UserRoleRow {
  user_id: string
  role_id: string
  assigned_by: string | null
  created_at: string
}

export interface RolePermissionRow {
  role_id: string
  permission_id: string
}

// ---------------------------------------------------------------------
// Fleet & counterparties (database.md §4.5)
// ---------------------------------------------------------------------

export interface TransportCompanyRow {
  id: string
  organization_id: string
  name: string
  tax_id: string | null
  contacts: Json | null
  status: RegistryStatus
  created_at: string
  updated_at: string
}

export interface DriverRow {
  id: string
  organization_id: string
  transport_company_id: string | null
  full_name: string
  document_id: string | null
  license_no: string | null
  phone: string | null
  status: RegistryStatus
  created_at: string
  updated_at: string
}

export interface TruckRow {
  id: string
  organization_id: string
  transport_company_id: string | null
  plate: string // unique
  capacity_kg: number | null
  status: TruckStatus // fleet base status only (ADR 0008)
  created_at: string
  updated_at: string
}

export interface PartyRow {
  id: string
  organization_id: string
  type: PartyType
  name: string
  tax_id: string | null
  contacts: Json | null
  status: RegistryStatus
  created_at: string
  updated_at: string
}

// ---------------------------------------------------------------------
// Cargo (quantity + lots, ADR 0003)
// ---------------------------------------------------------------------

export interface CargoManifestRow {
  id: string
  organization_id: string
  facility_id: string
  code: string // unique, human-readable
  truck_id: string | null
  driver_id: string | null
  transport_company_id: string | null
  shipper_party_id: string | null
  client_party_id: string | null
  origin: string | null
  destination: string | null
  expected_weight_kg: number | null
  arrival_date: string | null
  departure_date: string | null
  status: CargoManifestStatus // rollup (flows.md)
  notes: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface CargoItemRow {
  id: string
  organization_id: string
  manifest_id: string
  line_number: number
  sku: string | null // identifier (ADR 0009 §5)
  description: string
  category: string | null // display/grouping label (ADR 0009 §2)
  total_quantity: number // > 0; Σ leaf lot quantities = this (trigger, ADR 0003)
  uom: string
  unit_weight_kg: number | null
  unit_volume_m3: number | null // ADR 0006
  status: CargoItemStatus
  observations: string | null // item-level notes (ADR 0009 §3)
  created_at: string
  updated_at: string
}

export interface ItemLotRow {
  id: string
  organization_id: string
  manifest_id: string
  cargo_item_id: string
  parent_lot_id: string | null // chained splits
  quantity: number // > 0
  uom: string
  status: ItemLotStatus
  current_location_id: string | null // exactly one physical place:
  current_truck_id: string | null // location XOR truck (CHECK constraint)
  unit_weight_kg: number | null // optional override
  unit_volume_m3: number | null // optional override (ADR 0006)
  created_via_movement_id: number | null // FK resolved post-creation (database.md §4.7)
  created_at: string
  updated_at: string
}

// ---------------------------------------------------------------------
// Movement spine (append-only; database.md §4.7 / movement-engine.md)
// ---------------------------------------------------------------------

export interface MovementRow {
  id: number // bigint identity
  organization_id: string
  facility_id: string | null
  kind: MovementKind
  manifest_id: string | null
  operator_id: string | null
  location_id: string | null
  occurred_at: string // domain time
  created_at: string // insert time
  reason: string | null // required for sensitive kinds
  previous_movement_id: number | null // corrections chain
  operation_key: string | null // idempotency key (ADR 0010), unique per org
  payload: Json | null
}

export interface MovementItemRow {
  id: number // bigint identity
  movement_id: number
  item_lot_id: string
  quantity: number // > 0
  from_location_id: string | null
  to_location_id: string | null
  from_truck_id: string | null
  to_truck_id: string | null
  notes: string | null
}

// ---------------------------------------------------------------------
// Specialized operations (detail of a movement; ADR 0011 append-only)
// ---------------------------------------------------------------------

export interface ScannerOperationRow {
  id: string
  organization_id: string
  movement_id: number
  item_lot_id: string
  scanned_code: string // barcode/QR as read
  device_id: string | null // opaque hardware identifier
  result: ScannerResult
  payload: Json | null
  scanned_at: string
  operator_id: string | null
}

export interface ScaleOperationRow {
  id: string
  organization_id: string
  movement_id: number
  item_lot_id: string
  gross_kg: number | null
  tare_kg: number | null
  net_kg: number | null
  expected_kg: number | null
  tolerance_kg: number | null
  within_tolerance: boolean // NOT NULL
  device_id: string | null
  weighed_at: string
  operator_id: string | null
}

export interface QuarantineOperationRow {
  id: string
  organization_id: string
  movement_id: number // opening movement
  item_lot_id: string
  reason: string // NOT NULL — required for sensitive kinds
  status: QuarantineStatus
  opened_by: string
  opened_at: string
  resolved_by: string | null
  resolved_at: string | null
  resolution_note: string | null
}

export interface SeizureOperationRow {
  id: string
  organization_id: string
  movement_id: number // opening movement
  item_lot_id: string
  legal_ref: string | null
  status: SeizureStatus
  opened_by: string
  opened_at: string
  resolved_by: string | null
  resolved_at: string | null
  resolution_note: string | null
}

// ---------------------------------------------------------------------
// Support (database.md §4.9)
// ---------------------------------------------------------------------

export interface AttachmentRow {
  id: string
  organization_id: string
  entity_type: AttachmentEntityType
  entity_id: string // polymorphic ref; no FK by design
  storage_path: string
  mime: string | null
  size: number | null // bigint
  uploaded_by: string | null
  created_at: string
}

export interface AuditLogRow {
  id: number // bigint identity
  organization_id: string
  actor_id: string | null // null for trigger/system writes
  action: string // canonical entity.verb catalog (audit.md)
  entity_type: string | null
  entity_id: string | null
  before: Json | null // snapshot before change (null on create)
  after: Json | null // snapshot after change (null on delete)
  reason: string | null
  metadata: Json | null // { operation_key, source, session_id } (ADR 0014)
  created_at: string
}

// =====================================================================
// Insert / update payload types (tables the service layer writes)
// =====================================================================

/** trucks INSERT payload. */
export interface TruckInsert {
  organization_id?: string
  transport_company_id?: string | null
  plate: string
  capacity_kg?: number | null
  status?: TruckStatus
}

export type TruckUpdate = Partial<Omit<TruckInsert, "organization_id">>

/** cargo_manifests INSERT payload. */
export interface ManifestInsert {
  organization_id?: string
  facility_id: string
  code: string
  truck_id?: string | null
  driver_id?: string | null
  transport_company_id?: string | null
  shipper_party_id?: string | null
  client_party_id?: string | null
  origin?: string | null
  destination?: string | null
  expected_weight_kg?: number | null
  arrival_date?: string | null
  departure_date?: string | null
  notes?: string | null
  created_by?: string | null
}

export type ManifestUpdate = Partial<Omit<ManifestInsert, "organization_id">>

/** cargo_items INSERT payload (manifest_id is passed by the service). */
export interface CargoItemInsert {
  organization_id?: string
  line_number: number
  sku?: string | null
  description: string
  category?: string | null
  total_quantity: number
  uom?: string
  unit_weight_kg?: number | null
  unit_volume_m3?: number | null
  observations?: string | null
}

export type CargoItemUpdate = Partial<Omit<CargoItemInsert, "organization_id">>

/** item_lots INSERT payload (placement: location XOR truck). */
export interface ItemLotInsert {
  organization_id?: string
  manifest_id: string
  cargo_item_id: string
  parent_lot_id?: string | null
  quantity: number
  uom: string
  status: ItemLotStatus
  current_location_id?: string | null
  current_truck_id?: string | null
  unit_weight_kg?: number | null
  unit_volume_m3?: number | null
  created_via_movement_id?: number | null
}

export type ItemLotUpdate = Partial<
  Omit<ItemLotInsert, "organization_id" | "manifest_id" | "cargo_item_id">
>

/** movements INSERT payload (append-only spine). */
export interface MovementInsert {
  organization_id?: string
  kind: MovementKind
  facility_id?: string | null
  manifest_id?: string | null
  operator_id?: string | null
  location_id?: string | null
  occurred_at?: string
  reason?: string | null
  previous_movement_id?: number | null
  operation_key?: string | null
  payload?: Json | null
}

export interface MovementItemInsert {
  movement_id: number
  item_lot_id: string
  quantity: number
  from_location_id?: string | null
  to_location_id?: string | null
  from_truck_id?: string | null
  to_truck_id?: string | null
  notes?: string | null
}

/** scanner_operations INSERT payload. */
export interface ScannerOperationInsert {
  organization_id?: string
  movement_id: number
  item_lot_id: string
  scanned_code: string
  device_id?: string | null
  result?: ScannerResult
  payload?: Json | null
  operator_id?: string | null
}

/** scale_operations INSERT payload (within_tolerance is NOT NULL). */
export interface ScaleOperationInsert {
  organization_id?: string
  movement_id: number
  item_lot_id: string
  gross_kg?: number | null
  tare_kg?: number | null
  net_kg?: number | null
  expected_kg?: number | null
  tolerance_kg?: number | null
  within_tolerance: boolean
  device_id?: string | null
  operator_id?: string | null
}

/** quarantine_operations INSERT payload (reason is NOT NULL). */
export interface QuarantineOperationInsert {
  organization_id?: string
  movement_id: number
  item_lot_id: string
  reason: string
  status?: QuarantineStatus
  opened_by: string
  resolution_note?: string | null
}

/** seizure_operations INSERT payload. */
export interface SeizureOperationInsert {
  organization_id?: string
  movement_id: number
  item_lot_id: string
  legal_ref?: string | null
  status?: SeizureStatus
  opened_by: string
  resolution_note?: string | null
}

/** locations UPDATE payload (sparse updates; capacity changes use CapacityUpdate). */
export type LocationUpdate = Partial<
  Omit<LocationRow, "id" | "organization_id" | "created_at" | "updated_at">
>

/** Capacity edit surface (locationService.actualizarCapacidad). */
export type CapacityUpdate = Pick<
  LocationUpdate,
  "capacity_max_units" | "capacity_max_kg" | "capacity_max_volume_m3"
>