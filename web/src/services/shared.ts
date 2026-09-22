/**
 * Shared service contracts — filters and engine-style movement inputs.
 *
 * Method names on the service interfaces follow the Spanish API surface
 * requested by the product (iniciarSesion, listarManifests, ...); field
 * names here are English and map 1:1 to schema columns (snake_case) with
 * a documented suffix rule: `Id` ↔ `_id`, `At` ↔ `_at` (occurredAt →
 * occurred_at), `Desde/Hasta` are `since`/`until` ISO timestamps.
 */

import type {
  CargoManifestStatus,
  LayoutStatus,
  MovementKind,
  QuarantineStatus,
  ScannerResult,
  SeizureStatus,
  TruckStatus,
} from "@/types"
import type { Json } from "@/types"

/** Common pagination window (bounded reads, audit.md / movement-engine.md). */
export interface PaginationFiltros {
  limit?: number
  offset?: number
}

export interface TruckFiltros extends PaginationFiltros {
  estado?: TruckStatus
  companiaId?: string // transport_company_id
  buscar?: string // matches code/plate/name (ilike)
}

export interface ManifestFiltros extends PaginationFiltros {
  estado?: CargoManifestStatus
  facilidadId?: string // facility_id
  camionId?: string // truck_id
  since?: string
  until?: string
}

export interface LocationFiltros extends PaginationFiltros {
  facilidadId?: string // facility_id
  tipo?: "zone" | "bin" | "playon" | "checkpoint"
  checkpoint?: "scan" | "scale" | "control"
  activo?: boolean // locations.active (default true)
}

export interface MovementFiltros extends PaginationFiltros {
  facilidadId?: string // facility_id
  kind?: MovementKind
  manifestId?: string // manifest_id (movements_manifest_idx)
  itemLotId?: string // item_lot_id
  camionId?: string // truck_id (resolved through cargo_manifests)
  operadorId?: string // operator_id
  since?: string // occurred_at >= since
  until?: string // occurred_at < until
}

export interface ScannerOpFiltros extends PaginationFiltros {
  itemLotId?: string
  movementId?: number
  resultado?: ScannerResult
  since?: string // scanned_at >= since (reporte Scanner, fecha de captura)
  until?: string // scanned_at < until
}

export interface ScaleOpFiltros extends PaginationFiltros {
  itemLotId?: string
  movementId?: number
  dentroTolerancia?: boolean
  since?: string // weighed_at >= since (reporte Balanza, fecha de pesaje)
  until?: string // weighed_at < until
}

export interface HoldFiltros extends PaginationFiltros {
  itemLotId?: string
  movementId?: number
  abiertoPor?: string // opened_by
  since?: string
  until?: string
}

/** Quarantine filters add the rezago-specific status axis. */
export interface QuarantineHoldFiltros extends HoldFiltros {
  estado?: QuarantineStatus
}

/** Seizure filters add the secuestro-specific status axis. */
export interface SeizureHoldFiltros extends HoldFiltros {
  estado?: SeizureStatus
}

/**
 * Layout version filters (floor-plan-versioning.md). Layouts are versioned
 * per (facility_id, name): one row = one version, so reads are ordered by
 * version inside the client when grouped by name.
 */
export interface LayoutFiltros extends PaginationFiltros {
  facilidadId?: string
  nombre?: string
  estado?: LayoutStatus
}

/**
 * Audit filters (audit.md §Query design). Every predicate is applied
 * server-side (AU-48); the audit list is always paginated via the
 * `pagina` parameter of AuditService.listarAudit (bounded, AU-71).
 */
export interface AuditLogFiltros {
  actorId?: string
  action?: string // audit.md catalog code (entity.verb)
  entityType?: string
  entityId?: string
  /**
   * Camión filter (audit.md §Query design, AU-44): a truck id OR a plate.
   * A plate is resolved server-side to the truck id; the row predicate is
   * always `entity_type='truck' AND entity_id=<id>`.
   */
  truckId?: string
  /**
   * Mercadería filter (AU-45): `entity_type IN
   * (cargo_item,item_lot,cargo_manifest) AND entity_id=<id>`.
   */
  mercaderiaId?: string
  since?: string // created_at >= since
  until?: string // created_at < until
}

/**
 * Execution context for a movement-producing operation (registrarEntrada,
 * registrarSalida, split, transfer, descarga, holds). Maps to the engine
 * command contract fields (movement-engine.md §Command contract).
 */
export interface MovementExecutionInput {
  operatorId?: string | null // movements.operator_id
  ocurridoEn?: string // movements.occurred_at (defaults to now())
  operationKey?: string | null // idempotency key, unique per org (ADR 0010)
  motivo?: string | null // movements.reason (required for sensitive kinds)
}

/** Per-lot detail of a movement (movement_items row). */
export interface MovementItemInput {
  itemLotId: string
  cantidad: number
  origenLocationId?: string | null
  destinoLocationId?: string | null
  origenTruckId?: string | null
  destinoTruckId?: string | null
  notas?: string | null
}

/** Engine-style create: one movement + its per-lot items. */
export interface CreateMovementInput extends MovementExecutionInput {
  kind: MovementKind
  manifestId?: string | null
  facilityId?: string | null
  locationId?: string | null
  previousMovementId?: number | null
  payload?: Json | null
  items?: MovementItemInput[]
}