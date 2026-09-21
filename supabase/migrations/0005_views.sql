-- =====================================================================
-- Cargo Control — 0005_views.sql
-- =====================================================================
-- Derived read-side views. ALL created with security_invoker = true so the
-- base tables' RLS policies apply (rls.md matrix row 68, authorization.md
-- §4) — no accidental read path around RLS. Views expose aggregated/derived
-- rows only; the client never receives raw history for statistics
-- (operational-dashboard.md §Aggregation views, ADR 0013).
--
-- Coverage (schema versions in database.md §7):
--   v3  location_occupancy            (database.md §4.2 / capacity-occupancy.md §6)
--   v6  station_queue, hold_open      (special-areas.md §Derived views, database.md §v6)
--   v8  dashboard_metrics, dashboard_series_* (arrivals, movements,
--       trucks_processed, merchandise_processed), dashboard_occupancy_snapshot
--       (operational-dashboard.md, database.md §v8)
--
-- TODO DECISION (registered): only location_occupancy has pinned DDL in the
-- docs. station_queue / hold_open / dashboard_* are documented precisely at
-- the metric-leveL but without exact SQL; the implementations below follow
-- the documented descriptions and derivation formulas literally, and must be
-- cross-checked against the read-model layer when it lands.
--
-- TODO DECISION (registered): "facility-timezone day bucketing" (QA DB-34,
-- operational-dashboard.md §Chart series, day_bucket helper contract) has no
-- timezone source column anywhere in the schema. day_bucket() below buckets
-- in the session timezone as a placeholder; re-point the function to the
-- facility timezone once a timezone source exists (facilities/facility zone).
-- =====================================================================

-- ---------------------------------------------------------------------
-- day_bucket(ts): single day-bucketing choke point for all series views
-- (operational-dashboard.md §Chart series). See header TODO DECISION.
-- ---------------------------------------------------------------------
create or replace function public.day_bucket(_ts timestamptz) returns timestamptz
language sql immutable set search_path = '' as $$
  select date_trunc('day', _ts)
$$;

-- ---------------------------------------------------------------------
-- v3: Per-location occupancy (database.md §4.2 / capacity-occupancy.md §6)
-- Occupancy is derived, never stored (D7). SQL transcribed verbatim from
-- database.md:217-254; only `with (security_invoker = true)` added
-- (authorization.md §4):
--   weight = Σ qty × COALESCE(lot.unit_weight_kg,  item.unit_weight_kg)
--   volume = Σ qty × COALESCE(lot.unit_volume_m3,  item.unit_volume_m3)
--   units  = Σ qty WHERE uom = 'unit'
-- Lots on a truck never count; holds count; missing weight/volume data is
-- flagged (missing_*_lots), not summed as zero.
-- ---------------------------------------------------------------------
create or replace view public.location_occupancy
with (security_invoker = true) as
  select l.id as location_id, l.organization_id, l.facility_id, l.code,
    coalesce(w.kg, 0)    as occupancy_kg,
    coalesce(v.m3, 0)    as occupancy_m3,
    coalesce(u.units, 0) as occupancy_units,
    coalesce(w.missing_weight, 0) as missing_weight_lots,
    coalesce(v.missing_volume, 0) as missing_volume_lots,
    l.capacity_max_kg, l.capacity_max_volume_m3, l.capacity_max_units,
    l.capacity_max_kg        - coalesce(w.kg, 0) as available_kg,
    l.capacity_max_volume_m3 - coalesce(v.m3, 0) as available_m3,
    l.capacity_max_units     - coalesce(u.units, 0) as available_units,
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

-- ---------------------------------------------------------------------
-- v6: Pending station queues (special-areas.md §Derived views, database.md §v6)
-- Lots currently placed at a scan/scale checkpoint without a completed
-- operation row FOR THAT PLACEMENT, with item/manifest context for the
-- station operator.
--
-- "For the placement" is interpreted as: no operation whose movement is the
-- movement that placed the lot at its current checkpoint. Placement and
-- operation land in the same engine transaction (movement-engine.md
-- §Transactional), so the operation's movement_id matches the placement
-- movement_item's movement_id.
-- TODO DECISION: if a non-success result (error/ambiguous) must keep the lot
-- pending, add `and so.result = 'success'` (and the scale analogue `... and
-- so.within_tolerance` for tolerance failures) to the NOT EXISTS below.
-- ---------------------------------------------------------------------
create or replace view public.station_queue
with (security_invoker = true) as
  select 'scan' as queue_kind,
         l.id as item_lot_id, l.organization_id, l.manifest_id, l.cargo_item_id,
         l.status as lot_status, l.quantity, l.uom,
         loc.id as checkpoint_location_id, loc.code as checkpoint_code,
         ci.sku, ci.description as item_description,
         cm.code as manifest_code, cm.truck_id,
         l.created_at
  from public.item_lots l
  join public.locations loc   on loc.id = l.current_location_id
  join public.cargo_items ci  on ci.id = l.cargo_item_id
  join public.cargo_manifests cm on cm.id = l.manifest_id
  where loc.type = 'checkpoint'
    and loc.checkpoint_kind = 'scan'
    and not exists (
      select 1
      from public.scanner_operations so
      where so.item_lot_id = l.id
        and so.movement_id = (
          select mi.movement_id
          from public.movement_items mi
          where mi.item_lot_id = l.id
            and mi.to_location_id = l.current_location_id
          order by mi.id desc
          limit 1))
  union all
  select 'scale' as queue_kind,
         l.id as item_lot_id, l.organization_id, l.manifest_id, l.cargo_item_id,
         l.status as lot_status, l.quantity, l.uom,
         loc.id as checkpoint_location_id, loc.code as checkpoint_code,
         ci.sku, ci.description as item_description,
         cm.code as manifest_code, cm.truck_id,
         l.created_at
  from public.item_lots l
  join public.locations loc   on loc.id = l.current_location_id
  join public.cargo_items ci  on ci.id = l.cargo_item_id
  join public.cargo_manifests cm on cm.id = l.manifest_id
  where loc.type = 'checkpoint'
    and loc.checkpoint_kind = 'scale'
    and not exists (
      select 1
      from public.scale_operations so
      where so.item_lot_id = l.id
        and so.movement_id = (
          select mi.movement_id
          from public.movement_items mi
          where mi.item_lot_id = l.id
            and mi.to_location_id = l.current_location_id
          order by mi.id desc
          limit 1));

-- ---------------------------------------------------------------------
-- v6: Open holds (special-areas.md §Derived views, database.md §v6)
-- Open rezago/secuestro cases with lot/item/manifest context — frozen /
-- blocked visibility for dashboards and the operational map.
-- TODO DECISION: the rezago "cantidad" column is documented as "Σ leaf lots
-- of the item at the held placement" (special-areas.md §REZAGO); the case
-- row references a single item_lot_id, so quantity here is that lot's own
-- quantity. Re-point to the Σ-leaf derivation in the read model if a case
-- is later documented to cover sibling lots.
-- ---------------------------------------------------------------------
create or replace view public.hold_open
with (security_invoker = true) as
  select 'quarantine' as hold_type,
         q.id as operation_id, q.organization_id, q.item_lot_id,
         q.status, q.reason, null::text as legal_ref,
         q.opened_by, q.opened_at, q.resolution_note,
         l.manifest_id, l.cargo_item_id, l.current_location_id, l.current_truck_id,
         l.status as lot_status, l.quantity, l.uom,
         ci.sku, ci.description as item_description, cm.code as manifest_code
  from public.quarantine_operations q
  join public.item_lots l  on l.id = q.item_lot_id
  join public.cargo_items ci on ci.id = l.cargo_item_id
  join public.cargo_manifests cm on cm.id = l.manifest_id
  where q.status = 'open'
  union all
  select 'seizure' as hold_type,
         s.id as operation_id, s.organization_id, s.item_lot_id,
         s.status, null::text as reason, s.legal_ref,
         s.opened_by, s.opened_at, s.resolution_note,
         l.manifest_id, l.cargo_item_id, l.current_location_id, l.current_truck_id,
         l.status as lot_status, l.quantity, l.uom,
         ci.sku, ci.description as item_description, cm.code as manifest_code
  from public.seizure_operations s
  join public.item_lots l   on l.id = s.item_lot_id
  join public.cargo_items ci on ci.id = l.cargo_item_id
  join public.cargo_manifests cm on cm.id = l.manifest_id
  where s.status = 'open';

-- ---------------------------------------------------------------------
-- v8: Dashboard metric derivations (operational-dashboard.md §Metric
-- derivations + states.md display map, database.md §v8)
-- One aggregated row per organization. KPI column names map 1:1 to the
-- derivations table (1 trucks_in_yard, 2 trucks_waiting,
-- 3 trucks_discharging, 4 merchandise_stored (qty + weight),
-- 5 merchandise_in_scanner, 6 merchandise_in_scale,
-- 7 merchandise_in_quarantine, 8 merchandise_seized,
-- 9 sectors_occupied, 10 sectors_free).
-- TODO DECISION: truck KPIs replicate the ADR 0008 display-map precedence
-- (states.md §truck_status) in SQL; the exact signal precedence is a
-- read-model concern and must be cross-checked when that layer lands.
-- ---------------------------------------------------------------------
create or replace view public.dashboard_metrics
with (security_invoker = true) as
  select
    orgs.id as organization_id,
    -- 1. trucks arrived, no egress yet — any arrival with no egress AFTER it
    --    (states.md codes ARRIVED..READY_TO_EXIT + open-ops codes)
    (select count(*)
     from (
       select distinct t.id
       from public.trucks t
       join public.cargo_manifests cm on cm.truck_id = t.id
       join public.movements m on m.manifest_id = cm.id
       where t.organization_id = orgs.id
         and m.kind = 'arrival'
         and not exists (
           select 1
           from public.movements m2
           join public.cargo_manifests cm2 on cm2.id = m2.manifest_id
           where cm2.truck_id = t.id
             and m2.kind = 'egress'
             and (m2.occurred_at > m.occurred_at
                  or (m2.occurred_at = m.occurred_at and m2.id > m.id)))) s)
      as trucks_in_yard,
    -- 2. WAITING: base 'available' + latest movement 'arrival' + no open
    --    ops (no movement after arrival, no open holds, no pending queue)
    (select count(*)
     from (
       select distinct t.id
       from public.trucks t
       join public.cargo_manifests cm on cm.truck_id = t.id
       join public.movements m on m.manifest_id = cm.id
       where t.organization_id = orgs.id
         and t.status = 'available'
         and m.kind = 'arrival'
         and not exists (
           -- no movement after this arrival (it IS the latest)
           select 1
           from public.movements m2
           join public.cargo_manifests cm2 on cm2.id = m2.manifest_id
           where cm2.truck_id = t.id
             and (m2.occurred_at > m.occurred_at
                  or (m2.occurred_at = m.occurred_at and m2.id > m.id)))
         and not exists (
           -- no open rezago/secuestro on the truck's lots
           select 1
           from public.item_lots l
           join public.cargo_manifests cm3 on cm3.id = l.manifest_id
           where cm3.truck_id = t.id
             and (l.status in ('in_quarantine','seized')))
         and not exists (
           -- no pending station queue for the truck's lots
           select 1
           from public.item_lots l4
           join public.cargo_manifests cm4 on cm4.id = l4.manifest_id
           where cm4.truck_id = t.id
             and l4.id in (select sq.item_lot_id from public.station_queue sq
                           where sq.organization_id = orgs.id))) s)
      as trucks_waiting,
    -- 3. IN_PROCESS (latest movement discharge/split/transfer/store) OR
    --    PARTIALLY_UNLOADED (discharge/split movements exist AND on-truck
    --    lots remain)
    (select count(*)
     from (
       -- IN_PROCESS
       select t.id
       from public.trucks t
       join public.cargo_manifests cm on cm.truck_id = t.id
       join public.movements m on m.manifest_id = cm.id
       where t.organization_id = orgs.id
         and m.kind in ('discharge','split','transfer','store')
         and not exists (
           select 1
           from public.movements m2
           join public.cargo_manifests cm2 on cm2.id = m2.manifest_id
           where cm2.truck_id = t.id
             and (m2.occurred_at > m.occurred_at
                  or (m2.occurred_at = m.occurred_at and m2.id > m.id)))
       union
       -- PARTIALLY_UNLOADED
       select t.id
       from public.trucks t
       join public.cargo_manifests cm on cm.truck_id = t.id
       join public.movements m on m.manifest_id = cm.id
       join public.item_lots l on l.manifest_id = cm.id
       where t.organization_id = orgs.id
         and m.kind in ('discharge','split')
         and l.current_truck_id = t.id) s)
      as trucks_discharging,
    -- 4. merchandise stored: item_lots with status 'in_warehouse'
    (select coalesce(sum(l.quantity), 0)
     from public.item_lots l
     where l.status = 'in_warehouse' and l.organization_id = orgs.id)
      as merchandise_stored,
    (select coalesce(sum(l.quantity * coalesce(l.unit_weight_kg, ci.unit_weight_kg)), 0)
     from public.item_lots l
     join public.cargo_items ci on ci.id = l.cargo_item_id
     where l.status = 'in_warehouse' and l.organization_id = orgs.id)
      as merchandise_stored_weight_kg,
    -- 5/6. pending station queues (Fase 10 derived views)
    (select coalesce(sum(sq.quantity), 0)
     from public.station_queue sq
     where sq.organization_id = orgs.id and sq.queue_kind = 'scan')
      as merchandise_in_scanner,
    (select coalesce(sum(sq.quantity), 0)
     from public.station_queue sq
     where sq.organization_id = orgs.id and sq.queue_kind = 'scale')
      as merchandise_in_scale,
    -- 7/8. open holds (Fase 10 derived views)
    (select coalesce(sum(ho.quantity), 0)
     from public.hold_open ho
     where ho.organization_id = orgs.id and ho.hold_type = 'quarantine')
      as merchandise_in_quarantine,
    (select coalesce(sum(ho.quantity), 0)
     from public.hold_open ho
     where ho.organization_id = orgs.id and ho.hold_type = 'seizure')
      as merchandise_seized,
    -- 9/10. sectors by occupied/free (location_occupancy any-dimension > 0)
    (select count(*) from public.location_occupancy lo
     where lo.organization_id = orgs.id
       and (lo.occupancy_kg > 0 or lo.occupancy_m3 > 0 or lo.occupancy_units > 0))
      as sectors_occupied,
    (select count(*) from public.location_occupancy lo
     where lo.organization_id = orgs.id
       and not (lo.occupancy_kg > 0 or lo.occupancy_m3 > 0 or lo.occupancy_units > 0))
      as sectors_free
  from public.organizations orgs;

-- ---------------------------------------------------------------------
-- v8: Chart series (operational-dashboard.md §Chart series, database.md §v8)
-- Aggregated day rows only; windows are bounded by the caller (default 30d
-- in the client; explicit pagination for longer horizons). Indices
-- movements_org_time_idx / item_lots_*_idx cover the paths.
-- TODO DECISION: day bucketing uses day_bucket() (session timezone) until a
-- facility timezone source exists — see header TODO DECISION.
-- ---------------------------------------------------------------------
create or replace view public.dashboard_series_arrivals
with (security_invoker = true) as
  select m.organization_id,
         public.day_bucket(m.occurred_at) as liquidity_day,
         count(*) as arrivals
  from public.movements m
  where m.kind = 'arrival'
  group by m.organization_id, public.day_bucket(m.occurred_at)
  order by 1, 2;

create or replace view public.dashboard_series_movements
with (security_invoker = true) as
  select m.organization_id,
         public.day_bucket(m.occurred_at) as liquidity_day,
         m.kind,
         count(*) as movements
  from public.movements m
  group by m.organization_id, public.day_bucket(m.occurred_at), m.kind
  order by 1, 2, 3;

-- distinct trucks per day whose latest relevant movement is 'egress'
-- (per-day egreso count)
create or replace view public.dashboard_series_trucks_processed
with (security_invoker = true) as
  select m.organization_id,
         public.day_bucket(m.occurred_at) as liquidity_day,
         count(distinct cm.truck_id) as trucks_processed
  from public.movements m
  join public.cargo_manifests cm on cm.id = m.manifest_id
  where m.kind = 'egress' and cm.truck_id is not null
  group by m.organization_id, public.day_bucket(m.occurred_at)
  order by 1, 2;

-- sum(movement_items.quantity) per day through movements
create or replace view public.dashboard_series_merchandise_processed
with (security_invoker = true) as
  select m.organization_id,
         public.day_bucket(m.occurred_at) as liquidity_day,
         sum(mi.quantity) as merchandise_processed
  from public.movements m
  join public.movement_items mi on mi.movement_id = m.id
  group by m.organization_id, public.day_bucket(m.occurred_at)
  order by 1, 2;

-- occupancy pct rows from location_occupancy for chart/card rendering
-- (QA DB-38: pct rows match location_occupancy exactly)
create or replace view public.dashboard_occupancy_snapshot
with (security_invoker = true) as
  select lo.location_id, lo.organization_id, lo.facility_id, lo.code,
         lo.occupancy_kg, lo.occupancy_m3, lo.occupancy_units,
         lo.pct_kg, lo.pct_m3, lo.pct_units
  from public.location_occupancy lo
  where lo.pct_kg is not null or lo.pct_m3 is not null or lo.pct_units is not null
  order by lo.organization_id, lo.code;