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
| D1 | Physical location and visual layout are **two independent submodels** (ADR 0004 + editor taxonomy ADR 0005) | Layout edits can never corrupt stock truth |
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
| `layout_elements.location_id` | `locations` | N : (0..1) | place types require it; `corridor`/`door`/`other` may be visual-only (ADR 0005); never deletes with the location |
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
-- the ADR 0003 balance trigger. Storing counters here would risk drift.

-- Occupancy (Fase 5, ADR 0006): derived per dimension over lots at rest here.
-- Full DDL outline: docs/domain/capacity-occupancy.md §6–§7.
create view public.location_occupancy as
  select l.id as location_id, l.organization_id, l.facility_id, l.code,
    coalesce(w.kg, 0)    as occupancy_kg,
    coalesce(v.m3, 0)    as occupancy_m3,
    coalesce(u.units, 0) as occupancy_units,
    coalesce(w.missing_weight, 0) as missing_weight_lots,
    coalesce(v.missing_volume, 0) as missing_volume_lots,
    l.capacity_max_kg, l.capacity_max_volume_m3, l.capacity_max_units,
    l.capacity_max_kg        - coalesce(w.kg, 0) as available_kg,
    l.capacity_max_volume_m3 - coalesce(v.m3, 0) as available_m3,
    l.capacity_max_units     - coalesce(u.units,0) as available_units,
    case when l.capacity_max_kg is not null
      then round(coalesce(w.kg,0) / l.capacity_max_kg * 100, 1) end as pct_kg,
    case when l.capacity_max_volume_m3 is not null
      then round(coalesce(v.m3,0) / l.capacity_max_volume_m3 * 100, 1) end as pct_m3,
    case when l.capacity_max_units is not null
      then round(coalesce(u.units,0) / l.capacity_max_units * 100, 1) end as pct_units
  from public.locations l
  left join (select current_location_id,
                    sum(quantity * coalesce(l.unit_weight_kg, i.unit_weight_kg)) as kg,
                    count(*) filter (where l.unit_weight_kg is null
                                      and i.unit_weight_kg is null) as missing_weight
             from   public.item_lots l
             join   public.cargo_items i on i.id = l.cargo_item_id
             where  l.current_location_id is not null
             group  by l.current_location_id) w on w.current_location_id = l.id
  left join (select current_location_id,
                    sum(quantity * coalesce(l.unit_volume_m3, i.unit_volume_m3)) as m3,
                    count(*) filter (where l.unit_volume_m3 is null
                                      and i.unit_volume_m3 is null) as missing_volume
             from   public.item_lots l
             join   public.cargo_items i on i.id = l.cargo_item_id
             where  l.current_location_id is not null
             group  by l.current_location_id) v on v.current_location_id = l.id
  left join (select current_location_id, sum(quantity) as units
             from   public.item_lots
             where  current_location_id is not null and uom = 'unit'
             group  by current_location_id) u on u.current_location_id = l.id;

-- Capacity guard triggers (Fase 5, ADR 0006): placement guard serializes per
-- location (row lock FOR UPDATE) and rejects overflow; capacity guard rejects
-- reductions below occupancy; audit trigger logs every accepted capacity.set.
-- Rejected operations write nothing and are not audited (attempt ≠ change).
create trigger locations_capacity_guard_trg
  before update of capacity_max_kg, capacity_max_volume_m3, capacity_max_units
  on public.locations
  for each row execute function public.locations_capacity_guard();
create trigger lot_placement_capacity_guard_trg
  before insert or update of current_location_id, quantity,
                          unit_weight_kg, unit_volume_m3, uom
  on public.item_lots
  for each row execute function public.lot_placement_capacity_guard();
create trigger locations_capacity_audit_trg
  after update of capacity_max_kg, capacity_max_volume_m3, capacity_max_units
  on public.locations
  for each row execute function public.locations_capacity_audit();

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
  scale           numeric not null default 20 check (scale > 0), -- px per meter
  background      jsonb,                   -- canvas meta (color/image/grid)
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

-- RBAC seeds (Fase 6, ADR 0007): 7 roles + 20-permission catalog +
-- role_permissions matrix, all as DATA in docs/security/rbac.md §3–§4.
-- RLS evaluates through public.has_permission(code) / has_role(code):
-- docs/security/rls.md, docs/security/authorization.md.

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

-- NOTE (Fase 7, ADR 0008): `trucks.status` is the fleet **base** status
-- (5 codes) only. Entry/exit are `arrival`/`egress` movements on the
-- append-only spine (§4.7) with `audit_log` rows — NEVER stored as
-- timestamp/status columns on this table. The 13 display states rendered by
-- the UI are derived read-side (docs/domain/states.md §truck_status display
-- map). No DDL change for the trucks module.

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
  -- APPEND-ONLY: no UPDATE/DELETE grants via RLS; corrections are new rows.
);
create index movements_org_time_idx on public.movements (organization_id, occurred_at desc);
create index movements_manifest_idx  on public.movements (manifest_id);
create index movements_prev_idx      on public.movements (previous_movement_id);
-- Fase 9 idempotency: duplicate replay rejected (ADR 0010)
create unique index movements_org_opkey_idx
  on public.movements (organization_id, operation_key)
  where operation_key is not null;
-- Assert: movements_org_time_idx above covers the timeline read
-- (organization_id, occurred_at desc) — no extra index needed.

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

Schema **v2** (Fase 4 floor plan editor, ADR 0005): `layout_elements.kind` →
`element_type` (editor taxonomy `playon|warehouse|storage|scanner|scale|
quarantine|seizure|corridor|door|other`); `width/height` →
`visual_width/visual_height`; added `is_locked`, `is_visible`, `code`, `name`,
`description`; marker rule relaxed (place types require a location; corridor/
door/other may be visual-only). `locations` gain `physical_*` dimensions,
`physical_unit` and `capacity_max_units/kg/volume_m3` (was `capacity_qty`,
`capacity_kg`). `layouts` gain `scale` (px per meter).

Schema **v3** (Fase 5 capacity & occupancy, ADR 0006): add
`unit_volume_m3` to `cargo_items`/`item_lots` (volume source, mirroring
`unit_weight_kg`); new `location_occupancy` view (used/available/% per
dimension + missing-data flags); capacity guard + audit triggers on
`locations` and `item_lots`. No renames.

Schema **v4** (Fase 8 cargo module, ADR 0009): add nullable `category` and
`observations` to `cargo_items` (display grouping + item-level notes).
`currentLocation` is **derived** from `item_lots` placement — never a
column. No other DDL change, no renames.

Schema **v5** (Fase 9 movement engine, ADR 0010): add `return_to_truck`
to the `movements.kind` CHECK (remnant placed back on a truck without
egress); add nullable `movements.operation_key` with partial unique
index `movements_org_opkey_idx (organization_id, operation_key) where
operation_key is not null` (idempotency / duplicate replay rejection).
Timeline read is covered by the existing `movements_org_time_idx`
(organization_id, occurred_at desc) — asserted, no extra index. No
other DDL change, no renames.

Schema **v6** (Fase 10 special operational areas, ADR 0011): **no new
columns.** Documented read-side derived views:
- `station_queue` — lots placed at a `scan`/`scale` checkpoint without a
  completed `scanner_operations`/`scale_operations` row for the current
  placement (feeds the pending queues).
- `hold_open` — open `quarantine_operations`/`seizure_operations` with
  lot/item context (frozen/blocked visibility).
Append-only asserts (ADR 0011): `scanner_operations`,
`scale_operations` have no UPDATE/DELETE grants (same policy as
movements); `quarantine_operations`/`seizure_operations` cases are
never deleted — resolution is a `release` movement (Fase 9 engine) plus a
server-side status update only. No DDL change, no renames.

Schema **v7** (Fase 11 operational map, ADR 0012): add
`locations.maintenance boolean not null default false` — the only stored
component of the five visual states (MANTENIMIENTO); LIBRE/PARCIAL/
OCUPADO/BLOQUEADO are derived read-side. No other DDL change, no
renames.

Schema **v8** (Fase 12 operational dashboard, ADR 0013): **no new
columns.** Documented read-only aggregated views for the dashboard
(server-side aggregation; the client only receives aggregated rows —
never raw history to compute statistics):
- `dashboard_metrics` — the 10 KPI values as one aggregated row per
  organization (yard/waiting/discharging trucks; stored/scan/scale/
  quarantine/seized merchandise; occupied/free sectors) derived from
  the Fase 7 display map signals, `item_lots`, `station_queue`,
  `hold_open` and `location_occupancy`.
- `dashboard_series_arrivals` — `count(*)` of `movements
  kind='arrival'` bucketed per day (facility timezone).
- `dashboard_series_movements` — `count(*)` of movements bucketed per
  day and kind.
- `dashboard_series_trucks_processed` — distinct trucks per day whose
  latest movement is `egress`.
- `dashboard_series_merchandise_processed` — `sum(movement_items.quantity)`
  per day joined through `movements`.
- `dashboard_occupancy_snapshot` — occupancy pct rows from
  `location_occupancy` for chart/card rendering.
Series views cap the window at the requested horizon (default 30 days;
longer horizons via explicit pagination) and rely on existing indices
(`movements_org_time_idx`, `item_lots_*_idx`). No DDL change on user
tables, no renames.

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
- **Physical ≠ visual (ADR 0005):** physical dimensions (meters) and visual
  dimensions (pixels) never auto-sync; the only bridge is `layouts.scale`
  (px/m), used read-side for conversions.
- **Capacity & occupancy (ADR 0006):** occupancy is derived per dimension
  (kg = Σ qty × unit_weight; m³ = Σ qty × unit_volume; units = Σ qty with
  `uom='unit'`) over lots at rest at the location, **including holds**;
  `NULL` capacity = unlimited; placement that would exceed a known capacity,
  or a capacity reduction below current occupancy, is rejected by trigger;
  every accepted capacity change writes an `audit_log` `capacity.set` row.
  Lots without weight/volume data are flagged, not summed as zero.
- RLS default-deny on every table; append-only tables expose no UPDATE/DELETE;
  attachments readable through signed Storage URLs only.
  See `docs/domain/business-rules.md` and `docs/security/rls.md`.

Domain contract and entity reference: `docs/domain/entities.md`. States:
`docs/domain/states.md`. Flows: `docs/domain/flows.md`.