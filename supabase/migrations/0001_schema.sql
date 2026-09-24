-- =====================================================================
-- Cargo Control — 0001_schema.sql
-- =====================================================================
-- Base schema: 25 business tables + constraints + indexes.
-- Source of truth: docs/architecture/database.md (§4 DDL outline, §5 index
-- summary, §7 rename map), docs/domain/entities.md (entity contract),
-- docs/domain/capacity-occupancy.md (capacity columns / view formulas).
--
-- Conventions applied (database.md §3):
--   * PKs: uuid gen_random_uuid() for business entities; bigint GENERATED
--     ALWAYS AS IDENTITY for append-only spines (movements, movement_items,
--     audit_log).
--   * Tenancy: every business table carries organization_id.
--   * Enums: text + CHECK constraints (Supabase-friendly; no PG enum types).
--   * Soft lifecycle: no DELETE paths documented -> no tombstone columns.
--   * No extension creation: gen_random_uuid() is core PostgreSQL since 13
--     (Supabase runs PG 15+); no citext/pgcrypto are referenced anywhere in
--     the documentation.
--
-- Rename map (docs/architecture/database.md §7 + ADR 0007) — Fase 0-2 names
-- are NOT used; the Fase 3 names below are the contract:
--   orgs/org                -> organizations
--   warehouse_locations     -> locations (under facility_id; visual fields removed)
--   (new)                   -> facilities, layouts, layout_elements
--   operators               -> users (+ roles/user_roles/permissions/role_permissions)
--   parties type=carrier    -> transport_companies
--   parties (shipper/client)-> parties with type restricted to 'shipper'|'client'
--   cargo                   -> cargo_manifests (+ facility_id)
--   checkpoint_events       -> movements + movement_items (per-lot normalization)
--   scale_readings          -> scale_operations
--   quarantine_cases        -> quarantine_operations
--   seizure_records         -> seizure_operations
--   documents               -> attachments
--   layout_elements.kind    -> element_type; width/height -> visual_width/height
--   (guards, not tables)    -> guard role split into scanner_operator + scale_operator
-- =====================================================================

-- ---------------------------------------------------------------------
-- 4.1 Tenancy
-- ---------------------------------------------------------------------

create table public.organizations (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  status     text not null default 'active'
             check (status in ('active','suspended','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.facilities (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  code            text not null,          -- human-readable, unique per org
  name            text not null,
  type            text not null default 'warehouse'
                  check (type in ('warehouse','site','plant')), -- multi-warehouse path
  address         text,
  status          text not null default 'active'
                  check (status in ('active','inactive')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, code)
);
create index facilities_org_idx on public.facilities (organization_id);

-- ---------------------------------------------------------------------
-- 4.2 Physical locations (operational truth — ADR 0004)
-- ---------------------------------------------------------------------

create table public.locations (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references public.organizations(id),
  facility_id          uuid not null references public.facilities(id),
  parent_id            uuid references public.locations(id),   -- zone -> bin tree
  type                 text not null
                       check (type in ('zone','bin','playon','checkpoint')),
  checkpoint_kind      text check (checkpoint_kind in ('scan','scale','control')),
  code                 text not null,           -- unique per facility
  name                 text,
  -- physical (real-world) dimensions; DISJOINT from visual px (ADR 0005)
  physical_width       numeric check (physical_width  is null or physical_width  > 0),
  physical_height      numeric check (physical_height is null or physical_height > 0),
  physical_depth       numeric check (physical_depth  is null or physical_depth  > 0),
  physical_unit        text not null default 'm'
                       check (physical_unit in ('m','cm','ft')),
  -- capacity (advisory maxima; occupancy is derived from item_lots, D7)
  capacity_max_units       numeric check (capacity_max_units is null or capacity_max_units >= 0),
  capacity_max_kg          numeric check (capacity_max_kg    is null or capacity_max_kg    >= 0),
  capacity_max_volume_m3   numeric check (capacity_max_volume_m3 is null or capacity_max_volume_m3 >= 0),
  allows_hold          boolean not null default false,  -- rezago/secuestro staging
  requires_authorization boolean not null default false,
  notes                text,
  active               boolean not null default true,
  maintenance          boolean not null default false,  -- Fase 11 (ADR 0012):
                         -- MANTENIMIENTO visual state (admin-set)
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (facility_id, code),
  constraint checkpoint_kind_requires_checkpoint check (
    (type = 'checkpoint') = (checkpoint_kind is not null)
  )
);
create index locations_facility_idx on public.locations (facility_id);
create index locations_parent_idx   on public.locations (parent_id);

-- NOTE (D7): occupancy and inventory are NOT columns. They are derived from
-- item_lots (Σ quantities per current_location_id), guaranteed consistent by
-- the ADR 0003 balance trigger (0006_triggers.sql). The location_occupancy
-- view lives in 0005_views.sql.

-- ---------------------------------------------------------------------
-- 4.3 Visual layouts (presentation only — ADR 0004)
-- ---------------------------------------------------------------------

create table public.layouts (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  facility_id     uuid not null references public.facilities(id),
  name            text not null,
  version         int  not null default 1,
  status          text not null default 'draft'
                  check (status in ('draft','published','archived')),
  created_by      uuid,                 -- FK added below after public.users
  description     text,                 -- Fase 14, ADR 0015
  changes         jsonb,                -- Fase 14, ADR 0015: per-version
                                        -- change summary (element diffs)
  scale           numeric not null default 20 check (scale > 0), -- px per meter
  background      jsonb,                -- canvas meta (color/image/grid)
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (facility_id, name, version)
);
create index layouts_facility_idx on public.layouts (facility_id);

create table public.layout_elements (
  id          uuid primary key default gen_random_uuid(),
  layout_id   uuid not null references public.layouts(id) on delete cascade,
  location_id uuid references public.locations(id),  -- place elements; the
                                                     -- editor taxonomy (ADR 0005)
  element_type text not null default 'other'
               check (element_type in ('playon','warehouse','storage','scanner',
                                       'scale','quarantine','seizure',
                                       'corridor','door','other')),
  code        text,            -- visual-only elements; places inherit location.code
  name        text,            -- display name; falls back to location.name
  description text,
  x           numeric not null default 0,             -- px, top-left origin
  y           numeric not null default 0,
  visual_width  numeric check (visual_width  is null or visual_width  > 0),
  visual_height numeric check (visual_height is null or visual_height > 0),
  rotation    numeric not null default 0,             -- degrees
  color       text,
  icon        text,
  z_index     int  not null default 0,
  label       text,
  is_locked   boolean not null default false,   -- editor: protected from edits
  is_visible  boolean not null default true,    -- editor: hide keeps the data
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint place_elements_require_location check (
    (element_type in ('corridor','door','other')) or (location_id is not null)
  )
);
create index layout_elements_layout_idx   on public.layout_elements (layout_id);
create index layout_elements_location_idx on public.layout_elements (location_id);
create unique index layout_elements_no_dup_marker_idx
  on public.layout_elements (layout_id, location_id)
  where location_id is not null;          -- one marker per location per layout

-- ---------------------------------------------------------------------
-- 4.4 Identity & access (RBAC)
-- ---------------------------------------------------------------------

create table public.users (                -- profile; identity lives in auth.users
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  auth_user_id    uuid not null unique references auth.users(id),
  email           text not null unique,
  full_name       text not null,
  status          text not null default 'active'
                  check (status in ('active','disabled')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index users_org_idx on public.users (organization_id);

-- Forward reference resolved here (the doc's §4.3 outline places layouts
-- before users; the FK is nullable so adding it after both exist is safe).
alter table public.layouts add constraint layouts_created_by_fk
  foreign key (created_by) references public.users(id);

create table public.roles (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,        -- admin | supervisor | operator | scanner_operator
                                            --   | scale_operator | auditor | viewer (Fase 6; guard split)
  name        text not null,
  description text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.permissions (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,        -- catalog (20): truck.*/cargo.*/warehouse.*/scanner.*
                                            --   /scale.*/quarantine.*/seizure.*/audit.read
                                            --   (docs/security/rbac.md §2)
  name        text not null,
  description text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.user_roles (
  user_id     uuid not null references public.users(id) on delete cascade,
  role_id     uuid not null references public.roles(id),
  assigned_by uuid references public.users(id),
  created_at  timestamptz not null default now(),
  primary key (user_id, role_id)
);

create table public.role_permissions (
  role_id       uuid not null references public.roles(id),
  permission_id uuid not null references public.permissions(id),
  primary key (role_id, permission_id)
);

-- RBAC seed data (7 roles + 20-permission catalog + role_permissions matrix)
-- lives in 0002_rbac_seed.sql (docs/security/rbac.md §3-§4).
-- RLS evaluates through public.has_permission(code) / has_role(code):
-- 0003_authorization_helpers.sql, docs/security/rls.md.

-- ---------------------------------------------------------------------
-- 4.5 Fleet & counterparties
-- ---------------------------------------------------------------------

create table public.transport_companies (  -- carrier registry (was parties.type='carrier')
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  name            text not null,
  tax_id          text,
  contacts        jsonb,
  status          text not null default 'active'
                  check (status in ('active','disabled')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create unique index transport_companies_org_tax_idx
  on public.transport_companies (organization_id, tax_id)
  where tax_id is not null;

create table public.drivers (               -- external catalog, not an app user
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations(id),
  transport_company_id uuid references public.transport_companies(id),
  full_name           text not null,
  document_id         text,
  license_no          text,
  phone               text,
  status              text not null default 'active'
                      check (status in ('active','disabled')),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create unique index drivers_org_document_idx
  on public.drivers (organization_id, document_id)
  where document_id is not null;
create index drivers_company_idx on public.drivers (transport_company_id);

create table public.trucks (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations(id),
  transport_company_id uuid references public.transport_companies(id),
  plate               text not null unique,
  capacity_kg         numeric check (capacity_kg is null or capacity_kg >= 0),
  status              text not null default 'available'
                      check (status in ('available','in_playon','in_route',
                                        'out_of_service','inspection')),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index trucks_company_idx on public.trucks (transport_company_id);

-- NOTE (Fase 7, ADR 0008): trucks.status is the fleet base status (5 codes)
-- only. Entry/exit are arrival/egress movements on the append-only spine with
-- audit_log rows — never timestamp/status columns on this table.

create table public.parties (               -- shipper/client catalog
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  type            text not null check (type in ('shipper','client')),
  name            text not null,
  tax_id          text,
  contacts        jsonb,
  status          text not null default 'active'
                  check (status in ('active','disabled')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create unique index parties_org_tax_idx
  on public.parties (organization_id, tax_id)
  where tax_id is not null;

-- ---------------------------------------------------------------------
-- 4.6 Cargo (quantity + lots, ADR 0003)
-- ---------------------------------------------------------------------

create table public.cargo_manifests (      -- was cargo
  id                    uuid primary key default gen_random_uuid(),
  organization_id       uuid not null references public.organizations(id),
  facility_id           uuid not null references public.facilities(id),
  code                  text not null unique,   -- human-readable
  truck_id              uuid references public.trucks(id),
  driver_id             uuid references public.drivers(id),
  transport_company_id  uuid references public.transport_companies(id),
  shipper_party_id      uuid references public.parties(id),
  client_party_id       uuid references public.parties(id),
  origin                text,
  destination           text,
  expected_weight_kg    numeric,
  arrival_date          timestamptz,
  departure_date        timestamptz,
  status                text not null default 'received'
                        check (status in ('received','in_playon','in_control',
                                          'discharging','discharged',
                                          'distributed','closed')),
  notes                 text,
  created_by            uuid references public.users(id),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index cargo_manifests_facility_idx on public.cargo_manifests (facility_id);
create index cargo_manifests_truck_idx    on public.cargo_manifests (truck_id);
create index cargo_manifests_driver_idx   on public.cargo_manifests (driver_id);

create table public.cargo_items (
  id             uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  manifest_id    uuid not null references public.cargo_manifests(id),
  line_number    int not null,
  sku            text,             -- identifier (ADR 0009 §5)
  description    text not null,
  category       text,             -- Fase 8 (ADR 0009 §2): display/grouping label
  total_quantity numeric not null check (total_quantity > 0),
  uom            text not null default 'unit',
  unit_weight_kg numeric,
  unit_volume_m3 numeric check (unit_volume_m3 is null or unit_volume_m3 > 0), -- Fase 5 (ADR 0006)
  status         text not null default 'pending'
                 check (status in ('pending','on_truck','discharged',
                                   'distributed','closed')),
  observations   text,             -- Fase 8 (ADR 0009 §3): item-level notes
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (manifest_id, line_number)
);
create index cargo_items_manifest_idx on public.cargo_items (manifest_id);

create table public.item_lots (            -- quantum of traceability (ADR 0003)
  id                      uuid primary key default gen_random_uuid(),
  organization_id         uuid not null references public.organizations(id),
  manifest_id             uuid not null references public.cargo_manifests(id),
  cargo_item_id           uuid not null references public.cargo_items(id),
  parent_lot_id           uuid references public.item_lots(id),
  quantity                numeric not null check (quantity > 0),
  uom                     text not null,
  status                  text not null default 'on_truck'
                          check (status in ('on_truck','discharged','checked',
                                            'in_warehouse','in_quarantine',
                                            'seized','released','loaded_out')),
  current_location_id     uuid references public.locations(id),
  current_truck_id        uuid references public.trucks(id),
  unit_weight_kg          numeric,          -- optional override
  unit_volume_m3          numeric check (unit_volume_m3 is null or unit_volume_m3 > 0), -- Fase 5 (ADR 0006)
  created_via_movement_id bigint,           -- FK added below (circular; database.md §4.7)
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  constraint lot_not_in_two_places check (
    not (current_location_id is not null and current_truck_id is not null)
  )
);
create index item_lots_item_idx      on public.item_lots (cargo_item_id);
create index item_lots_location_idx  on public.item_lots (current_location_id);
create index item_lots_truck_idx     on public.item_lots (current_truck_id);
create index item_lots_status_idx    on public.item_lots (status)
  where status in ('in_quarantine','seized');  -- active holds
create index item_lots_parent_idx    on public.item_lots (parent_lot_id);

-- ---------------------------------------------------------------------
-- 4.7 Movement spine (append-only; was checkpoint_events)
-- ---------------------------------------------------------------------

create table public.movements (
  id              bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id),
  facility_id     uuid references public.facilities(id),
  kind            text not null
                  check (kind in ('arrival','discharge','split','transfer',
                                  'scan_in','scan_out','scale','store',
                                  'load_out','quarantine','seizure',
                                  'release','egress','correction',
                                  'return_to_truck')),  -- Fase 9, ADR 0010
  manifest_id     uuid references public.cargo_manifests(id),
  operator_id     uuid references public.users(id),
  location_id     uuid references public.locations(id),
  occurred_at     timestamptz not null default now(),  -- domain time
  created_at      timestamptz not null default now(),  -- insert time
  reason          text,               -- required for sensitive kinds
  previous_movement_id bigint references public.movements(id), -- corrections
  operation_key   text,               -- Fase 9, ADR 0010: idempotency key (nullable)
  payload         jsonb
  -- APPEND-ONLY: no UPDATE/DELETE grants via RLS (0004_rls.sql);
  -- corrections are new rows chained through previous_movement_id.
);
-- =====================================================================
-- CONTRADICTION #3 (timeline index) — RESOLUTION
--   * movement-engine.md §Timeline asks for (organization_id, occurred_at
--     desc, id); database.md §4.7 / schema v5 documents
--     movements_org_time_idx (organization_id, occurred_at desc) and asserts
--     it covers the timeline read with no extra index.
--   * Resolution per decision home (database.md, canonical): keep the
--     documented index as the PREFIX and add `id desc` as tiebreaker — this
--     does not break the doc's assert (a (org, occurred_at desc) query still
--     uses the index as prefix) and satisfies the timeline's
--     `occurred_at desc, id desc` tiebreak ordering (movement-engine.md
--     §Timeline, QA ME-40).
-- =====================================================================
create index movements_org_time_idx on public.movements (organization_id, occurred_at desc, id desc);
create index movements_manifest_idx  on public.movements (manifest_id);
create index movements_prev_idx      on public.movements (previous_movement_id);
-- Fase 9 idempotency: duplicate replay rejected (ADR 0010)
create unique index movements_org_opkey_idx
  on public.movements (organization_id, operation_key)
  where operation_key is not null;

create table public.movement_items (     -- per-lot detail of a movement
  id               bigint generated always as identity primary key,
  movement_id      bigint not null references public.movements(id),
  item_lot_id      uuid not null references public.item_lots(id),
  quantity         numeric not null check (quantity > 0),
  from_location_id uuid references public.locations(id),
  to_location_id   uuid references public.locations(id),
  from_truck_id    uuid references public.trucks(id),
  to_truck_id      uuid references public.trucks(id),
  notes            text
);
create index movement_items_movement_idx on public.movement_items (movement_id);
create index movement_items_lot_idx      on public.movement_items (item_lot_id);
create index movement_items_from_loc_idx on public.movement_items (from_location_id);
create index movement_items_to_loc_idx   on public.movement_items (to_location_id);

-- resolve the circular reference (item_lots -> movements), database.md §4.7
alter table public.item_lots add constraint item_lots_created_via_fk
  foreign key (created_via_movement_id) references public.movements(id);

-- ---------------------------------------------------------------------
-- 4.8 Specialized operations (detail of a movement)
-- ---------------------------------------------------------------------

create table public.scanner_operations (  -- append-only (ADR 0011)
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  movement_id     bigint not null references public.movements(id),
  item_lot_id     uuid not null references public.item_lots(id),
  scanned_code    text not null,           -- barcode/QR as read
  device_id       text,                    -- opaque hardware identifier
  result          text not null default 'success'
                  check (result in ('success','not_found','ambiguous','error')),
  payload         jsonb,
  scanned_at      timestamptz not null default now(),
  operator_id     uuid references public.users(id)
);
create index scanner_ops_movement_idx on public.scanner_operations (movement_id);
create index scanner_ops_lot_idx      on public.scanner_operations (item_lot_id);
create index scanner_ops_code_idx     on public.scanner_operations (scanned_code);

create table public.scale_operations (    -- append-only (ADR 0011); was scale_readings
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  movement_id     bigint not null references public.movements(id),
  item_lot_id     uuid not null references public.item_lots(id),
  gross_kg        numeric,
  tare_kg         numeric,
  net_kg          numeric,
  expected_kg     numeric,
  tolerance_kg    numeric,
  within_tolerance boolean not null,
  device_id       text,
  weighed_at      timestamptz not null default now(),
  operator_id     uuid references public.users(id)
);
create index scale_ops_movement_idx on public.scale_operations (movement_id);
create index scale_ops_lot_idx      on public.scale_operations (item_lot_id);

create table public.quarantine_operations (  -- rezago hold; was quarantine_cases
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  movement_id     bigint not null references public.movements(id),
  item_lot_id     uuid not null references public.item_lots(id),
  reason          text not null,
  status          text not null default 'open'
                  check (status in ('open','resolved','released')),
  opened_by       uuid not null references public.users(id),
  opened_at       timestamptz not null default now(),
  resolved_by     uuid references public.users(id),
  resolved_at     timestamptz,
  resolution_note text
);
create index quarantine_ops_open_idx on public.quarantine_operations (item_lot_id)
  where status = 'open';
create index quarantine_ops_lot_idx on public.quarantine_operations (item_lot_id);

create table public.seizure_operations (  -- secuestro hold; was seizure_records
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  movement_id     bigint not null references public.movements(id),
  item_lot_id     uuid not null references public.item_lots(id),
  legal_ref       text,
  status          text not null default 'open'
                  check (status in ('open','resolved')),
  opened_by       uuid not null references public.users(id),
  opened_at       timestamptz not null default now(),
  resolved_by     uuid references public.users(id),
  resolved_at     timestamptz,
  resolution_note text
);
create index seizure_ops_open_idx on public.seizure_operations (item_lot_id)
  where status = 'open';
create index seizure_ops_lot_idx on public.seizure_operations (item_lot_id);

-- ---------------------------------------------------------------------
-- 4.9 Attachments & audit
-- ---------------------------------------------------------------------

create table public.attachments (          -- was documents; files live in Storage
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  entity_type     text not null,           -- cargo_manifest | cargo_item | item_lot |
                                           -- quarantine_operation | seizure_operation | movement
  entity_id       uuid not null,
  storage_path    text not null,
  mime            text,
  size            bigint,
  uploaded_by     uuid references public.users(id),
  created_at      timestamptz not null default now()
);
create index attachments_entity_idx on public.attachments (entity_type, entity_id);
create index attachments_org_idx    on public.attachments (organization_id);

-- Polymorphic tradeoff (database.md §4.5): entity_type/entity_id has NO FK by
-- design; target existence is validated by the Edge Function / service layer
-- and by RLS.

create table public.audit_log (            -- append-only (ADR 0014)
  id              bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id),
  actor_id        uuid references public.users(id),
  action          text not null,           -- entity.verb catalog (docs/architecture/audit.md)
  entity_type     text,
  entity_id       text,
  before          jsonb,
  after           jsonb,
  reason          text,
  metadata        jsonb,                   -- Fase 13, ADR 0014: structured context
                                           -- (operation_key, source, session_id)
  created_at      timestamptz not null default now()
  -- APPEND-ONLY, same policy as movements: no UPDATE/DELETE policies,
  -- INSERT is trigger/engine-only (0004_rls.sql).
);
create index audit_log_org_time_idx on public.audit_log (organization_id, created_at desc);
create index audit_log_actor_idx    on public.audit_log (actor_id);
create index audit_log_entity_idx   on public.audit_log (entity_type, entity_id);