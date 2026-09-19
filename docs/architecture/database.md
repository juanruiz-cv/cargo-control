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
  shipper_party_id uuid references public.parties(id),
  client_party_id  uuid references public.parties(id),
  origin     text,
  destination text,
  status     text not null default 'received'
             check (status in ('received','staging','checked','in_warehouse',
                               'in_quarantine','seized','released','loaded_out')),
  expected_weight_kg numeric,
  created_by uuid references public.operators(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.warehouse_locations (
  id        uuid primary key default gen_random_uuid(),
  org_id    uuid not null references public.orgs(id),
  parent_id uuid references public.warehouse_locations(id),
  type      text not null check (type in ('site','zone','bin')),
  code      text not null,
  name      text,
  active    boolean not null default true
);

create table public.cargo_units (
  id        uuid primary key default gen_random_uuid(),
  cargo_id  uuid not null references public.cargo(id),
  org_id    uuid not null,
  unit_code text not null,
  barcode   text not null unique,
  weight_kg numeric,
  status    text not null default 'pending'
            check (status in ('pending','checked','in_warehouse','in_quarantine',
                              'seized','released','loaded_out')),
  current_location_id uuid references public.warehouse_locations(id),
  checked_at timestamptz,
  unique (cargo_id, unit_code)
);

create table public.checkpoint_events (
  id        bigint generated always as identity primary key,
  org_id    uuid not null,
  kind      text not null
            check (kind in ('scan_in','scan_out','scale','check_in','check_out',
                            'quarantine','seizure','release','correction')),
  cargo_id      uuid references public.cargo(id),
  cargo_unit_id uuid references public.cargo_units(id),
  operator_id   uuid references public.operators(id),
  location_id   uuid references public.warehouse_locations(id),
  occurred_at   timestamptz not null default now(),
  reason       text,                     -- required for sensitive kinds
  previous_event_id bigint references public.checkpoint_events(id), -- corrections
  payload jsonb
  -- NOTE: append-only. No UPDATE/DELETE grants via RLS.
);

create table public.scale_readings (
  id          uuid primary key default gen_random_uuid(),
  checkpoint_event_id bigint not null references public.checkpoint_events(id),
  cargo_unit_id uuid not null references public.cargo_units(id),
  gross_kg numeric, tare_kg numeric, net_kg numeric,
  expected_kg numeric, tolerance_kg numeric,
  within_tolerance boolean not null
);

create table public.quarantine_cases (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null,
  cargo_unit_id uuid references public.cargo_units(id),
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
  cargo_unit_id uuid references public.cargo_units(id),
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
- Sensitive transitions (quarantine, seizure, release) validated by triggers
  and require `reason`.
- `updated_at` maintained via trigger; history preserved in events, not in-place
  updates.
- Retention/partitioning plan for `checkpoint_events` and `audit_log`.