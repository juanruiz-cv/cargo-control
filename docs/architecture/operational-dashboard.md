# Operational Dashboard — Architecture Specification (Fase 12 / Prompt 13)

The dashboard is a **server-side aggregation layer** over the existing
model. It exposes real, derived metrics as aggregated rows — the client
never receives raw history to compute statistics.

## Metric derivations

| KPI | Derivation | Source |
| --- | ---------- | ------ |
| Camiones dentro del predio | trucks arrived, no egress yet (`ARRIVED`, `IN_PLAYON`, `IN_PROCESS`, `PARTIALLY_UNLOADED`, `UNLOADED`, `WAITING`, `READY_TO_EXIT`, open-ops codes after arrival) | display map (ADR 0008) |
| Camiones esperando | display code `WAITING` (base `available` + latest movement `arrival`, no open ops yet) | display map (ADR 0008) |
| Descargas en proceso | display codes `IN_PROCESS` / `PARTIALLY_UNLOADED` | display map (ADR 0008) |
| Mercadería almacenada | `item_lots` with `status = 'in_warehouse'` (sum qty/weight) | item_lots |
| Mercadería en Scanner | pending queue `station_queue` kind = scan | derived view (Fase 10) |
| Mercadería en Balanza | pending queue `station_queue` kind = scale | derived view (Fase 10) |
| Mercadería en Rezago | open quarantine holds with lot context `hold_open` | derived view (Fase 10) |
| Mercadería Secuestrada | open seizure holds with lot context `hold_open` | derived view (Fase 10) |
| Sectores ocupados | `location_occupancy` with occupancy > 0 on any known dimension | derived view (Fase 5) |
| Sectores libres | `location_occupancy` with occupancy = 0 | derived view (Fase 5) |

All KPIs share source tables with the operational screens (map, module
routes), so the dashboard and the rest of the app never disagree.

## Chart series (aggregated server-side)

| Chart | SQL shape | Notes |
| ----- | --------- | ----- |
| Ingresos por día | `SELECT liquidity_day, count(*) FROM movements WHERE kind='arrival' GROUP BY 1 ORDER BY 1` | day of `occurred_at` in facility timezone; window default 30d |
| Movimientos | `SELECT liquidity_day, kind, count(*) FROM movements GROUP BY 1,2 ORDER BY 1,2` | bounded window + optional kind filter |
| Ocupación | `location_occupancy` pct (kg/m³/units) per location | snapshot; series = locations trend over window end-points |
| Camiones procesados | trucks whose latest movement at day D is `egress` (or per-day egreso count) | count distinct truck per day |
| Mercadería procesada | `SUM(movement_items.quantity)` per day | movement_items join movements; window default 30d |

Time bucketing uses a single facility-timezone function so day
boundaries are consistent across charts (see `day_bucket(ts)` helper
view contract).

## Aggregation views (schema v8 — derived, read-only, no new columns)

Defined in `docs/architecture/database.md` §Schema v8:

- `dashboard_metrics` — the 10 KPI values as one row per organization
  (counts + sums from the derivations above).
- `dashboard_series_arrivals`, `dashboard_series_movements`,
  `dashboard_series_trucks_processed`,
  `dashboard_series_merchandise_processed` — aggregated day rows.
- `dashboard_occupancy_snapshot` — occupancy pct rows from
  `location_occupancy` for the dashboard cards.

All are `security_invoker`-style views filtered by the caller's
organization through existing RLS; they expose **only aggregated rows**
and never raw movements.

## Query optimization contract

1. Aggregation runs in PostgreSQL (`GROUP BY` in the views), not in the
   client. The client requests a series (dimension + window), receives
   aggregated rows.
2. Indices already cover the paths:
   `movements_org_time_idx (organization_id, occurred_at desc)`,
   `item_lots_status_idx`, `item_lots_location_idx`,
   `item_lots_truck_idx`, location/truck/lot FKs.
3. Series windows are bounded (default 30 days); longer horizons use
   explicit pagination, never a single unbounded pull.
4. There is **no API route** returning raw `movements` for dashboard
   charts; the only movement rows a client can read are the timeline
   feature's own bounded, pageable query (Fase 9) — never for
   statistics.
5. Refresh: live KPIs poll the same change signals as the operational
   map (Fase 11); chart series refresh on a throttle (default 60s) or
   on explicit user refresh. The client never recomputes aggregates
   from history it downloaded.

## No fake data

- The dashboard renders real aggregates only. Demo/sample data is never
  seeded into the real path (repo doctrine); any future demo uses an
  isolated, clearly-labeled non-production channel and is excluded from
  dashboard queries by construction (separate project/database).

## Permissions

- Dashboard read: `warehouse.read` + the module read code of each card
  (`truck.read`, `cargo.read`, `scanner.read`, `scale.read`,
  `quarantine.read`, `seizure.read`). A card the user cannot read is
  hidden — no partial aggregate leakage via a "summary" that mixes
  modules.
- Views are read-only; RLS/RBAC unchanged (asserted in
  `rls.md`/`rbac.md`).