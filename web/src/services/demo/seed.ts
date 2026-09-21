// DEMO ONLY — dev data, never production.
//
// In-memory seed for the DEMO data adapter. Everything here is fabricated
// (fake org, facility, plates, people, barcodes, legal refs). The store is
// rebuilt fresh on every createDemoServices() call, so the demo always
// starts from a coherent, deterministic state instead of whatever the last
// playground session left behind. The only "legal" strings are shaped like
// real ones so the UI exercises the same validation paths.
//
// Story (kept deliberately simple and internally consistent):
//   manifest-1 (18/09, truck DEMO-02-BB) — in_playon, partially discharged:
//     lot-1-1 still loaded on the truck (on_truck)
//     lot-1-2 under OPEN quarantine at REZAGO (suspected damage)
//     lot-1-3 discharged and placed at SCANNER-1 PENDING its scan → appears
//           in the station queue (no scanner_operation row exists yet)
//   manifest-2 (19/09, truck DEMO-03-CC) — in_playon, cargo under OPEN
//     judicial seizure at SECUESTRO (legal_ref EXP-JUD-2026-0112)
//
// Approximations (documented): cargo_items.status is a SERVER rollup; the
// seeded values are approximate on purpose (e.g. item-1-2 'discharged' with
// a quarantined lot, item-2-1 'on_truck' with a seized lot).

import type {
  AuditLogRow,
  CargoItemRow,
  CargoManifestRow,
  DriverRow,
  FacilityRow,
  ItemLotRow,
  LocationRow,
  MovementItemRow,
  MovementRow,
  OrganizationRow,
  PartyRow,
  PermissionCode,
  QuarantineOperationRow,
  RoleCode,
  ScaleOperationRow,
  ScannerOperationRow,
  SeizureOperationRow,
  TransportCompanyRow,
  TruckRow,
  UserRow,
} from "@/types"

export const DEMO_ORG_ID = "org-demo"
export const DEMO_FACILITY_ID = "fac-demo"

/** Dev-only credentials shown in the demo login screen. */
export const DEMO_EMAIL = "demo@cargocontrol.local"
export const DEMO_PASSWORD = "demo1234"

/**
 * Role → permission matrix (mirror of 0002_rbac_seed.sql / rbac.md §2).
 * The demo adapters enforce it in-memory to replicate the RLS UX behavior;
 * production authorization is ONLY the database (has_permission).
 */
export const ROLE_PERMISSIONS: Record<RoleCode, readonly PermissionCode[]> = {
  admin: [
    "truck.read",
    "truck.create",
    "truck.update",
    "truck.exit",
    "cargo.read",
    "cargo.create",
    "cargo.update",
    "cargo.transfer",
    "warehouse.read",
    "warehouse.configure",
    "warehouse.transfer",
    "scanner.read",
    "scanner.create",
    "scale.read",
    "scale.create",
    "quarantine.read",
    "quarantine.create",
    "seizure.read",
    "seizure.create",
    "audit.read",
  ],
  supervisor: [
    "truck.read",
    "truck.create",
    "truck.update",
    "truck.exit",
    "cargo.read",
    "cargo.create",
    "cargo.update",
    "cargo.transfer",
    "warehouse.read",
    "warehouse.configure",
    "warehouse.transfer",
    "scanner.read",
    "scanner.create",
    "scale.read",
    "scale.create",
    "quarantine.read",
    "quarantine.create",
    "seizure.read",
    "seizure.create",
  ],
  operator: [
    "truck.read",
    "truck.create",
    "truck.update",
    "cargo.read",
    "cargo.create",
    "cargo.update",
    "cargo.transfer",
    "warehouse.read",
    "warehouse.transfer",
    "scanner.read",
    "scale.read",
    "quarantine.read",
    "seizure.read",
  ],
  scanner_operator: ["truck.read", "cargo.read", "warehouse.read", "scanner.read", "scanner.create"],
  scale_operator: ["truck.read", "cargo.read", "warehouse.read", "scale.read", "scale.create"],
  auditor: [
    "truck.read",
    "cargo.read",
    "warehouse.read",
    "scanner.read",
    "scale.read",
    "quarantine.read",
    "seizure.read",
    "audit.read",
  ],
  viewer: [
    "truck.read",
    "cargo.read",
    "warehouse.read",
    "scanner.read",
    "scale.read",
    "quarantine.read",
    "seizure.read",
  ],
}

export function hasPermission(role: RoleCode, permission: PermissionCode): boolean {
  return ROLE_PERMISSIONS[role].includes(permission)
}

/** One coherent, deterministically-built snapshot of the demo domain. */
export interface DemoState {
  organization: OrganizationRow
  facility: FacilityRow
  locations: LocationRow[]
  trucks: TruckRow[]
  companies: TransportCompanyRow[]
  drivers: DriverRow[]
  parties: PartyRow[]
  users: UserRow[]
  /** Active demo session role — the adapters enforce it like RLS would. */
  role: RoleCode
  manifests: CargoManifestRow[]
  items: CargoItemRow[]
  lots: ItemLotRow[]
  movements: MovementRow[]
  movementItems: MovementItemRow[]
  scannerOps: ScannerOperationRow[]
  scaleOps: ScaleOperationRow[]
  quarantineOps: QuarantineOperationRow[]
  seizureOps: SeizureOperationRow[]
  auditLog: AuditLogRow[]
  /** Monotonic counters for ids the demo creates at runtime. */
  nextMovementId: number
  nextMovementItemId: number
  nextOpId: number
}

const CREATED_AT = "2026-09-18T06:00:00.000Z"

export function createDemoState(): DemoState {
  const org: OrganizationRow = {
    id: DEMO_ORG_ID,
    name: "Cargo Control Demo",
    status: "active",
    created_at: CREATED_AT,
    updated_at: CREATED_AT,
  }

  const facility: FacilityRow = {
    id: DEMO_FACILITY_ID,
    organization_id: DEMO_ORG_ID,
    code: "CDC-DEMO",
    name: "Centro de Distribución Demo",
    type: "warehouse",
    address: "Av. Demo 1234",
    status: "active",
    created_at: CREATED_AT,
    updated_at: CREATED_AT,
  }

  const location = (
    id: string,
    code: string,
    type: LocationRow["type"],
    overrides: Partial<LocationRow> = {},
  ): LocationRow => ({
    id,
    organization_id: DEMO_ORG_ID,
    facility_id: DEMO_FACILITY_ID,
    parent_id: null,
    type,
    checkpoint_kind: type === "checkpoint" ? (overrides.checkpoint_kind ?? "control") : null,
    code,
    name: code,
    physical_width: null,
    physical_height: null,
    physical_depth: null,
    physical_unit: "m",
    capacity_max_units: null,
    capacity_max_kg: null,
    capacity_max_volume_m3: null,
    allows_hold: false,
    requires_authorization: false,
    notes: null,
    active: true,
    maintenance: false,
    created_at: CREATED_AT,
    updated_at: CREATED_AT,
    ...overrides,
  })

  const locations: LocationRow[] = [
    location("loc-playon", "PLAYON-1", "playon", {
      capacity_max_units: 3000,
      capacity_max_kg: 90000,
      capacity_max_volume_m3: 450,
    }),
    location("loc-galpon", "GALPON", "playon", { capacity_max_units: 20000 }),
    ...Array.from({ length: 12 }, (_, i) => {
      const n = String(i + 1).padStart(2, "0")
      return location(`loc-sector-${n}`, `SECTOR-${n}`, "zone", { capacity_max_units: 1000 })
    }),
    location("loc-scanner", "SCANNER-1", "checkpoint", { checkpoint_kind: "scan" }),
    location("loc-balanza", "BALANZA-1", "checkpoint", { checkpoint_kind: "scale" }),
    location("loc-rezago", "REZAGO", "zone", { allows_hold: true }),
    location("loc-secuestro", "SECUESTRO", "zone", { allows_hold: true }),
  ]

  const company: TransportCompanyRow = {
    id: "company-1",
    organization_id: DEMO_ORG_ID,
    name: "Transportes Demo S.A.",
    tax_id: "30-71234567-8",
    contacts: null,
    status: "active",
    created_at: CREATED_AT,
    updated_at: CREATED_AT,
  }

  const drivers: DriverRow[] = [
    {
      id: "driver-1",
      organization_id: DEMO_ORG_ID,
      transport_company_id: "company-1",
      full_name: "Carlos Ramírez",
      document_id: "28555111",
      license_no: "B-0112233",
      phone: "+54 9 11 5555-0101",
      status: "active",
      created_at: CREATED_AT,
      updated_at: CREATED_AT,
    },
    {
      id: "driver-2",
      organization_id: DEMO_ORG_ID,
      transport_company_id: "company-1",
      full_name: "María Fernández",
      document_id: "30123456",
      license_no: "C-0998877",
      phone: "+54 9 11 5555-0102",
      status: "active",
      created_at: CREATED_AT,
      updated_at: CREATED_AT,
    },
  ]

  const parties: PartyRow[] = [
    {
      id: "party-shipper-1",
      organization_id: DEMO_ORG_ID,
      type: "shipper",
      name: "Industrias del Sur",
      tax_id: "30-70123456-1",
      contacts: null,
      status: "active",
      created_at: CREATED_AT,
      updated_at: CREATED_AT,
    },
    {
      id: "party-client-1",
      organization_id: DEMO_ORG_ID,
      type: "client",
      name: "Comercial Norte SRL",
      tax_id: "30-70987654-3",
      contacts: null,
      status: "active",
      created_at: CREATED_AT,
      updated_at: CREATED_AT,
    },
  ]

  const users: UserRow[] = [
    {
      id: "user-demo",
      organization_id: DEMO_ORG_ID,
      auth_user_id: "auth-demo",
      email: DEMO_EMAIL,
      full_name: "Demo User",
      status: "active",
      created_at: CREATED_AT,
      updated_at: CREATED_AT,
    },
    {
      id: "user-operator",
      organization_id: DEMO_ORG_ID,
      auth_user_id: "auth-operator",
      email: "operador@cargocontrol.local",
      full_name: "Operador Demo",
      status: "active",
      created_at: CREATED_AT,
      updated_at: CREATED_AT,
    },
  ]

  const trucks: TruckRow[] = [
    {
      id: "truck-1",
      organization_id: DEMO_ORG_ID,
      transport_company_id: "company-1",
      plate: "DEMO-01-AA",
      capacity_kg: 24000,
      status: "available",
      created_at: CREATED_AT,
      updated_at: CREATED_AT,
    },
    {
      id: "truck-2",
      organization_id: DEMO_ORG_ID,
      transport_company_id: "company-1",
      plate: "DEMO-02-BB",
      capacity_kg: 36000,
      status: "in_playon",
      created_at: CREATED_AT,
      updated_at: CREATED_AT,
    },
    {
      id: "truck-3",
      organization_id: DEMO_ORG_ID,
      transport_company_id: "company-1",
      plate: "DEMO-03-CC",
      capacity_kg: 18000,
      status: "in_playon",
      created_at: CREATED_AT,
      updated_at: CREATED_AT,
    },
  ]

  const manifests: CargoManifestRow[] = [
    {
      id: "manifest-1",
      organization_id: DEMO_ORG_ID,
      facility_id: DEMO_FACILITY_ID,
      code: "MANIF-2026-0918-A",
      truck_id: "truck-2",
      driver_id: "driver-1",
      transport_company_id: "company-1",
      shipper_party_id: "party-shipper-1",
      client_party_id: "party-client-1",
      origin: "Avellaneda, Buenos Aires",
      destination: "Rosario, Santa Fe",
      expected_weight_kg: 12400,
      arrival_date: "2026-09-18",
      departure_date: null,
      status: "in_playon",
      notes: "Manifiesto de prueba: descarga parcial, rezago abierto, lote en scanner.",
      created_by: "user-demo",
      created_at: CREATED_AT,
      updated_at: "2026-09-18T10:05:00.000Z",
    },
    {
      id: "manifest-2",
      organization_id: DEMO_ORG_ID,
      facility_id: DEMO_FACILITY_ID,
      code: "MANIF-2026-0919-B",
      truck_id: "truck-3",
      driver_id: "driver-2",
      transport_company_id: "company-1",
      shipper_party_id: "party-shipper-1",
      client_party_id: "party-client-1",
      origin: "Córdoba",
      destination: "Buenos Aires",
      expected_weight_kg: 8600,
      arrival_date: "2026-09-19",
      departure_date: null,
      status: "in_playon",
      notes: "Ingreso con secuestro judicial sobre la carga.",
      created_by: "user-demo",
      created_at: "2026-09-19T06:00:00.000Z",
      updated_at: "2026-09-19T07:45:00.000Z",
    },
  ]

  const items: CargoItemRow[] = [
    {
      id: "item-1-1",
      organization_id: DEMO_ORG_ID,
      manifest_id: "manifest-1",
      line_number: 1,
      sku: "REP-1001",
      description: "Repuestos línea industrial A",
      category: "Repuestos",
      total_quantity: 100,
      uom: "unit",
      unit_weight_kg: 2.5,
      unit_volume_m3: 0.008,
      status: "on_truck",
      observations: null,
      created_at: CREATED_AT,
      updated_at: CREATED_AT,
    },
    {
      id: "item-1-2",
      organization_id: DEMO_ORG_ID,
      manifest_id: "manifest-1",
      line_number: 2,
      sku: "REP-2002",
      description: "Repuestos línea industrial B",
      category: "Repuestos",
      total_quantity: 50,
      uom: "unit",
      unit_weight_kg: 18,
      unit_volume_m3: 0.06,
      status: "discharged",
      observations: "Embalaje con daños detectados en recepción.",
      created_at: CREATED_AT,
      updated_at: "2026-09-18T09:40:00.000Z",
    },
    {
      id: "item-1-3",
      organization_id: DEMO_ORG_ID,
      manifest_id: "manifest-1",
      line_number: 3,
      sku: "TAPA-0001",
      description: "Tapas plásticas 20mm",
      category: "Insumos",
      total_quantity: 30,
      uom: "unit",
      unit_weight_kg: 0.4,
      unit_volume_m3: 0.002,
      status: "discharged",
      observations: null,
      created_at: CREATED_AT,
      updated_at: "2026-09-18T09:40:00.000Z",
    },
    {
      id: "item-2-1",
      organization_id: DEMO_ORG_ID,
      manifest_id: "manifest-2",
      line_number: 1,
      sku: "FERR-0010",
      description: "Ferretería surtida",
      category: "Ferretería",
      total_quantity: 200,
      uom: "unit",
      unit_weight_kg: 1.2,
      unit_volume_m3: 0.005,
      status: "on_truck",
      observations: null,
      created_at: "2026-09-19T06:00:00.000Z",
      updated_at: "2026-09-19T07:30:00.000Z",
    },
  ]

  const lots: ItemLotRow[] = [
    {
      id: "lot-1-1",
      organization_id: DEMO_ORG_ID,
      manifest_id: "manifest-1",
      cargo_item_id: "item-1-1",
      parent_lot_id: null,
      quantity: 100,
      uom: "unit",
      status: "on_truck",
      current_location_id: null,
      current_truck_id: "truck-2",
      unit_weight_kg: 2.5,
      unit_volume_m3: 0.008,
      created_via_movement_id: null,
      created_at: CREATED_AT,
      updated_at: CREATED_AT,
    },
    {
      id: "lot-1-2",
      organization_id: DEMO_ORG_ID,
      manifest_id: "manifest-1",
      cargo_item_id: "item-1-2",
      parent_lot_id: null,
      quantity: 50,
      uom: "unit",
      status: "in_quarantine",
      current_location_id: "loc-rezago",
      current_truck_id: null,
      unit_weight_kg: 18,
      unit_volume_m3: 0.06,
      created_via_movement_id: 2,
      created_at: CREATED_AT,
      updated_at: "2026-09-18T10:05:00.000Z",
    },
    {
      id: "lot-1-3",
      organization_id: DEMO_ORG_ID,
      manifest_id: "manifest-1",
      cargo_item_id: "item-1-3",
      parent_lot_id: null,
      quantity: 30,
      uom: "unit",
      status: "discharged",
      current_location_id: "loc-scanner",
      current_truck_id: null,
      unit_weight_kg: 0.4,
      unit_volume_m3: 0.002,
      created_via_movement_id: 2,
      created_at: CREATED_AT,
      updated_at: "2026-09-18T09:50:00.000Z",
    },
    {
      id: "lot-2-1",
      organization_id: DEMO_ORG_ID,
      manifest_id: "manifest-2",
      cargo_item_id: "item-2-1",
      parent_lot_id: null,
      quantity: 200,
      uom: "unit",
      status: "seized",
      current_location_id: "loc-secuestro",
      current_truck_id: null,
      unit_weight_kg: 1.2,
      unit_volume_m3: 0.005,
      created_via_movement_id: 5,
      created_at: "2026-09-19T06:00:00.000Z",
      updated_at: "2026-09-19T07:45:00.000Z",
    },
  ]

  const movements: MovementRow[] = [
    {
      id: 1,
      organization_id: DEMO_ORG_ID,
      facility_id: DEMO_FACILITY_ID,
      kind: "arrival",
      manifest_id: "manifest-1",
      operator_id: "user-demo",
      location_id: "loc-playon",
      occurred_at: "2026-09-18T08:15:00.000Z",
      created_at: "2026-09-18T08:15:00.000Z",
      reason: null,
      previous_movement_id: null,
      operation_key: "demo-arr-1",
      payload: null,
    },
    {
      id: 2,
      organization_id: DEMO_ORG_ID,
      facility_id: DEMO_FACILITY_ID,
      kind: "discharge",
      manifest_id: "manifest-1",
      operator_id: "user-demo",
      location_id: "loc-playon",
      occurred_at: "2026-09-18T09:40:00.000Z",
      created_at: "2026-09-18T09:40:00.000Z",
      reason: null,
      previous_movement_id: null,
      operation_key: "demo-disch-1",
      payload: null,
    },
    {
      id: 3,
      organization_id: DEMO_ORG_ID,
      facility_id: DEMO_FACILITY_ID,
      kind: "quarantine",
      manifest_id: "manifest-1",
      operator_id: "user-demo",
      location_id: "loc-rezago",
      occurred_at: "2026-09-18T10:05:00.000Z",
      created_at: "2026-09-18T10:05:00.000Z",
      reason: "Sospecha de daño en embalaje",
      previous_movement_id: null,
      operation_key: "demo-qu-1",
      payload: null,
    },
    {
      id: 4,
      organization_id: DEMO_ORG_ID,
      facility_id: DEMO_FACILITY_ID,
      kind: "arrival",
      manifest_id: "manifest-2",
      operator_id: "user-demo",
      location_id: "loc-playon",
      occurred_at: "2026-09-19T07:30:00.000Z",
      created_at: "2026-09-19T07:30:00.000Z",
      reason: null,
      previous_movement_id: null,
      operation_key: "demo-arr-2",
      payload: null,
    },
    {
      id: 5,
      organization_id: DEMO_ORG_ID,
      facility_id: DEMO_FACILITY_ID,
      kind: "seizure",
      manifest_id: "manifest-2",
      operator_id: "user-demo",
      location_id: "loc-secuestro",
      occurred_at: "2026-09-19T07:45:00.000Z",
      created_at: "2026-09-19T07:45:00.000Z",
      reason: "Medida cautelar judicial",
      previous_movement_id: null,
      operation_key: "demo-se-1",
      payload: null,
    },
  ]

  const movementItems: MovementItemRow[] = [
    {
      id: 1,
      movement_id: 2,
      item_lot_id: "lot-1-2",
      quantity: 50,
      from_location_id: null,
      to_location_id: "loc-playon",
      from_truck_id: "truck-2",
      to_truck_id: null,
      notes: null,
    },
    {
      id: 2,
      movement_id: 2,
      item_lot_id: "lot-1-3",
      quantity: 30,
      from_location_id: null,
      to_location_id: "loc-playon",
      from_truck_id: "truck-2",
      to_truck_id: null,
      notes: null,
    },
    {
      id: 3,
      movement_id: 3,
      item_lot_id: "lot-1-2",
      quantity: 50,
      from_location_id: "loc-playon",
      to_location_id: "loc-rezago",
      from_truck_id: null,
      to_truck_id: null,
      notes: "Embalaje dañado — retenido en rezago",
    },
    {
      id: 4,
      movement_id: 5,
      item_lot_id: "lot-2-1",
      quantity: 200,
      from_location_id: null,
      to_location_id: "loc-secuestro",
      from_truck_id: "truck-3",
      to_truck_id: null,
      notes: "Cautelar EXP-JUD-2026-0112",
    },
  ]

  const quarantineOps: QuarantineOperationRow[] = [
    {
      id: "qu-1",
      organization_id: DEMO_ORG_ID,
      movement_id: 3,
      item_lot_id: "lot-1-2",
      reason: "Sospecha de daño en embalaje",
      status: "open",
      opened_by: "user-demo",
      opened_at: "2026-09-18T10:05:00.000Z",
      resolved_by: null,
      resolved_at: null,
      resolution_note: null,
    },
  ]

  const seizureOps: SeizureOperationRow[] = [
    {
      id: "se-1",
      organization_id: DEMO_ORG_ID,
      movement_id: 5,
      item_lot_id: "lot-2-1",
      legal_ref: "EXP-JUD-2026-0112",
      status: "open",
      opened_by: "user-demo",
      opened_at: "2026-09-19T07:45:00.000Z",
      resolved_by: null,
      resolved_at: null,
      resolution_note: null,
    },
  ]

  const auditLog: AuditLogRow[] = [
    {
      id: 1,
      organization_id: DEMO_ORG_ID,
      actor_id: "user-demo",
      action: "truck.arrival",
      entity_type: "cargo_manifest",
      entity_id: "manifest-1",
      before: null,
      after: { status: "in_playon" },
      reason: null,
      metadata: null,
      created_at: "2026-09-18T08:15:00.000Z",
    },
    {
      id: 2,
      organization_id: DEMO_ORG_ID,
      actor_id: "user-demo",
      action: "cargo.discharge",
      entity_type: "cargo_manifest",
      entity_id: "manifest-1",
      before: null,
      after: { status: "discharging" },
      reason: null,
      metadata: null,
      created_at: "2026-09-18T09:40:00.000Z",
    },
    {
      id: 3,
      organization_id: DEMO_ORG_ID,
      actor_id: "user-demo",
      action: "quarantine.create",
      entity_type: "item_lot",
      entity_id: "lot-1-2",
      before: null,
      after: { status: "in_quarantine" },
      reason: "Sospecha de daño en embalaje",
      metadata: null,
      created_at: "2026-09-18T10:05:00.000Z",
    },
    {
      id: 4,
      organization_id: DEMO_ORG_ID,
      actor_id: "user-demo",
      action: "truck.arrival",
      entity_type: "cargo_manifest",
      entity_id: "manifest-2",
      before: null,
      after: { status: "in_playon" },
      reason: null,
      metadata: null,
      created_at: "2026-09-19T07:30:00.000Z",
    },
    {
      id: 5,
      organization_id: DEMO_ORG_ID,
      actor_id: "user-demo",
      action: "seizure.create",
      entity_type: "item_lot",
      entity_id: "lot-2-1",
      before: null,
      after: { status: "seized" },
      reason: "Medida cautelar judicial",
      metadata: null,
      created_at: "2026-09-19T07:45:00.000Z",
    },
  ]

  return {
    organization: org,
    facility,
    locations,
    trucks,
    companies: [company],
    drivers,
    parties,
    users,
    role: "admin",
    manifests,
    items,
    lots,
    movements,
    movementItems,
    scannerOps: [],
    scaleOps: [],
    quarantineOps,
    seizureOps,
    auditLog,
    nextMovementId: 6,
    nextMovementItemId: 5,
    nextOpId: 1,
  }
}