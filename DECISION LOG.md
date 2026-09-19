# DECISION LOG

Architecture Decision Records (ADRs) for Cargo Control. Every significant
change to the project must be recorded here and/or as an ADR file under
`docs/adr/`. Before modifying existing decisions, review impacted dependencies.

## Index

| # | Decision                                     | Status     | Date       |
| - | -------------------------------------------- | ---------- | ---------- |
| 1 | Bootstrap on Supabase, no separate NestJS backend for MVP | Accepted | 2026-09-19 |
| 2 | Four-repo layout (`web`, `docs`, `infrastructure`, `contracts` later) | Accepted | 2026-09-19 |
| 3 | RLS default-deny with per-role policies | Accepted | 2026-09-19 |
| 4 | Immutable, append-only checkpoint event log | Accepted | 2026-09-19 |
| 5 | English for all technical artifacts and code | Accepted | 2026-09-19 |
| 6 | Brand system: token-based design system, Inter, Lucide, status semantics | Accepted | 2026-09-19 |
| 7 | Quantity + lots merchandise model (item_lot), partial discharge with on_truck remnant | Accepted | 2026-09-19 |
| 8 | Physical location vs visual layout separation (facilities/locations vs layouts/elements) | Accepted | 2026-09-19 |
| 9 | Movement spine + specialized operations; Fase 3 table renames | Accepted | 2026-09-19 |
| 10 | Floor plan editor element taxonomy + schema v2 (physical/visual sync via layout scale) | Accepted | 2026-09-19 |
| 11 | Capacity & occupancy: derived occupancy, DB-enforced guard, audit (ADR 0006) | Accepted | 2026-09-19 |
| 12 | Identity & access (ADR 0007): Supabase Auth + permission-driven RLS, 7 roles (guard split), 20-permission catalog, server-side enforcement | Accepted | 2026-09-19 |
| 13 | CAMIONES trucks module (ADR 0008): 13 display states derived (5 fleet base kept), entry/exit as movements, lazy loading | Accepted | 2026-09-19 |
| 14 | CARGAMENTOS cargo module (ADR 0009): divisible merchandise via item lots + movement spine, currentLocation derived, category/observations columns (v4) | Accepted | 2026-09-19 |
| 15 | Motor de movimientos movement engine (ADR 0010): transactional contract over the spine, return_to_truck kind, operation_key idempotency (v5) | Accepted | 2026-09-19 |

## Record 1 — Bootstrap on Supabase (no NestJS)

**Context:** need to accelerate the MVP without pre-mature backend overhead.

**Decision:** Use Supabase (PostgreSQL, Auth, RLS, Storage, Edge Functions) as
backend/data. Keep domain logic clean and decoupled so critical pieces can
migrate to a dedicated backend later.

**Consequences:** fast MVP; vendor coupling must be actively contained via the
integration layer and future `contracts` repo. See `docs/adr/0001-bootstrap-with-supabase.md`.

## Record 2 — Repository layout

**Context:** plan calls for separated, independently versioned repositories.

**Decision:** Maintain `cargo-control-web`, `cargo-control-docs`,
`cargo-control-infrastructure`, and prepare `cargo-control-contracts` for stage 2.

**Consequences:** clean boundaries; requires CI coordination across repos.

## Record 3 — RLS default-deny

**Context:** multi-tenant data with sensitive goods logs.

**Decision:** RLS on every table; policies granted explicitly per role; no
`bypassrls` for the data API.

**Consequences:** strong default security; policy review checklist required
before schema changes.

## Record 4 — Immutable event log

**Context:** traceability demands that history cannot be silently rewritten.

**Decision:** `checkpoint_events` is append-only; corrections are new events.

**Consequences:** guaranteed auditability; storage growth handled by retention
and partitioning.

## Record 5 — English artifacts

**Context:** convention for code, docs and commit messages.

**Decision:** All technical artifacts (code, identifiers, UI copy, docs, commits)
are written in English. Conversation with the user stays in the user's language.

**Consequences:** consistent, contribution-friendly output.

## Record 6 — Brand system (token-based)

**Context:** Fase 1 requires a defined visual identity before UI implementation.

**Decision:** Establish the design system: palette Primary `#1F4E5F`,
surface/bg neutrals, physical-zone mapping (warehouse `#F5F0D6`, warehouse area
`#E1BA84`, playón `#D5D7D8`), status colors
(success/info/warning/danger/blocked), Inter typography, Lucide icons, and a
full token architecture (`--cc-*`). Components are specified in
`docs/brand/components.md`; implementation targets `cargo-control-web`.

**Consequences:** zero arbitrary colors; any palette change requires updating
`colors.md` + `design-tokens.md` and a decision log entry. See
`docs/adr/0002-brand-system.md`.

## Record 7 — Quantity + lots merchandise model

**Context:** Fase 2 domain definition requires merchandise that can be split
into any quantities (1000 units → 300/250/150/100/100/100) and a truck that can
keep part of the load (partial discharge, remnant on truck).

**Decision:** Model merchandise as `cargo_item` (line with `total_quantity`)
whose quantities are allocated into **lots** (`item_lot`: quantity, location,
state, `parent_lot_id` for chained splits). Balance invariant
Σ leaf lots = item total, enforced by trigger. Stock state lives at lot level;
cargo status is a rollup. Introduce `driver` registry; `on_truck` remnant via
`location_type=truck`.

**Consequences:** natural fit for arbitrary splitting and partial discharge;
event volume grows with lots (mitigated in `docs/architecture/risks.md`);
replaces the atomic-`cargo_unit`-only model (barcode scanning remains a
secondary option per lot). See `docs/adr/0003-item-lot-quantity-model.md`.

## Record 8 — Physical location vs visual layout separation

**Context:** the warehouse map must be freely editable without ever touching
operational truth. Fase 2's `warehouse_location` merged both concerns and
could not express multiple maps, decorations, or a visual change that never
alters stock.

**Decision:** two independent submodels. `facilities` + `locations` own
capacity and operational rules (occupancy/inventory derived from `item_lots`);
`layouts` + `layout_elements` own presentation only (`x/y/width/height/
rotation/color/icon/z_index`), optionally linked to a location. Layout data
never holds operational values; location data never holds visual values; a
location may appear in zero or many layouts; archiving a location never
removes its markers.

**Consequences:** layout edits are zero-risk for stock; single source of truth
via the ADR 0003 balance invariant; one extra join when rendering markers.
See `docs/adr/0004-location-vs-layout-separation.md`.

## Record 9 — Movement spine + specialized operations (Fase 3 renames)

**Context:** Fase 3 prompt required a data model with `Movement`/`MovementItem`
and four operation types, plus a cleaner tenancy (Organization → Facility).

**Decision:** keep the append-only event spine but normalize it:
`checkpoint_events` becomes `movements` (1 movement may affect several lots)
with per-lot detail in `movement_items`. Device/detail data moves to
specialized operation tables (`scanner_operations`, `scale_operations`,
`quarantine_operations`, `seizure_operations`) that reference a movement.
Tenancy gains `facilities` (multi-facility/multi-warehouse ready); identity
gains `roles`/`permissions` via join tables; `drivers`/`trucks` belong to
`transport_companies`; `cargo` becomes `cargo_manifests`; `documents` become
`attachments`. ADR 0003 (`item_lots`) and the RLS default-deny policy are
preserved. Full map: `docs/architecture/database.md` §7.

**Consequences:** normalized multi-lot events and per-operation detail without
polluting the spine; entity vocabulary now matches the Fase 3 prompt while
Fase 0–2 documents remain translatable via the rename map.

## Record 10 — Floor plan editor: element taxonomy + schema v2

**Context:** Fase 4 requires a data-driven floor plan editor whose elements
have identity, physical dimensions (meters), capacity, visual properties
(pixels) and operational flags — with a taxonomy spanning places and
architectural features (`playon | warehouse | storage | scanner | scale |
quarantine | seizure | corridor | door | other`). The Fase 3 draft's
`layout_elements.kind` and forced marker↔location link could not express
visual-only elements (doors, corridors).

**Decision:** adopt the editor taxonomy as `layout_elements.element_type`
(replacing `kind`); place types require a linked `location`, while corridor/
door/other may be visual-only. Physical dimensions and capacity live only on
`locations` (`physical_width/height/depth`, `physical_unit`,
`capacity_max_units/kg/volume_m3`); visual fields live only on
`layout_elements` (`x/y/visual_width/visual_height/rotation/z_index/color/
icon`), plus editor state `is_locked`/`is_visible`. `isActive` maps to
`locations.active`. The only bridge between meters and pixels is
`layouts.scale` (px/m), used read-side. Deleting an element never deletes its
location; duplicating a place clones both.

**Consequences:** schema evolves to v2 (pre-implementation, no migration);
one taxonomy drives editor defaults (icons/colors) and the link rule; the
editor structurally cannot corrupt stock truth. See
`docs/adr/0005-floor-plan-editor-taxonomy.md` and
`docs/architecture/floor-plan-editor.md`.

## Record 11 — Capacity & occupancy: derived occupancy, DB guard, audit

**Context:** Fase 5 requires per-location capacity in three dimensions (kg,
m³, units) with max/used/available/% display; negative quantities or
capacities, occupancy above capacity, and capacity reductions below current
occupancy are forbidden; every capacity change must be audited. There was no
per-lot volume source, and the invariants needed an enforcement home.

**Decision:** keep occupancy **derived** from `item_lots` at rest at the
location (D7) — weight = Σ qty × unit_weight, volume = Σ qty × unit_volume,
units = Σ qty with `uom='unit'`; holds count, trucks don't; missing
weight/volume data is flagged, not zeroed. Add `unit_volume_m3` to
`cargo_items`/`item_lots` (schema v3) as the volume source. Enforce in the
database: `CHECK` on quantity and capacity; a placement guard trigger
(serialized per location via row lock) rejects overflow; a capacity guard
rejects reduction below occupancy; `NULL` capacity = unlimited; occupancy ==
capacity allowed. Every accepted capacity change appends an `audit_log`
`capacity.set` row; rejected attempts write nothing and are not audited.

**Consequences:** the four metrics are pure read-side projections; the editor
and app layer cannot corrupt occupancy (it is never written). Placement guard
is fully effective only where weight/volume data exists, motivating capture of
`missing_*` lots. Small v3 delta (2 columns + view + 3 triggers), no renames.
See `docs/adr/0006-capacity-occupancy-invariants.md`,
`docs/domain/capacity-occupancy.md`, `docs/qa/capacity-occupancy-tests.md`.

## Record 12 — Identity & access (ADR 0007)

**Context:** Fase 6 requires authentication (login, logout, session
persistence, password recovery, expiration, protected routes) backed by
Supabase Auth, plus an RBAC with seven roles against an explicit permission
catalog. Permission decisions must never rely on the React client alone.

**Decision:** Supabase Auth owns identity (`auth.users` is the identity
store; `public.users` profile created 1:1 by `on_auth_user_created`
trigger). RLS is **permission-driven** via two helpers — `has_permission(_code)`
(business tables, org-scoped by construction) and `has_role(_role)`
(tenant tables) — so grants change as **data** in `role_permissions`, never
by editing policies. Roles: `admin | supervisor | operator | scanner_operator
| scale_operator | auditor | viewer` (`guard` splits into
scanner/scale operators; `viewer` is new). Permission catalog: 20 codes
(`truck.*`, `cargo.*`, `warehouse.*`, `scanner.*`, `scale.*`,
`quarantine.*`, `seizure.*`, `audit.read`). Movement spine is INSERT-only
with a kind → permission map; `audit_log` SELECT for `audit.read`, INSERT
trigger-only. Edge Functions decode the JWT, set the `app.actor_id` GUC and
re-check permissions server-side — defense in depth (function first, RLS
last; client route guards are UX only).

**Consequences:** grant changes are data migrations; policy count stays
small; the old five-role matrix is replaced; cross-org isolation is
structural via `has_permission`. Cost: each RLS check runs a small
users → roles → permissions join chain, acceptable at MVP scale. See
`docs/adr/0007-identity-access-supabase-auth.md`,
`docs/security/authentication.md`, `docs/security/rbac.md`,
`docs/security/authorization.md`, `docs/security/rls.md`,
`docs/qa/security-tests.md`.

## Record 13 — CAMIONES trucks module (ADR 0008)

**Context:** Fase 7 requires the truck module UI (`TruckList`, `TruckCard`,
`TruckDetails`, create/edit dialogs, `TruckStatusBadge`, `TruckTimeline`)
with search, filters, sorting, pagination, and auditable truck entry/exit.
The prompt lists 13 truck states, but the repo authority (Fase 3/5/6) models
`trucks.status` as a 5-code **fleet base status** and treats arrival/egress
and all operations as rows on the append-only movement spine.

**Decision:** keep `trucks.status` as the fleet base status (5 codes,
unchanged CHECK). The 13 prompt states are **display-tier projections**
computed read-side by `TruckStatusBadge` from base status × latest movement ×
open operations (precedence map in `docs/domain/states.md`); none are
persisted. Truck entry and exit are `arrival`/`egress` **movements** on the
spine — auditable, never editable date/status columns (no `entry_at` /
`exit_at`). `TruckList` lazy-loads (page 20, cursor on `plate`; count fetched
only when the rendered page is full). Permissions reuse the Fase 6 catalog
(`truck.read/create/update/exit`) — **no new codes, no policy edits**.

**Consequences:** no schema migration for Fase 7; operational state is
derived so the UI cannot lie and egress stays server-authorized; the 13
display codes are a UI/QA contract, not a DB contract; list performance
scales without full-table scans. See
`docs/adr/0008-truck-module-derived-status.md`,
`docs/ux/trucks-module.md`, `docs/domain/states.md` (§truck_status display
map), `docs/qa/truck-module-tests.md`.

## Record 14 — CARGAMENTOS cargo module (ADR 0009)

**Context:** Fase 8 requires the cargo module UI with per-item fields
(description, category, quantity, unit, weight, volume, identifier, status,
currentLocation, observations), create/edit/view/split/transfer, and
explicitly divisible merchandise with traceability via movements (origin,
destination, quantity, user, date, truck, merchandise, observations).

**Decision:** the module is spec + QA **over the existing ADR 0003 model** —
`item_lots` (traceability quantum, Σ leaf = `total_quantity` invariant
trigger) and the append-only movement spine already deliver divisibility
(100 → 40/30/20/10) and full traceability. Added two nullable columns to
`cargo_items` (schema v4): `category` (display/grouping label, not an
authorization axis) and `observations` (item-level notes; operation
observations stay in `movement_items.notes` / `movements.reason`).
`currentLocation` is **derived from active lot placement, never stored**;
`identifier` maps to existing `sku`. Split = `split` movement
(`cargo.update`), transfer = `transfer` movement (`cargo.transfer`) — both
append-only, server-authorized. No new permission codes, no policy edits.

**Consequences:** small v4 delta (2 nullable columns, no migration);
divisible merchandise and traceability are structural (cannot lose quantity,
cannot be hand-edited); currentLocation cannot go stale; QA written against
existing invariants and the kind map. See `docs/adr/0009-cargo-module-divisible-merchandise.md`,
`docs/ux/cargo-module.md`, `docs/domain/entities.md` (Cargo),
`docs/architecture/database.md` §4.6, `docs/qa/cargo-module-tests.md`.

## Record 15 — Motor de movimientos movement engine (ADR 0010)

**Context:** Fase 9 (Prompt 10) requires the movement core: every physical
modification produces a movement; never edit location directly; transfers
validate availability, destination capacity, source/destination state and
permissions; critical operations transactional; avoid negative inventory,
double transfer, over capacity, duplicate operation; a timeline read
(origin, destination, quantity, date, user) and audit.

**Decision:** the engine is a **contract over the existing append-only
spine** (ADR 0004) plus capacity guards (ADR 0006) and the kind → permission
map (ADR 0007). All prompt types map to existing kinds except
`RETURN_TO_TRUCK`, added as a new CHECK constant `return_to_truck` (remnant
back on a truck without egress; maps to `cargo.transfer`). Movement status
is **applied = persisted**; rejected attempts never persist as movements and
are recorded in `audit_log` (outcome `failed` + reason + `operation_key`).
Schema v5 delta: one CHECK constant, nullable `movements.operation_key`
with a partial unique index per org (idempotency → duplicate replay
rejected), timeline covered by the existing `movements_org_time_idx`
(asserted — no extra index). Concurrency safety = row locks `FOR UPDATE`
(same proven pattern as the ADR 0006 capacity guard). No policy edits, no
new permission codes.

**Consequences:** engine operations are all-or-nothing (no partial state);
double transfer and over-capacity races serialize at the lock and reject
the loser; retries are safe via `operation_key`; the timeline and audit
reads reuse existing RLS. Concurrency and edge cases specified as ME-*
scenarios. See `docs/adr/0010-movement-engine.md`,
`docs/architecture/movement-engine.md`, `docs/ux/movements-timeline.md`,
`docs/qa/movement-engine-tests.md`.