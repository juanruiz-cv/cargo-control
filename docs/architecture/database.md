# Database Structure & Data Model — Cargo Control (Fase 3)

Deliverable of **Fase 3 / Prompt 04 (Data Model)**. This blueprint supersedes
the Fase 0 sketch (kept for reference via the rename map in §7) while preserving
the accepted decisions: quantity + lots model (ADR 0003), append-only event
spine, RLS default-deny, English artifacts (ADR 0005), and the new
**physical location vs visual layout separation** (ADR 0004).

Stack: PostgreSQL under Supabase (`auth.users`, `gen_random_uuid()`, `timestamptz`,
RLS on every business table, no `bypassrls` for the data API).

## 1. Design decisions at a glance

| # | Decision | Consequence |
| - | -------- | ----------- |
| D1 | Physical location and visual layout are **two independent submodels** (ADR 0004) | Layout edits can never corrupt stock truth |
| D2 | `movements` + `movement_items`: normalized append-only spine | One event can affect several lots; per-lot detail is queryable |
| D3 | Specialized operations (`scanner`/`scale`/`quarantine`/`seizure`) attach to movements | Device-level data lives outside the domain spine |
| D4 | Tenancy: `organizations` → `facilities` → `locations` | Multi-org and multi-facility from day one; multi-warehouse is more facilities |
| D5 | Identity: `users` + `roles` + `permissions` join tables | RBAC ready; RLS keys off role membership |
| D6 | Soft delete = `status`/`active` deactivation; no tombstone columns | Catalogs deactivate, business records close, the spine never mutates |
| D7 | Inventory/occupancy are **derived**, never stored | Single source of truth via the ADR 0003 balance invariant |
| D8 | Rename map from Fase 0–2 vocabulary (§7) | Phase documents stay translatable |

## 2. Conceptual ERD

Cardinality notation: `1─<` one-to-many, `><` many-to-many, `(0..1)` optional.

### Identity & access

```
organizations 1─< users >─< user_roles >─< roles >─< role_permissions >─< permissions
```

### Physical (operational) vs Visual (presentation) — ADR 0004

```
organizations 1─< facilities 1─< locations  (0..1)─< locations     -- parent tree
facilities    1─< layouts   1─< layout_elements (0..1)─> locations -- map markers
```

### Fleet & cargo

```
organizations 1─< transport_companies 1─< trucks
                                  └─ 1─< drivers
cargo_manifests ─1─> truck (0..1) ─1─> driver (0..1) ─1─> transport_company (0..1)
cargo_manifests ─1─> parties (shipper 0..1) ─1─> parties (client 0..1)
cargo_manifests 1─< cargo_items 1─< item_lots (0..1)─< item_lots -- chained splits
item_lots (0..1)─> locations | trucks            -- physical placement
```

### Traceability

```
movements 1─< movement_items >─1 item_lots
movements 1─< scanner_operations
movements 1─< scale_operations
movements 1─< quarantine_operations >─1 item_lots
movements 1─< seizure_operations   >─1 item_lots
attachments , audit_log ── polymorphic many-to-one (entity_type, entity_id)
```

### Relationship catalog (every foreign key)

| From | To | Cardinality | Notes |
| ---- | -- | ----------- | ----- |
| `facilities.organization_id` | `organizations` | N : 1 | tenant boundary |
| `locations.facility_id` | `facilities` | N : 1 | |
| `locations.parent_id` | `locations` | N : (0..1) | zone → bin tree |
| `layouts.facility_id` | `facilities` | N : 1 | |
| `layout_elements.layout_id` | `layouts` | N : 1 | CASCADE on layout delete |
| `layout_elements.location_id` | `locations` | N : (0..1) | markers only; never deletes with the location |
| `users.organization_id` | `organizations` | N : 1 | MVP: one org per user |
| `users.auth_user_id` | `auth.users` | 1 : 1 | created by trigger on signup |
| `user_roles.user_id` | `users` | N : 1 | CASCADE |
| `user_roles.role_id` | `roles` | N : 1 | |
| `role_permissions.role_id` | `roles` | N : 1 | |
| `role_permissions.permission_id` | `permissions` | N : 1 | |
| `drivers.transport_company_id` | `transport_companies` | N : (0..1) | employer |
| `trucks.transport_company_id` | `transport_companies` | N : (0..1) | owner/operator |
| `cargo_manifests.facility_id` | `facilities` | N : 1 | arrival facility |
| `cargo_manifests.truck_id` | `trucks` | N : (0..1) | 1 manifest = 1 truck (MVP) |
| `cargo_manifests.driver_id` | `drivers` | N : (0..1) | |
| `cargo_manifests.transport_company_id` | `transport_companies` | N : (0..1) | carrier |
| `cargo_manifests.shipper_party_id` / `client_party_id` | `parties` | N : (0..1) | |
| `cargo_items.manifest_id` | `cargo_manifests` | N : 1 | |
| `item_lots.cargo_item_id` | `cargo_items` | N : 1 | |
| `item_lots.manifest_id` | `cargo_manifests` | N : 1 | denormalized for queries/RLS |
| `item_lots.parent_lot_id` | `item_lots` | N : (0..1) | chained splits |
| `item_lots.current_location_id` | `locations` | N : (0..1) | at-rest placement |
| `item_lots.current_truck_id` | `trucks` | N : (0..1) | on-truck remnant |
| `item_lots.created_via_movement_id` | `movements` | N : (0..1) | FK added in migration (circular) |
| `movements.manifest_id` | `cargo_manifests` | N : (0..1) | |
| `movements.operator_id` | `users` | N : (0..1) | |
| `movements.location_id` | `locations` | N : (0..1) | where it happened |
| `movements.previous_movement_id` | `movements` | N : (0..1) | corrections chain |
| `movement_items.movement_id` | `movements` | N : 1 | |
| `movement_items.item_lot_id` | `item_lots` | N : 1 | |
| `movement_items.from/to_location_id` | `locations` | N : (0..1) | |
| `movement_items.from/to_truck_id` | `trucks` | N : (0..1) | |
| `scanner_operations.movement_id` | `movements` | N : 1 | |
| `scanner_operations.item_lot_id` | `item_lots` | N : 1 | |
| `scale_operations.movement_id` | `movements` | N : 1 | |
| `scale_operations.item_lot_id` | `item_lots` | N : 1 | |
| `quarantine_operations.movement_id` | `movements` | N : 1 | opening movement |
| `quarantine_operations.item_lot_id` | `item_lots` | N : 1 | |
| `quarantine_operations.opened_by`/`resolved_by` | `users` | N : (0..1) | |
| `seizure_operations` (same shape) | `movements` / `item_lots` / `users` | N : 1 | |
| `attachments.uploaded_by` | `users` | N : (0..1) | entity link is polymorphic (§4.5) |
| `audit_log.actor_id` | `users` | N : (0..1) | |

## 3. Conventions

- **PKs:** `uuid` via `gen_random_uuid()` for business entities; `bigint
  generated always as identity` for high-volume append-only tables
  (`movements`, `movement_items`, `audit_log`).
- **Tenancy:** every business table carries `organization_id`; RLS scopes by it.
- **Timestamps:** `created_timestamptz not null default now()`; mutable tables
  add `updated_at` maintained by a shared `set_updated_at()` trigger; events use
  `occurred_at` (domain time, backfillable) plus `created_at` (insert time).
- **Actors:** `created_by`/`updated_by`/`opened_by`/`operator_id` keep human
  ownership; identity is never trusted from the client.
- **Soft delete:** catalogs deactivate (`status`/`active`); business records
  move through closing statuses; the movement spine is immutable. No
  tombstone `deleted_at` columns in the MVP.
- **RLS:** enabled on every table, default deny, policies granted per role
  (see `docs/security/rls.md`); append-only tables expose no UPDATE/DELETE.
- **Enums:** `text` columns with `check` constraints (Supabase-friendly);
  UI mapping in `docs/domain/states.md`.

## 4. Schema (DDL outline — not final DDL)

```sql
-- Shared trigger for mutable tables
create or replace function public.set_updated_at() returns trigger as $$
begin
  new.updated_at := now();
  return new;
end $$ language plpgsql;

-- =====================================================================
-- 4.1 Tenancy
-- =====================================================================

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

-- =====================================================================
-- 4.2 Physical locations (operational truth — ADR 0004)
-- =====================================================================

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
  capacity_qty         numeric check (capacity_qty is null or capacity_qty >= 0),
  capacity_kg          numeric check (capacity_kg  is null or capacity_kg  >= 0),
  allows_hold          boolean not null default false,  -- rezago/secuestro staging
  requires_authorization boolean not null default false,
  notes                text,
  active               boolean not null default true,
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
-- the ADR 0003 balance trigger. Storing counters here would risk drift.

-- =====================================================================
-- 4.3 Visual layouts (presentation only — ADR 0004)
-- =====================================================================

create table public.layouts (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  facility_id     uuid not null references public.facilities(id),
  name            text not null,
  version         int  not null default 1,
  status          text not null default 'draft'
                  check (status in ('draft','published','archived')),
  background      jsonb,                   -- canvas meta (color/image/grid)
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (facility_id, name, version)
);
create index layouts_facility_idx on public.layouts (facility_id);

create table public.layout_elements (
  id          uuid primary key default gen_random_uuid(),
  layout_id   uuid not null references public.layouts(id) on delete cascade,
  location_id uuid references public.locations(id),  -- markers only; location
                                                     -- deactivation never
                                                     -- removes the element
  kind        text not null default 'location_marker'
              check (kind in ('location_marker','shape','label','decoration')),
  x           numeric not null default 0,
  y           numeric not null default 0,
  width       numeric,
  height      numeric,
  rotation    numeric not null default 0,
  color       text,
  icon        text,
  z_index     int  not null default 0,
  label       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint marker_requires_location check (
    (kind = 'location_marker') = (location_id is not null)
  )
);
create index layout_elements_layout_idx   on public.layout_elements (layout_id);
create index layout_elements_location_idx on public.layout_elements (location_id);
create unique index layout_elements_no_dup_marker_idx
  on public.layout_elements (layout_id, location_id)
  where location_id is not null;          -- one marker per location per layout

-- =====================================================================
-- 4.4 Identity & access (RBAC)
-- =====================================================================

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

create table public.roles (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,        -- admin | supervisor | operator | guard | auditor
  name        text not null,
  description text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.permissions (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,        -- e.g. cargo.read, quarantine.resolve
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

-- =====================================================================
-- 4.5 Fleet & counterparties
-- =====================================================================

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

-- =====================================================================
-- 4.6 Cargo (quantity + lots, ADR 0003)
-- =====================================================================

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
  sku            text,
  description    text not null,
  total_quantity numeric not null check (total_quantity > 0),
  uom            text not null default 'unit',
  unit_weight_kg numeric,
  status         text not null default 'pending'
                 check (status in ('pending','on_truck','discharged',
                                   'distributed','closed')),
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
  created_via_movement_id uuid,             -- FK added after movements exists
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

-- =====================================================================
-- 4.7 Movement spine (append-only; was checkpoint_events)
-- =====================================================================

create table public.movements (
  id              bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id),
  facility_id     uuid references public.facilities(id),
  kind            text not null
                  check (kind in ('arrival','discharge','split','transfer',
                                  'scan_in','scan_out','scale','store',
                                  'load_out','quarantine','seizure',
                                  'release','egress','correction')),
  manifest_id     uuid references public.cargo_manifests(id),
  operator_id     uuid references public.users(id),
  location_id     uuid references public.locations(id),
  occurred_at     timestamptz not null default now(),  -- domain time
  created_at      timestamptz not null default now(),  -- insert time
  reason          text,               -- required for sensitive kinds
  previous_movement_id bigint references public.movements(id), -- corrections
  payload         jsonb
  -- APPEND-ONLY: no UPDATE/DELETE grants via RLS; corrections are new rows.
);
create index movements_org_time_idx on public.movements (organization_id, occurred_at desc);
create index movements_manifest_idx  on public.movements (manifest_id);
create index movements_prev_idx      on public.movements (previous_movement_id);

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

-- resolve the circular reference (item_lots -> movements)
alter table public.item_lots add constraint item_lots_created_via_fk
  foreign key (created_via_movement_id) references public.movements(id);

-- =====================================================================
-- 4.8 Specialized operations (detail of a movement)
-- =====================================================================

create table public.scanner_operations (
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

create table public.scale_operations (    -- was scale_readings
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

-- =====================================================================
-- 4.9 Attachments & audit
-- =====================================================================

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

create table public.audit_log (
  id              bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id),
  actor_id        uuid references public.users(id),
  action          text not null,           -- user.invite | role.change | ...
  entity_type     text,
  entity_id       text,
  before          jsonb,
  after           jsonb,
  reason          text,
  created_at      timestamptz not null default now()
  -- APPEND-ONLY, same policy as movements.
);
create index audit_log_org_time_idx on public.audit_log (organization_id, created_at desc);
create index audit_log_actor_idx    on public.audit_log (actor_id);
create index audit_log_entity_idx   on public.audit_log (entity_type, entity_id);
```

### 4.5 Polymorphic attachments (tradeoff)

`attachments.entity_type/entity_id` is a polymorphic reference: PostgreSQL cannot
enforce a FK across table families, so **target existence is validated by the
Edge Function / service layer and by RLS** instead of a constraint. This is a
deliberate MVP tradeoff to avoid twelve nullable FKs on one table. If enforcement
becomes necessary, replace with a `X_attachments` join per target type.

## 5. Index summary

| Scope | Index |
| ----- | ----- |
| Tenancy | `organization_id` on every business table |
| Facility | `facilities (org)` · `locations (facility, parent)` · `layouts (facility)` |
| Layout | `layout_elements (layout, location)` + partial unique (layout, location) WHERE location_id NOT NULL |
| Identity | `users (org)` · unique `users.auth_user_id`, `users.email`, `roles.code`, `permissions.code` |
| Catalog | unique partial `transport_companies(org,tax_id)` · `drivers(org,document_id)` · `parties(org,tax_id)` · unique `trucks.plate` |
| Cargo | `cargo_manifests (facility, truck, driver)` · unique `code`, `(manifest,line)` · `cargo_items (manifest)` · `item_lots (item, location, truck, parent)` |
| Holds | partial `item_lots(status) WHERE status IN ('in_quarantine','seized')` · partial open on quarantine/seizure ops |
| Spine | `movements (org, occurred_at desc)`, `(manifest)`, `(previous)` · `movement_items (movement, item_lot, from/to loc)` |
| Ops | `scanner_operations (movement, item_lot, code)` · `scale_operations (movement, item_lot)` |
| Audit | `audit_log (org, created_at desc)`, `(actor)`, `(entity)` · `attachments (entity_type, entity_id)` |

## 6. Future evolution (without schema rewrite)

- **Multi-organization membership:** MVP keeps one `organization_id` per user.
  A user joining several orgs later adds `organization_members` and drops the
  column; RLS already keys off organization.
- **Multi-facility / multi-warehouse:** already native — a facility per
  warehouse/site, each with its own location tree and layouts; `facilities.type`
  distinguishes them. Manifests and movements carry `facility_id`.
- **Fine-grained permissions:** `role_permissions` is live from day one; RLS
  can consume `permissions.code` without changing the schema.
- **Spine growth:** `movements`/`movement_items`/`audit_log` partition on
  `occurred_at`/`created_at`; retention policy as planned in
  `docs/architecture/risks.md`.
- **Dedicated backend:** the schema stays valid under PostgreSQL; no Supabase
  lock-in beyond `auth.users`.

## 7. Rename map (Fase 0–2 → Fase 3)

| Fase 0–2 | Fase 3 | Change |
| --------- | ------ | ------ |
| `orgs` / `org` | `organizations` | rename |
| — | `facilities` | **new** (site/warehouse root) |
| `warehouse_locations` | `locations` | relocated under `facility_id`; visual fields removed |
| — | `layouts`, `layout_elements` | **new** (ADR 0004 visual submodel) |
| `operators` | `users` | rename; plus `roles`/`user_roles`/`permissions`/`role_permissions` (new) |
| `parties` (type=carrier) | `transport_companies` | split out |
| `parties` (shipper/client) | `parties` (type shipper\|client) | type restricted |
| `cargo` | `cargo_manifests` | rename; gains `facility_id` |
| `cargo_items`, `item_lots` | unchanged | ADR 0003 preserved |
| `checkpoint_events` | `movements` + `movement_items` | renamed; normalized to per-lot items |
| `scale_readings` | `scale_operations` | rename |
| `quarantine_cases` | `quarantine_operations` | rename |
| `seizure_records` | `seizure_operations` | rename |
| `documents` | `attachments` | rename |
| `audit_log` | unchanged | — |

## 8. Design rules (enforced in the data layer)

- `movements`, `movement_items`, `audit_log` are **append-only**: corrections are
  new rows chained through `previous_movement_id`/`previous_event_id` semantics.
- **Quantity balance (ADR 0003):** after every split/transfer, Σ leaf lot
  quantities per item = `total_quantity`; rejected by a trigger on violation.
  Holds freeze lots: no normal stock movement while `in_quarantine`/`seized`.
- Sensitive transitions (quarantine, seizure, release) require `reason` and are
  audit-logged; release of a lot also requires a resolution record.
- `updated_at` maintained via the shared trigger; history lives in the spine,
  never in-place updates.
- Location capacity is advisory metadata; **occupancy/inventory derive from
  `item_lots`** — never write them as columns (D7).
- RLS default-deny on every table; append-only tables expose no UPDATE/DELETE;
  attachments readable through signed Storage URLs only.
  See `docs/domain/business-rules.md` and `docs/security/rls.md`.

Domain contract and entity reference: `docs/domain/entities.md`. States:
`docs/domain/states.md`. Flows: `docs/domain/flows.md`.