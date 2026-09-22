/**
 * Domain enums — Cargo Control frontend.
 *
 * Every union below is derived EXACTLY from the CHECK constraints in
 * supabase/migrations/0001_schema.sql (source of truth) and the RBAC seed
 * in 0002_rbac_seed.sql. Do not add or remove values on the client side:
 * the database is the authority; these types only mirror it for type-safe
 * UX code.
 */

/** organizations.status */
export type OrganizationStatus = "active" | "suspended" | "archived"

/** facilities.type */
export type FacilityType = "warehouse" | "site" | "plant"

/** facilities.status */
export type FacilityStatus = "active" | "inactive"

/** locations.type */
export type LocationType = "zone" | "bin" | "playon" | "checkpoint"

/** locations.checkpoint_kind (only when type = 'checkpoint', see CHECK constraint) */
export type CheckpointKind = "scan" | "scale" | "control"

/** locations.physical_unit */
export type PhysicalUnit = "m" | "cm" | "ft"

/** layouts.status */
export type LayoutStatus = "draft" | "published" | "archived"

/** layout_elements.element_type (ADR 0005 editor taxonomy) */
export type LayoutElementType =
  | "playon"
  | "warehouse"
  | "storage"
  | "scanner"
  | "scale"
  | "quarantine"
  | "seizure"
  | "corridor"
  | "door"
  | "other"

/** users.status */
export type UserStatus = "active" | "disabled"

/** roles.code — the 7-role RBAC catalog (0002_rbac_seed.sql, rbac.md §1) */
export type RoleCode =
  | "admin"
  | "supervisor"
  | "operator"
  | "scanner_operator"
  | "scale_operator"
  | "auditor"
  | "viewer"

/** permissions.code — the 20-code permission catalog (0002_rbac_seed.sql, rbac.md §2) */
export type PermissionCode =
  | "truck.read"
  | "truck.create"
  | "truck.update"
  | "truck.exit"
  | "cargo.read"
  | "cargo.create"
  | "cargo.update"
  | "cargo.transfer"
  | "warehouse.read"
  | "warehouse.configure"
  | "warehouse.transfer"
  | "scanner.read"
  | "scanner.create"
  | "scale.read"
  | "scale.create"
  | "quarantine.read"
  | "quarantine.create"
  | "seizure.read"
  | "seizure.create"
  | "audit.read"

/** transport_companies.status / drivers.status / parties.status */
export type RegistryStatus = "active" | "disabled"

/**
 * trucks.status — fleet BASE status only (5 codes, ADR 0008). The 13
 * display states (ARRIVED, WAITING, IN_PROCESS...) are derived read-side
 * and are never stored (states.md §truck_status display map).
 */
export type TruckStatus =
  | "available"
  | "in_playon"
  | "in_route"
  | "out_of_service"
  | "inspection"

/** parties.type */
export type PartyType = "shipper" | "client"

/**
 * cargo_manifests.status — ROLLUP of item/lot states (flows.md). The
 * client never sets it directly in production paths; the movement engine
 * owns the transitions.
 */
export type CargoManifestStatus =
  | "received"
  | "in_playon"
  | "in_control"
  | "discharging"
  | "discharged"
  | "distributed"
  | "closed"

/** cargo_items.status */
export type CargoItemStatus =
  | "pending"
  | "on_truck"
  | "discharged"
  | "distributed"
  | "closed"

/** item_lots.status (states.md §item_lot_status) */
export type ItemLotStatus =
  | "on_truck"
  | "discharged"
  | "checked"
  | "in_warehouse"
  | "in_quarantine"
  | "seized"
  | "released"
  | "loaded_out"

/**
 * movements.kind — the 15 movement kinds of the append-only spine
 * (0001_schema.sql CHECK; movement-engine.md §Type map; ADR 0010).
 */
export type MovementKind =
  | "arrival"
  | "discharge"
  | "split"
  | "transfer"
  | "scan_in"
  | "scan_out"
  | "scale"
  | "store"
  | "load_out"
  | "quarantine"
  | "seizure"
  | "release"
  | "egress"
  | "correction"
  | "return_to_truck"

/** scanner_operations.result — every capture persists a row, even non-success (ADR 0011) */
export type ScannerResult = "success" | "not_found" | "ambiguous" | "error"

/** quarantine_operations.status (rezago) */
export type QuarantineStatus = "open" | "resolved" | "released"

/** seizure_operations.status (secuestro) */
export type SeizureStatus = "open" | "resolved"

/**
 * attachments.entity_type — polymorphic target (no FK by design,
 * database.md §4.5); target existence is validated by the service layer
 * and RLS.
 */
export type AttachmentEntityType =
  | "cargo_manifest"
  | "cargo_item"
  | "item_lot"
  | "quarantine_operation"
  | "seizure_operation"
  | "movement"