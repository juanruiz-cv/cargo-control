# ARCHITECTURE.md — Cargo Control

This document is the deliverable for **Fase 0 (Project Constitution)**. It covers
the 9 required outputs: architecture, modules, entities, dependencies, routes,
component structure, database structure, permission strategy, and technical risks.

## 1. Architecture proposal

```
                         CARGO CONTROL
                               │
             ┌─────────────────┼─────────────────┐
             │                 │                 │
             ▼                 ▼                 ▼
        Product / UX      Frontend Web       Backend Data
             │                 │                 │
             │              React             Supabase
             │            TypeScript            │
             │            Tailwind              │
             │           shadcn/ui              │
             │                 │                 │
             │                 └───────┬─────────┘
             │                         │
             │                    PostgreSQL
             │                         │
             │                        RLS
             │                         │
             │                  Edge Functions
             │
             └─────────────────────────────────────┐
                                                   │
                                            GitHub / CI/CD
                                                   │
                                  ┌────────────────┼───────────────┐
                                  │                │               │
                                  ▼                ▼               ▼
                                Web             Docs       Infrastructure
```

Decision for the MVP: **no separate NestJS backend**. Supabase accelerates the
MVP while domain, validations, functions, and contracts are kept clean and
decoupled so critical pieces can migrate to a dedicated backend later
(see `docs/adr/0001-bootstrap-with-supabase.md`).

Layering (frontend):
- `integrations/` — thin Supabase client (auth, db, storage), no business logic
- `services/` — data access, single source of queries
- `hooks/` — small, focused hooks that compose services
- `pages/` — routes, compose feature components
- `components/` — presentational/feature components, no duplicated logic

Critical business rules live in the **data layer** (PostgreSQL constraints,
triggers, RLS) and, where needed, in Edge Functions — never only in React.

## 2. Modules

| Module       | Purpose                                                        |
| ------------ | -------------------------------------------------------------- |
| Dashboard    | KPIs, pending tasks, alerts                                    |
| Trucks       | Fleet registry, drivers, capacity, status                      |
| Cargo        | Shipments/items/lots tracking and lifecycle                    |
| Warehouse    | Locations, zones, bins, lot stock                              |
| Scanner      | Barcode/QR capture of lots at checkpoints                      |
| Scale        | Weighing checkpoint, tolerance validation                      |
| Quarantine   | **Rezago** cases and resolution                                |
| Seizure      | **Secuestro** records and legal handling                       |
| Movements    | Event trail of lots and movements                              |
| Reports      | Operational and traceability reports                           |
| Audit        | Full audit log browser                                         |
| Settings     | Roles, permissions, catalog/configuration                      |

Details: `docs/product/README.md`, `docs/domain/entities.md`.

## 3. Entities (overview)

- `operator` — internal users with roles
- `party` — carrier, shipper, client (counterparty catalog)
- `driver` — conductor registry (external, not an app user)
- `truck` — vehicle carrying goods
- `cargo` — a shipment/load being tracked
- `cargo_item` — merchandise line with total quantity (1000 units example)
- `item_lot` — quantized lot (quantity, location, state; parent for splits)
- `warehouse_location` — zone/bin/hierarchy for storage (+ checkpoints)
- `checkpoint_event` — immutable event (arrival/split/scan/scale/hold/…) spine
- `scale_reading` — weight record tied to a lot
- `quarantine_case` — **rezago** goods held pending resolution
- `seizure_record` — **secuestro** goods seized, blocked
- `document` — file attachment (manifest, photo) kept in Storage
- `audit_log` — admin/relevant changes with actor and reason

Full model with enums and relations: `docs/domain/entities.md`.

## 4. Dependencies

Frontend: `react`, `react-router` (or file-based routing), `@supabase/supabase-js`,
`tailwindcss`, `lucide-react`, `@radix-ui/*` (via shadcn/ui), `zod` (validation),
`date-fns`.

Data: Supabase (PostgreSQL, Auth, Storage), Deno Edge Functions.

Tooling: Vite, TypeScript strict, ESLint, Vitest + Testing Library, GitHub Actions.

Details and versioning policy: `docs/architecture/dependencies.md`.

## 5. Routes

```
/dashboard
/trucks                 /trucks/:id
/cargo                  /cargo/:id
/warehouse              /warehouse/:locationId
/scanner
/scale
/quarantine             /quarantine/:caseId
/seizure                /seizure/:recordId
/movements
/reports
/audit
/settings
```

Detail: `docs/ux/routes-and-components.md`.

## 6. Component structure

```
src/
├── components/
│   ├── ui/            # shadcn/ui primitives
│   ├── layout/        # app shell, nav, headers
│   ├── map/           # map visualization
│   ├── trucks/        # truck feature components
│   ├── cargo/         # cargo feature components
│   ├── warehouse/     # warehouse feature components
│   ├── movements/     # movement trail components
│   └── shared/        # cross-cutting presentational components
├── pages/             # route-level compositions (one per module)
├── hooks/             # small focused hooks
├── services/          # data access layer (single source of queries)
├── lib/               # utilities, formatters, validators
├── types/             # strict domain and DTO types
├── config/            # app, feature flags, env schema
└── integrations/      # Supabase client, third-party adapters
```

No giant components, no giant hooks, no single global logic layer.

## 7. Database structure

PostgreSQL under Supabase, `auth.users` for identities, all business tables
tenant/org-scoped. Key structures:

```
operators (id, user_id -> auth.users, role, org_id, status)
parties (id, org_id, type, name, tax_id, contacts)
drivers (id, org_id, party_id, full_name, document_id, license_no, status)
trucks (id, org_id, plate, carrier_party_id, capacity_kg, status)
cargo (id, org_id, code, truck_id, driver_id, origins, status, ...)
cargo_items (id, cargo_id, line, sku, total_quantity, uom, status)
item_lots (id, cargo_item_id, parent_lot_id, quantity, location_type, status)
warehouse_locations (...), checkpoint_events (...), scale_readings (...)
quarantine_cases (...), seizure_records (...), documents (...), audit_log (...)
```

Design principles: immutable event log, quantity-balance trigger on lots
(ADR 0003), soft-deletes avoided, timestamps from DB (`timestamptz`), UUID
primary keys, every mutating table carries `created_by`/`updated_by` plus change
history. Full DDL sketch: `docs/architecture/database.md`.

## 8. Permission strategy

Security by design with **RLS enabled on every table** by default (no
`bypassrls` for the data API). Roles and capabilities:

| Role                | Scope                            |
| ------------------- | -------------------------------- |
| `admin`             | Settings, users, roles, config   |
| `supervisor`        | Quarantine/seizure decisions     |
| `operator`          | Movements, cargo, warehouse      |
| `guard`             | Scanner/checkpoint events        |
| `auditor`           | Read-only audit/reports          |

Policies are written per table (SELECT/INSERT/UPDATE/DELETE) and denied unless
explicitly granted. Storage buckets are private; documents accessible via
signed URLs. See `SECURITY.md` and `docs/security/rls.md`.

## 9. Technical risks

| Risk                                     | Mitigation                                            |
| ---------------------------------------- | ----------------------------------------------------- |
| Vendor coupling with Supabase            | Clean abstractions (contracts layer in stage 2)       |
| RLS misconfiguration → data leak         | Default-deny policies, review checklist, tests        |
| Scanner/scale hardware integration       | Adapter interfaces, tolerant input, manual fallback   |
| Event log growth / performance           | Indexing, partitioning plan, retention policy         |
| Immutability vs corrections              | Correction events, never in-place UPDATE of the log   |
| Migration to dedicated backend           | Domain isolated from transport, contracts-first       |
| Lovable generation drift                 | Versioned docs, ADR decisions, CI checks             |

Full analysis: `docs/architecture/risks.md`.