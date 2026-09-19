# Capacity & Occupancy — Test Specification (Fase 5 / Prompt 06)

Executable as **SQL test scripts** against a Supabase local / empty PostgreSQL
(see `docs/qa/strategy.md`, Database layer). Each case lists its invariant
(§5 of `docs/domain/capacity-occupancy.md`), the exact action, and the
expected outcome. Execute inside a transaction and roll back after each case
unless the case itself commits.

## Fixture

```sql
-- one item with known weight/volume; uom = 'unit'
insert into public.cargo_manifests (id, organization_id, facility_id, code, status)
values ('m1', 'o1', 'f1', 'M-001', 'received');
insert into public.cargo_items (id, organization_id, manifest_id, line_number,
                                description, total_quantity, uom,
                                unit_weight_kg, unit_volume_m3)
values ('i1', 'o1', 'm1', 1, 'Boxes', 1000, 'unit', 10, 0.05);

-- Sector 4 with the canonical capacities
insert into public.locations (id, organization_id, facility_id, type, code,
                              capacity_max_kg, capacity_max_volume_m3, capacity_max_units)
values ('s4', 'o1', 'f1', 'zone', 'Sector 4', 20000, 120, 500);
```

Reference lot: 400 units at Sector 4 → 4 000 kg, 20 m³, 400 units.

## A. Placement limits

| ID | Precondition | Action | Expected |
| -- | ------------ | ------ | -------- |
| T-01 | empty Sector 4 | place lot 400 u (4 000 kg / 20 m³) | **OK**; view shows used 4000 / 20 / 400 |
| T-02 | Sector 4: 400 u placed | place lot 1600 u (16 000 kg/80 m³) | **OK**; occupancy exactly equals capacity (I5) |
| T-03 | Sector 4: 400 u placed | place lot 1600 u, weight 10 kg → 16 000 kg | **OK** volume/units within; weight exactly at cap (I5) |
| T-04 | Sector 4: 400 u placed | place lot 1600 u (16 000 kg) + second lot 100 u (1 000 kg) | **ERROR** weight: used 21 000 kg > 20 000 kg (I3) |
| T-05 | Sector 4: 400 u placed | place lot 1600 u (20 m³) + second lot 200 u (10 m³) | **ERROR** volume: used 30 m³ > 120 m³? no — detail: 400 u → 20 m³, 1600 u → 80 m³, 200 u → 10 m³ = 110 m³ OK; use 2000 u → 100 m³ → total 120 m³ OK; then +10 u → over 120.5 m³ | **ERROR** volume: used 120.5 m³ > 120 m³ (I3) |
| T-06 | Sector 4: 2600 u placed (2600 units ≤ 500? no) | use T-02 case then add 1000 u | **ERROR** units: used 2600 > 500 (I3) |
| T-07 | — | place lot with `quantity = -5` | **ERROR** CHECK `quantity > 0` (I1) |
| T-08 | — | place lot with `quantity = 0` | **ERROR** CHECK `quantity > 0` (I1) |
| T-09 | — | lot placed with `unit_weight_kg = -1` | **ERROR** CHECK `unit_weight_kg > 0` |
| T-10 | — | lot placed with `unit_volume_m3 = 0` | **ERROR** CHECK `unit_volume_m3 > 0` (0 disallowed; NULL allowed) |
| T-11 | capacity all `NULL` | place 10 000 u / 100 000 kg | **OK** (unlimited, I2) |
| T-12 | `capacity_max_units = 0` | place any filled lot (qty > 0) | **ERROR** units: used 1 > 0 (I3) |
| T-13 | Sector 4: 400 u placed | place lot 400 u **without weight** (`unit_weight_kg` NULL on lot and item) | **OK** for kg (0 used, missing_weight_lots = 1); blocked/measured by units & volume as usual |

## B. Capacity edits

| ID | Precondition | Action | Expected |
| -- | ------------ | ------ | -------- |
| T-14 | Sector 4: 400 u placed (used 4 000 kg) | `UPDATE ... SET capacity_max_kg = 10000` | **ERROR** reduction below occupancy 4 000 → allowed? 10 000 > 4 000 → **OK**; use 3 500 → **ERROR** (I4) |
| T-14a | Sector 4: used 4 000 kg | `SET capacity_max_kg = 3500` | **ERROR** capacity reduction below current occupancy (I4) |
| T-15 | Sector 4: used 4 000 kg | `SET capacity_max_kg = 4000` | **OK** (equal is allowed, I5) |
| T-16 | Sector 4: used 4 000 kg, capacity NULL | `SET capacity_max_kg = 3000` | **ERROR** NULL → value below occupancy (I6) |
| T-17 | Sector 4: used 4 000 kg, capacity 10 000 | `SET capacity_max_kg = NULL` | **OK** (unlimited, I6) |
| T-18 | Sector 4: used 4 000 kg | `SET capacity_max_kg = -1` | **ERROR** CHECK `capacity_* >= 0` (I2) |
| T-19 | Sector 4: used 4 000 kg | `SET capacity_max_volume_m3 = 5` (used 20) | **ERROR** volume reduction below occupancy (I4) |
| T-20 | Sector 4: used 4 000 kg | `SET capacity_max_kg = 20000` (same value) | **OK**; no audit row (no-op write skipped) |
| T-21 | Sector 4: used 4 000 kg | `SET capacity_max_kg = 25000` then place 600 u (6 000 kg → 10 000 total) | **OK** both steps |

## C. Occupancy semantics

| ID | Precondition | Action | Expected |
| -- | ------------ | ------ | -------- |
| T-22 | lot discharged to checkpoint (`discharged`), not Sector 4 | move to Sector 4 | occupancy recomputed: +400 units / +4 000 kg / +20 m³ |
| T-23 | lot 400 u at Sector 4; lot 300 u `on_truck` (current_truck_id) | read view | truck lot **not** counted: units 400 (300 excluded) |
| T-24 | lot 400 u at Sector 4, status set `in_quarantine` (`quarantine_operations` open) | read placement guard: try placing 100 u (5 000 kg → 9 000 kg) | **OK** if within; the hold lot still counts: used 5 000 kg incl. hold (I3 holds) |
| T-25 | sector with 100 u placed (1 000 kg) | transfer 100 u out (`current_location_id = NULL` / other location) | occupancy 0; freed capacity available immediately |
| T-26 | lot 400 u at Sector 4 | split 400 u → 200 + 200 at same location | occupancy unchanged (Σ quantities), still ≤ capacity |
| T-27 | partial discharge: item 1000 u, 600 u discharged to Sector 4, 400 u `on_truck` | read Sector 4 view | used = 600 units (not 1000); 400 on truck excluded |
| T-28 | lot 400 u (4 000 kg, 20 m³) | place second lot 100 u with **quantity 100, unit weight 1 000 kg, no volume** | **OK?** weight: 4 000 + 100 000 = 104 000 > 20 000 → **ERROR** weight (missing volume not relevant) |
| T-29 | mixed dims: used 4 000 kg, volume 20 m³, units 400 | place 50 u no weight data (unknown) | **OK** (kg unknown not guarded); units would be 450 ≤ 500; volume 22.5 ≤ 120 |

## D. Audit & concurrency

| ID | Precondition | Action | Expected |
| -- | ------------ | ------ | -------- |
| T-30 | — | `SET capacity_max_kg = 22000` (session actor set to user-42) | **OK**; `audit_log` row `action='capacity.set'`, `entity_type='location'`, `before/after` contain old/new kg; `actor_id = user-42` |
| T-31 | — | update of `capacity_max_kg` with same value | **OK**; **no** new audit row (T-20) |
| T-32 | — | rejected `SET capacity_max_kg = 3500` (T-14a) | **ERROR**; audit_log has **no** row for the failed attempt |
| T-33 | — | UPDATE of `locations.name` only | **OK**; no capacity audit row |
| T-34 | Sector 4 near capacity | two concurrent txns place lots that individually fit but together overflow | one **OK**, one **ERROR** after the row lock resolves (serialized, §8) |
| T-35 | — | attempt capacity UPDATE via RLS as `operator` role | **ERROR** permission denied (locations write: admin/supervisor/operator per rls.md — documented policy, assert per intended roll) |
| T-36 | — | `audit_log` UPDATE/DELETE attempted | **ERROR** append-only (no UPDATE/DELETE policies) |

## Definition of done (this doc)

- Every invariant I1–I7 (§5 of the capacity spec) maps to ≥ 1 test: I1 → T-07/08,
  I2 → T-18, I3 → T-04/05/06/29, I4 → T-14a/19, I5 → T-02/03/15,
  I6 → T-16/17, audit → T-30/31/32/33, concurrency → T-34, append-only → T-36.
- All cases run against the local database layer in CI (strategy.md Database
  layer); a failing case blocks the schema change.