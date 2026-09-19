# ADR 0013 — Operational Dashboard: server-side aggregation over real data

- **Status:** Accepted
- **Date:** 2026-09-19
- **Fase:** 12 — Dashboard operativo (Prompt 13)

## Context

Fase 12 builds the operational dashboard. It must show: trucks inside
the yard, trucks waiting, ongoing discharges, stored merchandise,
merchandise at Scanner/Balanza, merchandise in Rezago, seized
merchandise, occupied/free sectors. Charts: arrivals per day,
movements, occupancy, trucks processed, merchandise processed. No fake
data in production; every metric derives from the real database; the
queries must be optimized — never pull the whole history to the
frontend to compute statistics.

## Decisions

1. **The dashboard is a read-only aggregation layer over the existing
   model — zero new columns.** Every KPI maps to a real table or
   derived view already specified:
   - Yard trucks = trucks arrived without egress (Fase 7 display map;
     `ARRIVED`/`IN_PLAYON`/`IN_PROCESS`/`WAITING` etc.).
   - Waiting = `WAITING` display code; ongoing discharges =
     `IN_PROCESS`/`PARTIALLY_UNLOADED`.
   - Stored merchandise = `item_lots.status = 'in_warehouse'`;
     Scanner/Balanza queues = `station_queue` (kind scan/scale);
     Rezago/Secuestro = `hold_open` (quarantine/seizure).
   - Occupied/free sectors = `location_occupancy` occupancy > 0 / = 0.

2. **Charts are time-series aggregations computed in the database
   (PostgreSQL GROUP BY), never in the client.** The frontend receives
   only aggregated rows (day + count/sum), never raw movement rows.
   Base query definitions live in the schema as derived dashboard
   views (schema **v8**, read-only, RLS-guarded).

3. **No fake data, ever.** The dashboard exposes real aggregates only.
   The repo already asserts "no fictional data seeded that could be
   confused with production data"; the dashboard spec re-asserts it and
   guards demo/sample data behind an explicit non-production channel.

4. **Optimization is a contract, not a hint.** Indices exist for the
   aggregation paths (`movements_org_time_idx` on
   organization_id + occurred_at desc, plus location/truck/lot
   indices). The views push aggregation, filtering and day-bucketing
   into PostgreSQL; the client cannot request raw history. Where a
   series could grow unbounded, the view contract caps the window to
   the requested horizon (default 30 days), with pagination beyond it.

5. **Permissions reuse the catalog.** Dashboard read = `warehouse.read`
   (facilities, locations, layouts) + the module read codes required by
   each card (`truck.read`, `cargo.read`, `scanner.read`, `scale.read`,
   `quarantine.read`, `seizure.read`). Views are read-only through
   existing RLS. No new codes; RLS/RBAC unchanged (asserted).

## Consequences

- Schema v8 documents derived dashboard aggregate views; no DDL on
  user tables, no migrations beyond views.
- The dashboard shows facts that always match the operational screens
  because they share the same source tables.
- QA coverage includes: KPI correctness, series day-boundaries/timezone,
  server-side aggregation (assert no raw-history route), no-fake-data
  negative tests, permissions and org isolation.

## References

- ADR 0005 (layout), ADR 0006 (capacity & occupancy), ADR 0008 (trucks/
  display states), ADR 0010 (movement engine/timeline),
  ADR 0011 (special areas), ADR 0012 (operational map).