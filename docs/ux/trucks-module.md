# Trucks Module — UX Specification (Fase 7)

User-facing behavior of the truck (CAMIONES) module. Architecture and data
model: `docs/architecture/database.md`, `docs/domain/entities.md`
(Truck); catalog resolution and derivation rules: `docs/adr/0008-truck-module-derived-status.md`.

## Route map

```
/trucks                          — TruckList (this spec)
/trucks/:id                      — TruckDetails (drawer or page)
```

Entry points: main nav "Camiones" (role-gated, see Guard table).

| Route | Required permission (Fase 6 rbac) |
| ----- | -------------------------------- |
| `/trucks` | `truck.read` |
| `/trucks/:id` | `truck.read` |
| Create dialog | `truck.create` |
| Edit dialog | `truck.update` |
| Egress action (Details) | `truck.exit` |

## TruckList

```
┌──────────────────────────────────────────────────────────────────┐
│ Camiones — (count when full page)                                 │
│ [Buscar…]  [Estado: Todos ▾]  [Ordenar: Patente ▾]  [+ Nuevo]     │
├──────────────────────────────────────────────────────────────────┤
│ TruckCard ── TruckCard ── TruckCard ── TruckCard                  │
│ (grid of cards; "Cargar más" at the end)                          │
└──────────────────────────────────────────────────────────────────┘
```

- **Search** (`Buscar…`): debounced (300 ms) substring match on `plate`.
- **Filter** (`Estado`): fleet base status from `trucks.status` —
  `available`, `in_playon`, `in_route`, `out_of_service`, `inspection`.
  (Display states are derived per card; the filter targets the stored base
  status only.)
- **Sort**: `plate` (asc/desc), `transport_company`, `status`;
  default `plate asc`. Sorting is by the stored base status, not the badge.
- **Pagination / lazy load**: page size 20, cursor/offset on `plate`;
  infinite list with `Cargar más`. Row count is fetched only when the
  rendered page is full (per ADR 0008 §4), never on first paint.
- **Create** (`+ Nuevo`): `TruckCreateDialog`; visible for users with
  `truck.create`; disabled (tooltip) otherwise.

## TruckCard

Summary card per truck:

- `plate` (primary), base `status` label, `transport_company` name when set;
- **`TruckStatusBadge`** — 13-code display state, derived (see below);
- quick fields: `capacity_kg`, `organization` when the actor may see it.

Card opens `/trucks/:id` (TruckDetails). Card otherwise contains no
writable fields.

## TruckDetails

Opened by clicking a card. Shows:

- Header: `plate`, base status, badge, edit action (`TruckEditDialog`,
  `truck.update`) and **Salida** (egress) action when `truck.exit` and the
  truck has no open operations.
- Fields read-only: `transport_company`, `organization`, `capacity_kg`,
  base `status`.
- **Fechas**: **ingreso** = first `arrival` movement timestamp (derived),
  **egreso** = last `egress` movement timestamp (derived). There are **no**
  editable entry/exit date fields — entry and exit are movements on the
  audit spine (ADR 0008 §3).
- **TruckTimeline** — movement spine read for this truck (kind, timestamp,
  operator, origin/destination, references), newest first, capped at
  latest 50 rows with "Ver más".
- **Observaciones**: free-text observations shown as a read-only list;
  add/edit requires `truck.update`.

## TruckCreateDialog / TruckEditDialog

| Field | Create | Edit | Notes |
| ----- | ------ | ---- | ----- |
| `plate` | required | required | unique; formatted uppercase |
| `transport_company` | optional select | optional select | from `transport_companies` (`truck.read`) |
| `organization` | required (create) | read-only | scoped to actor org |
| `capacity_kg` | optional number | optional | ≥ 0 |
| `status` (base) | `available` default | editable | 5 fleet codes only |
| `entry_at` / `exit_at` | **never shown** | **never shown** | movements only (ADR 0008) |

Validity: `plate` present and unique (server returns 409 on conflict);
create requires `truck.create`, save requires `truck.update`. All writes go
through RLS + Edge Function permission re-check (ADR 0007).

## TruckStatusBadge (13 display codes → derivation)

Derivation precedence (first match wins, evaluated against read-only
signals; full map in `docs/domain/states.md` §truck_status display map):

| # | Display code | Shows when |
| -- | ------------ | ---------- |
| 1 | `RETAINED` | open `quarantine_operations` |
| 2 | `SEIZED` | open `seizure_operations` |
| 3 | `IN_SCANNER` | open `scanner_operations` |
| 4 | `IN_SCALE` | open `scale_operations` |
| 5 | `PARTIALLY_UNLOADED` | discharge/split movements exist and on-truck `item_lots` remain |
| 6 | `UNLOADED` | discharge/split complete, no on-truck lots |
| 7 | `IN_PROCESS` | latest movement is discharge/split/transfer/store and open |
| 8 | `READY_TO_EXIT` | base `available` + no open ops + cargo released |
| 9 | `WAITING` | base `available` + latest arrival, no open ops yet |
| 10 | `EXPECTED` | transport manifest created, no `arrival` yet |
| 11 | `ARRIVED` | latest movement `arrival`, no subsequent movement |
| 12 | `IN_PLAYON` | base `in_playon` (fleet state) |
| 13 | `EXITED` | latest movement `egress` |
| — | `IN_ROUTE` / `OUT_OF_SERVICE` / `INSPECTION` | direct pass-through of base status when no movement/op applies |

The badge is a **UX projection only**; the server-side authority is RLS +
Edge Functions. Exact branch order and capping rules are codified as QA
cases in `docs/qa/truck-module-tests.md`; implementation must not persist
any of these 13 codes.

## TruckTimeline

Read-only list of `movements` for the truck (kind label, `created_at`,
actor, origin/destination references, doc numbers when present). Row links
to related module records where the actor has read permission. No write
actions in the timeline (movements are append-only, ADR 0004).

## Empty and error states

- Empty list: "No hay camiones" + create CTA (if `truck.create`).
- Search no-results: "Sin resultados para «{query}»".
- Load failure: retry CTA; keep already-rendered cards.
- Insufficient permission on a nested link: route guard redirects to the
  list; RLS guarantees empty sets server-side regardless of UI.

## Loading and measurement targets

- First page ≤ 2 s p95 on 50k truck rows; subsequent pages ≤ 1 s (cursor on
  `plate`).
- Badge derivation: client-side only over already-fetched signals — no
  extra query per card beyond the list projection.
- Count queries: only on full-page condition (ADR 0008 §4); never on mount.