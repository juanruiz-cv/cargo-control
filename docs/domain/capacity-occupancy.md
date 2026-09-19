# Capacity & Occupancy — Specification (Fase 5 / Prompt 06)

Per-location capacity and occupancy for `cargo-control`. Decision record:
`docs/adr/0006-capacity-occupancy-invariants.md`. Schema:
`docs/architecture/database.md` (v3 deltas). Tests:
`docs/qa/capacity-occupancy-tests.md`.

## 1. Overview

Every location may carry three **optional** capacity dimensions:

| Dimension | Column | Example |
| --------- | ------ | ------- |
| Weight | `capacity_max_kg` | 20 000 kg |
| Volume | `capacity_max_volume_m3` | 120 m³ |
| Units | `capacity_max_units` | 500 units |

For each dimension the system shows **maximum / used / available / %**:

```
Sector 4 — 20 000 kg max · 12 400 kg used · 7 600 kg available · 62 %
```

Occupancy is **derived from `item_lots`** (D7) — it is never stored, so the
editor cannot corrupt it and no app bug can bloat it. The database enforces
every invariant atomically (ADR 0006).

## 2. Capacity model

- `NULL` capacity = **unlimited** (no guard, renders as `—`).
- `>= 0` capacity = guarded. `0` allows an empty location only.
- Capacity lives on `locations` (operational truth); the floor plan editor
  edits the same columns through its Properties panel → identical guards and
  audit apply.

## 3. Occupancy derivation

A dimension is computed over lots **at rest at the location**
(`item_lots.current_location_id = X`) at identity time:

```
occupancy_kg    = Σ quantity × COALESCE(lot.unit_weight_kg,  item.unit_weight_kg)
occupancy_m3    = Σ quantity × COALESCE(lot.unit_volume_m3,  item.unit_volume_m3)
occupancy_units = Σ quantity  WHERE uom = 'unit'
```

| Rule | Effect |
| ---- | ------ |
| Holds count | `in_quarantine` and `seized` lots occupy physical space → they count toward every dimension they have data for |
| Trucks don't | lots with `current_truck_id` are not in the location → excluded |
| Missing weight/volume | lot contributes 0 to that dimension and is counted in `missing_weight_lots` / `missing_volume_lots` (data-quality flag, see §6) |
| Units uom | only `uom = 'unit'` lots count toward units; bulk (kg, m³, l) is covered by the weight/volume dimensions |
| Decimals | quantities and weights/volumes are numeric; fractional units allowed only when the uom permits them (ADR 0003) |

## 4. The four metrics

Per dimension, all read-side projections of capacity and occupancy:

| Metric | Formula | `NULL` capacity |
| ------ | ------- | --------------- |
| Maximum | `capacity_*` | — |
| Used | `occupancy_*` (view) | still shown (used data is real) |
| Available | `capacity_* − occupancy_*` | `NULL` (unlimited) |
| Occupancy % | `occupancy_* / capacity_* × 100` | `NULL` |

Example (weight dimension): capacity 20 000 kg, used 12 400 kg →
available 7 600 kg, 62 %.

**Read path:** UI consumes `location_occupancy` view, never recomputes sums.

## 5. Invariants (enforced)

| # | Invariant | Enforcement | Rejection |
| - | --------- | ----------- | --------- |
| I1 | `quantity > 0` | `CHECK` on `item_lots.quantity` (v3 keeps v2) | exception |
| I2 | `capacity_* >= 0` or `NULL` | `CHECK` on `locations` (v2) | exception |
| I3 | occupancy ≤ capacity per known dimension at placement | `lot_placement_capacity_guard` trigger | placement rejected |
| I4 | no capacity reduction below current occupancy | `locations_capacity_guard` trigger | update rejected |
| I5 | occupancy == capacity is allowed | both trigger guards | — (allowed) |
| I6 | `NULL → value` requires occupancy ≤ value; `value → NULL` always allowed | `locations_capacity_guard` | `NULL → value` below occupancy rejected |
| I7 | rejected operations write nothing and are not audited (attempt ≠ change) | trigger exception | — |

Rejection always fails the whole transaction — a split that would overflow one
destination rolls back the split.

## 6. Occupancy view

```sql
create view public.location_occupancy as
select
  l.id                  as location_id,
  l.organization_id,
  l.facility_id,
  l.code,
  -- used (derived)
  coalesce(w.kg, 0)     as occupancy_kg,
  coalesce(v.m3, 0)     as occupancy_m3,
  coalesce(u.units, 0)  as occupancy_units,
  -- data quality
  coalesce(w.missing_weight, 0) as missing_weight_lots,
  coalesce(v.missing_volume, 0) as missing_volume_lots,
  -- capacity
  l.capacity_max_kg,
  l.capacity_max_volume_m3,
  l.capacity_max_units,
  -- available / percent (NULL when capacity is NULL)
  l.capacity_max_kg        - coalesce(w.kg, 0) as available_kg,
  l.capacity_max_volume_m3 - coalesce(v.m3, 0) as available_m3,
  l.capacity_max_units     - coalesce(u.units,0) as available_units,
  case when l.capacity_max_kg is not null
    then round(coalesce(w.kg,0) / l.capacity_max_kg * 100, 1) end as pct_kg,
  case when l.capacity_max_volume_m3 is not null
    then round(coalesce(v.m3,0) / l.capacity_max_volume_m3 * 100, 1) end as pct_m3,
  case when l.capacity_max_units is not null
    then round(coalesce(u.units,0) / l.capacity_max_units * 100, 1) end as pct_units
from            public.locations l
left join (select current_location_id,
                  sum(quantity * coalesce(unit_weight_kg, item.unit_weight_kg)) as kg,
                  count(*) filter (where unit_weight_kg is null
                                    and item.unit_weight_kg is null) as missing_weight
           from   public.item_lots
           join   public.cargo_items item on item.id = item_lots.cargo_item_id
           where  current_location_id is not null
           group  by current_location_id) w on w.current_location_id = l.id
left join (select current_location_id,
                  sum(quantity * coalesce(unit_volume_m3, item.unit_volume_m3)) as m3,
                  count(*) filter (where unit_volume_m3 is null
                                    and item.unit_volume_m3 is null) as missing_volume
           from   public.item_lots
           join   public.cargo_items item on item.id = item_lots.cargo_item_id
           where  current_location_id is not null
           group  by current_location_id) v on v.current_location_id = l.id
left join (select current_location_id, sum(quantity) as units
           from   public.item_lots
           where  current_location_id is not null
             and  uom = 'unit'
           group  by current_location_id) u on u.current_location_id = l.id;
```

## 7. Enforcement triggers (DDL outline)

```sql
-- I4/I6: capacity reduction guard
create or replace function public.locations_capacity_guard() returns trigger as $$
declare o public.location_occupancy;  -- (illustrative; resolve against the view)
begin
  select * into o from public.location_occupancy where location_id = new.id;
  if new.capacity_max_kg is not null
     and (old.capacity_max_kg is distinct from new.capacity_max_kg)
     and o.occupancy_kg > new.capacity_max_kg then
    raise exception 'capacity_max_kg below current occupancy (%)', o.occupancy_kg;
  end if;
  -- same guard for capacity_max_volume_m3 and capacity_max_units
  return new;
end $$ language plpgsql;

create trigger locations_capacity_guard_trg
  before update of capacity_max_kg, capacity_max_volume_m3, capacity_max_units
  on public.locations
  for each row execute function public.locations_capacity_guard();

-- I3: placement guard (INSERT/UPDATE of placement-sensitive columns)
create or replace function public.lot_placement_capacity_guard() returns trigger as $$
declare o public.location_occupancy; -- occupancy of the destination WITHOUT new
begin
  if new.current_location_id is null then return new; end if;
  perform 1 from public.locations where id = new.current_location_id for update; -- serialize
  -- compute destination occupancy excluding new, then add new's contribution;
  -- reject if any known capacity would be exceeded (details in test spec T-01..T-22)
  return new;
end $$ language plpgsql;

create trigger lot_placement_capacity_guard_trg
  before insert or update of current_location_id, quantity,
                          unit_weight_kg, unit_volume_m3, uom
  on public.item_lots
  for each row execute function public.lot_placement_capacity_guard();

-- I7-adjacent: audit every accepted capacity change
create or replace function public.locations_capacity_audit() returns trigger as $$
begin
  insert into public.audit_log (organization_id, actor_id, action, entity_type, entity_id,
                                before, after, reason, created_at)
  values (new.organization_id, nullif(current_setting('app.actor_id', true), '')::uuid,
          'capacity.set', 'location', new.id::text,
          jsonb_build_object('kg', old.capacity_max_kg, 'm3', old.capacity_max_volume_m3,
                             'units', old.capacity_max_units),
          jsonb_build_object('kg', new.capacity_max_kg, 'm3', new.capacity_max_volume_m3,
                             'units', new.capacity_max_units),
          null, now());
  return new;
end $$ language plpgsql;

create trigger locations_capacity_audit_trg
  after update of capacity_max_kg, capacity_max_volume_m3, capacity_max_units
  on public.locations
  for each row execute function public.locations_capacity_audit();
```

Notes:
- The actor id travels in a session GUC (`app.actor_id`) set by the Edge
  Function after auth — identity is never trusted from the client body.
- Both guard triggers run **in the same transaction** as the mutation: a
  rejected move or edit leaves zero side effects.
- `locations_capacity_audit` runs only when the update **accepted** (the
  guard trigger already failed otherwise) and skips no-op writes with
  `IS DISTINCT FROM` semantics on the guarded columns.

## 8. Concurrency

- Placement guard locks the destination `locations` row `FOR UPDATE`,
  serializing concurrent placements into the same sector.
- Capacity edits take a row lock implicitly (UPDATE) → a concurrent reduction
  and placement cannot interleave.
- Stronger guarantees (SERIALIZABLE isolation) are a future option if hot-spot
  contention appears; the MVP contract is "no overflow, no under-cut".

## 9. Edge cases

| Case | Behavior |
| ---- | -------- |
| occupancy == capacity | allowed both directions (placement and capacity edit) |
| capacity = 0 | any placement with `quantity > 0` and known data rejected |
| capacity NULL | unlimited; used still displayed |
| unknown weight/volume | that dimension not guarded; `missing_*` flags raised |
| hold lots (quarantine/seizure) | count normally (they occupy space) |
| lot moved out (transfer/load_out) | occupancy recomputed; freed capacity usable immediately |
| partial discharge | lots remaining `on_truck` never count; discharged part counted at its location |
| split on a placed lot | Σ quantities unchanged; occupancy of destination recheck |
| capacity edited via floor plan editor | same guard + audit as any other update (ADR 0005 path) |

## 10. Presentation (read path)

- Location list/sector card shows the four metrics per enabled dimension
  (non-NULL capacity) or a single used line when capacity is NULL.
- Warning states: ≥ 80 % (warning token), ≥ 100 % (danger block) — 100 % is
  legal (I5); a `missing_weight_lots`/`missing_volume_lots` > 0 shows a
  data-quality badge instead of a false "0 used".
- Overflow attempts show the exact rejected dimension and current used value.

## 11. Future evolution

- UOM conversion catalog → units capacity for pallets/bundles and mixed uoms.
- Capacity history graph from `audit_log` `capacity.set` rows.
- Hard vs soft limits (warning percent as configurable per location).
- SERIALIZABLE isolation or advisory-lock sharding under hot-spot contention.

## Files

- Decisions: `docs/adr/0006-capacity-occupancy-invariants.md`
- Schema: `docs/architecture/database.md` §4.2, §4.6, §7, §8
- Rules: `docs/domain/business-rules.md` §10
- Tests: `docs/qa/capacity-occupancy-tests.md`