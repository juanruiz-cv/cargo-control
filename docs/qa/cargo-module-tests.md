# Cargo Module — Test Specification (Fase 8 / Prompt 09)

Executable as SQL scripts (database layer) and E2E cases
(`docs/qa/strategy.md`, Playwright against Supabase local when the web
client exists). Builds on the Fase 6 security spec
(`docs/qa/security-tests.md`; references S-*) and the Fase 5 capacity spec
(`docs/qa/capacity-occupancy-tests.md`; references C-* conflict — here
renamed M-*). Marked **[E2E]** run against the UI; everything else runs
against the database layer.

Fixture: org `o1` with `u_admin`, `u_op` (operator), `u_viewer`; locations
`Sector 3`, `Sector 7`, `Scanner`, `Balanza`; `cargo.*` permissions and
kind → permission map from `docs/security/rbac.md` /
`docs/security/authorization.md`.

## A. Divisibility — item lots + Σ invariant (database layer)

The canonical scenario from the module prompt: a truck arrives with **100
units** and they split as **40 → Sector 3, 30 → Sector 7, 20 → Scanner,
10 → Camión (remanente)**.

| ID | Scenario | Expected |
| -- | -------- | -------- |
| M-01 | create item with `total_quantity = 100`, `uom = unit` | one `cargo_item`; one seed lot of 100 (`on_truck`) |
| M-02 | split lot 100 → 40 (Sector 3) | `split` movement row; child lot 40 at `current_location_id = Sector 3`; parent remains 60 (`on_truck`) — **no** aggregate "quantity per sector" column |
| M-03 | split remaining 60 → 30 (Sector 7), 30 (remnant) | second `split` movement; lots 40/30/30; Σ leaf = 100 |
| M-04 | split remnant 30 → 20 (Scanner), 10 (Camión) | third `split`; lots 40/30/20/10; Σ leaf = 100 still |
| M-05 | Σ leaf invariant enforced at every split | trigger rejects any operation leaving Σ ≠ `total_quantity` (ADR 0003) |
| M-06 | partial discharge analogue | lot on truck can be progressively reduced (40→30→20→10 style) — every mutation is a movement, never a direct quantity edit on the source |
| M-07 | quantity on any lot > parent source at split | **rejected** (cannot create quantity) |
| M-08 | split destination inactive/frozen location | **rejected** (transfer rule, `flows.md`) |
| M-09 | item without placements | item fields only; no lots; rolls up as "Sin lotes activos" |

## B. Traceability via movements — every operation conserves the contract

Per prompt: origin, destination, quantity, user, date, truck, merchandise,
observations.

| ID | Operation | Movement row assert |
| -- | --------- | ------------------- |
| M-20 | split (M-02..M-04) | `movements.kind='split'`; `movement_items`: `item_lot_id`, `quantity`, `from_truck_id/from_location_id`, `to_location_id`, `notes` (observations); `operator_id` (user); `occurred_at` (date) |
| M-21 | transfer lot | `movements.kind='transfer'`; `movement_items` from → to; `operator_id`; `occurred_at`; `notes` |
| M-22 | manifest/truck link | each movement resolves to the manifest's `truck_id` (plate) and the `item_lot_id` (merchandise) |
| M-23 | audit trail | `audit_log` rows exist for each movement actor/action (Fase 5/6 audit) |
| M-24 | append-only | UPDATE/DELETE on `movements`/`movement_items` → **permission denied** (S-24 pattern); corrections are new chained rows |
| M-25 | item edit does NOT mutate lots | `cargo.update` on item fields never changes lot placements; placement changes require split/transfer |

## C. Derived currentLocation

| ID | Scenario | Expected |
| -- | -------- | -------- |
| M-30 | `cargo_items` schema | has **no** `current_location` / `currentLocation` column (ADR 0009 §4) |
| M-31 | item with lots 40/30/20/10 | placements rollup: Sector 3 ×40, Sector 7 ×30, Scanner ×20, Camión ×10 — read from `item_lots` |
| M-32 | transfer a lot → new location | rollup updates immediately after movement (indexed by `cargo_item_id`); no stale UI state |
| M-33 | `category`, `observations` columns exist | nullable; `category` not an authorization axis (no RLS/Case on it) |

## D. Permissions — module UI and API

| ID | User | Action | Expected |
| -- | ---- | ------ | -------- |
| M-40 | u_op | open `/cargo` | list renders (`cargo.read`) |
| M-41 | u_viewer | open `/cargo` | empty list, no error |
| M-42 | u_op | create manifest/item | OK (`cargo.create`) |
| M-43 | u_viewer | POST create item (raw API) | **403 / empty** (S-14 default deny) |
| M-44 | u_op | edit item description | OK (`cargo.update`) |
| M-45 | u_op | split dialog | OK (`cargo.update`) |
| M-46 | u_op | transfer dialog | **denied** — `cargo.transfer` not granted to operator (S-16 pattern) |
| M-47 | u_admin | transfer | OK (`cargo.transfer`) |
| M-48 | u_viewer | split/transfer buttons | not rendered (cosmetic); API denies anyway |
| M-49 | org isolation | `u_other` (o2) opens o1 item URL | empty/404 (S-13) |

## E. UI flows [E2E]

| ID | Scenario | Expected |
| -- | -------- | -------- |
| M-50 | open `/cargo` | manifest cards; lazy load (page 20, `Cargar más`); count only when full page |
| M-51 | search by description/sku | debounced (300 ms); results by `arrival_date desc` |
| M-52 | manifest detail | header + items table; placements column shows derived rollup |
| M-53 | SplitDialog 100 → 40/30/20/10 | wizard: 3 splits; Σ invariant visible after each ("Restante: 60 / 30 / 10") |
| M-54 | edit dialog | category/observations editable; **no** currentLocation/status fields (S-35 analogue for cargo) |
| M-55 | movements timeline | newest first; links gated by actor read; no write actions |

## F. Schema asserts (database layer)

| ID | Assert |
| -- | ------ |
| M-60 | `cargo_items` has `category`, `observations` (nullable) |
| M-61 | `cargo_items` has **no** current-location column |
| M-62 | `item_lots` invariant trigger present (Σ leaf = total_quantity) |
| M-63 | `movements.kind` CHECK includes `split`, `transfer`, `store`, `load_out` |
| M-64 | RLS matrix rows for `cargo_manifests`/`cargo_items`/`item_lots` unchanged (no Fase 8 edit) |

## G. Update flow / work unit boundary

These spec cases are the QA verification for the Fase 8 work units; they run
after the web client is implemented (later per master plan). Until then, the
database-layer asserts (A, B, C, F) are the executable subset against a
Supabase local instance.