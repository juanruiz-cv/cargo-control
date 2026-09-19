# Database Structure — Cargo Control

PostgreSQL under Supabase. RLS enabled on every business table; the data API
never uses `bypassrls`. UUID primary keys; `timestamptz` from the database;
every business table carries `org_id`.

## Sketch (DDL outline — not final DDL)

```sql
-- identity handled by auth.users; operators link to it
create table public.orgs (
  id    uuid primary key default gen_random_uuid(),
  name  text not null,
  config jsonb
);

create table public.operators (
  id        uuid primary key default gen_random_uuid(),
  org_id    uuid not null references public.orgs(id),
  user_id   uuid not null references auth.users(id),
  role      text not null check (role in ('admin','supervisor','operator','guard','auditor')),
  status    text not null default 'active' check (status in ('active','disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, user_id)
);

create table public.parties (
  id      uuid primary key default gen_random_uuid(),
  org_id  uuid not null references public.orgs(id),
  type    text not null check (type in ('carrier','shipper','client')),
  name    text not null,
  tax_id  text,
  contacts jsonb
);

create table public.drivers (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.orgs(id),
  party_id    uuid references public.parties(id),   -- carrier company
  full_name   text not null,
  document_id text,
  license_no  text,
  status      text not null default 'active' check (status in ('active','disabled'))
);

create table public.trucks (
  id        uuid primary key default gen_random_uuid(),
  org_id    uuid not null references public.orgs(id),
  plate     text not null unique,
  carrier_party_id uuid references public.parties(id),
  capacity_kg numeric,
  status    text not null default 'available'
            check (status in ('available','in_transit','out_of_service','inspection'))
);

create table public.cargo (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.orgs(id),
  code       text not null unique,
  truck_id   uuid references public.trucks(id),
  driver_id  uuid references public.drivers(id),
  shipper_party_id uuid references public.parties(id),
  client_party_id  uuid references public.parties(id),
  origin     text,
  destination text,
  status     text not null default 'received'
             check (status in ('received','in_playon','in_control','discharging',
                               'discharged','distributed','closed')),
  expected_weight_kg numeric,
  created_by uuid references public.operators(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- quantity + lots model (ADR 0003)
create table public.cargo_items (
  id             uuid primary key default gen_random_uuid(),
  cargo_id       uuid not null references public.cargo(id),
  org_id         uuid not null,
  line_number    int not null,
  sku            text,
  description    text,
  total_quantity numeric not null check (total_quantity > 0),
  uom            text not null default 'unit',
  unit_weight_kg numeric,
  status         text not null default 'pending'
                 check (status in ('pending','on_truck','discharged','distributed','closed')),
  unique (cargo_id, line_number)
);

create table public.item_lots (
  id             uuid primary key default gen_random_uuid(),
  cargo_id       uuid not null references public.cargo(id),
  cargo_item_id  uuid not null references public.cargo_items(id),
  org_id         uuid not null,
  parent_lot_id  uuid references public.item_lots(id),  -- chained splits
  quantity       numeric not null check (quantity > 0),
  uom            text not null,
  location_type  text not null check (location_type in ('playon','warehouse','checkpoint','truck')),
  location_id    uuid references public.warehouse_locations(id),
  truck_id       uuid references public.trucks(id),     -- when location_type = 'truck'
  status         text not null default 'on_truck'
                 check (status in ('on_truck','discharged','checked','in_warehouse',
                                   'in_quarantine','seized','released','loaded_out')),
  created_via    uuid,  -- source checkpoint_event id
  checked_at     timestamptz,
  constraint location_required check (
    (location_type = 'truck' and truck_id is not null) or
    (location_type in ('playon','warehouse','checkpoint') and location_id is not null)
  )
);

create table public.warehouse_locations (
  id        uuid primary key default gen_random_uuid(),
  org_id    uuid not null references public.orgs(id),
  parent_id uuid references public.warehouse_locations(id),
  type      text not null check (type in ('site','zone','bin','playon','scanner','balanza','control')),
  code      text not null,
  name      text,
  active    boolean not null default true
);

create table public.checkpoint_events (
  id        bigint generated always as identity primary key,
  org_id    uuid not null,
  kind      text not null
            check (kind in ('arrival','discharge','split','transfer','scan_in',
                            'scan_out','scale','store','load_out','quarantine',
                            'seizure','release','egress','correction')),
  cargo_id      uuid references public.cargo(id),
  cargo_item_id uuid references public.cargo_items(id),
  item_lot_id   uuid references public.item_lots(id),
  operator_id   uuid references public.operators(id),
  location_id   uuid references public.warehouse_locations(id),
  occurred_at   timestamptz not null default now(),
  quantity      numeric,                 -- for discharge/split/transfer
  reason        text,                   -- required for sensitive kinds
  previous_event_id bigint references public.checkpoint_events(id), -- corrections
  payload jsonb
  -- NOTE: append-only. No UPDATE/DELETE grants via RLS.
);

create table public.scale_readings (
  id          uuid primary key default gen_random_uuid(),
  checkpoint_event_id bigint not null references public.checkpoint_events(id),
  item_lot_id uuid not null references public.item_lots(id),
  gross_kg numeric, tare_kg numeric, net_kg numeric,
  expected_kg numeric, tolerance_kg numeric,
  within_tolerance boolean not null
);

create table public.quarantine_cases (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null,
  item_lot_id uuid not null references public.item_lots(id),
  reason     text not null,
  status     text not null default 'open' check (status in ('open','resolved','released')),
  opened_by  uuid not null references public.operators(id),
  opened_at  timestamptz not null default now(),
  resolved_by uuid references public.operators(id),
  resolved_at timestamptz,
  resolution_note text
);

create table public.seizure_records (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null,
  item_lot_id uuid not null references public.item_lots(id),
  legal_ref  text,
  status     text not null default 'open' check (status in ('open','resolved')),
  opened_by  uuid not null references public.operators(id),
  opened_at  timestamptz not null default now()
);

create table public.documents (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null,
  entity_type  text not null,
  entity_id    text not null,
  storage_path text not null,
  mime         text, size bigint,
  uploaded_by  uuid references public.operators(id),
  created_at   timestamptz not null default now()
);

create table public.audit_log (
  id        bigint generated always as identity primary key,
  org_id    uuid not null,
  actor_id  uuid, action text not null,
  entity_type text, entity_id text,
  before jsonb, after jsonb, reason text,
  created_at timestamptz not null default now()
);
```

## Design rules

- Append-only event log with identity primary key and no write RLS on existing
  rows.
- **Quantity-balance trigger:** after every split/transfer, Σ leaf lots per item
  must equal `total_quantity`; violation rejects the transaction (ADR 0003).
- Sensitive transitions (quarantine, seizure, release) validated by triggers
  and require `reason`.
- `updated_at` maintained via trigger; history preserved in events, not in-place
  updates.
- Retention/partitioning plan for `checkpoint_events` and `audit_log`.