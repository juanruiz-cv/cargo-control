/**
 * Column lists for every table the service layer queries.
 *
 * Each constant mirrors the exact columns of its table in
 * supabase/migrations/0001_schema.sql. Keeping explicit lists (instead of
 * `select('*')`) pins the read contract: RLS remains the only filter, and
 * a schema rename fails loudly at the query site instead of silently
 * reshaping payloads.
 */

export const TRUCK_COLUMNS =
  "id, organization_id, transport_company_id, plate, capacity_kg, status, created_at, updated_at"

export const TRANSPORT_COMPANY_COLUMNS =
  "id, organization_id, name, tax_id, contacts, status, created_at, updated_at"

export const MANIFEST_COLUMNS =
  "id, organization_id, facility_id, code, truck_id, driver_id, transport_company_id, shipper_party_id, client_party_id, origin, destination, expected_weight_kg, arrival_date, departure_date, status, notes, created_by, created_at, updated_at"

export const CARGO_ITEM_COLUMNS =
  "id, organization_id, manifest_id, line_number, sku, description, category, total_quantity, uom, unit_weight_kg, unit_volume_m3, status, observations, created_at, updated_at"

export const ITEM_LOT_COLUMNS =
  "id, organization_id, manifest_id, cargo_item_id, parent_lot_id, quantity, uom, status, current_location_id, current_truck_id, unit_weight_kg, unit_volume_m3, created_via_movement_id, created_at, updated_at"

export const LOCATION_COLUMNS =
  "id, organization_id, facility_id, parent_id, type, checkpoint_kind, code, name, physical_width, physical_height, physical_depth, physical_unit, capacity_max_units, capacity_max_kg, capacity_max_volume_m3, allows_hold, requires_authorization, notes, active, maintenance, created_at, updated_at"

export const MOVEMENT_COLUMNS =
  "id, organization_id, facility_id, kind, manifest_id, operator_id, location_id, occurred_at, created_at, reason, previous_movement_id, operation_key, payload"

export const MOVEMENT_ITEM_COLUMNS =
  "id, movement_id, item_lot_id, quantity, from_location_id, to_location_id, from_truck_id, to_truck_id, notes"

export const SCANNER_OP_COLUMNS =
  "id, organization_id, movement_id, item_lot_id, scanned_code, device_id, result, payload, scanned_at, operator_id"

export const SCALE_OP_COLUMNS =
  "id, organization_id, movement_id, item_lot_id, gross_kg, tare_kg, net_kg, expected_kg, tolerance_kg, within_tolerance, device_id, weighed_at, operator_id"

export const QUARANTINE_OP_COLUMNS =
  "id, organization_id, movement_id, item_lot_id, reason, status, opened_by, opened_at, resolved_by, resolved_at, resolution_note"

export const SEIZURE_OP_COLUMNS =
  "id, organization_id, movement_id, item_lot_id, legal_ref, status, opened_by, opened_at, resolved_by, resolved_at, resolution_note"

export const USER_COLUMNS =
  "id, organization_id, auth_user_id, email, full_name, status, created_at, updated_at"

export const AUDIT_LOG_COLUMNS =
  "id, organization_id, actor_id, action, entity_type, entity_id, before, after, reason, metadata, created_at"

export const LOCATION_OCCUPANCY_COLUMNS =
  "location_id, organization_id, facility_id, code, occupancy_kg, occupancy_m3, occupancy_units, missing_weight_lots, missing_volume_lots, capacity_max_kg, capacity_max_volume_m3, capacity_max_units, available_kg, available_m3, available_units, pct_kg, pct_m3, pct_units"

export const DASHBOARD_METRICS_COLUMNS =
  "organization_id, trucks_in_yard, trucks_waiting, trucks_discharging, merchandise_stored, merchandise_stored_weight_kg, merchandise_in_scanner, merchandise_in_scale, merchandise_in_quarantine, merchandise_seized, sectors_occupied, sectors_free"

export const STATION_QUEUE_COLUMNS =
  "queue_kind, item_lot_id, organization_id, manifest_id, cargo_item_id, lot_status, quantity, uom, checkpoint_location_id, checkpoint_code, sku, item_description, manifest_code, truck_id, created_at"

export const HOLD_OPEN_COLUMNS =
  "hold_type, operation_id, organization_id, item_lot_id, status, reason, legal_ref, opened_by, opened_at, resolution_note, manifest_id, cargo_item_id, current_location_id, current_truck_id, lot_status, quantity, uom, sku, item_description, manifest_code"

export const LAYOUT_COLUMNS =
  "id, organization_id, facility_id, name, version, status, created_by, description, changes, scale, background, created_at, updated_at"

export const LAYOUT_ELEMENT_COLUMNS =
  "id, layout_id, location_id, element_type, code, name, description, x, y, visual_width, visual_height, rotation, color, icon, z_index, label, is_locked, is_visible, created_at, updated_at"