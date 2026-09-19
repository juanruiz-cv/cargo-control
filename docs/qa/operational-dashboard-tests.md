# Operational Dashboard — Test Specification (Fase 12 / Prompt 13)

Executable as SQL scripts / RLS integration tests against Supabase local
(E2E cases against the web client when it exists). Builds on the Fase 5
capacity spec (C-*), the Fase 7 trucks spec (T-*), the Fase 9 movement
engine spec (ME-*) and the Fase 10 special areas spec (SA-*); names here
are DB-* (dashboard).

Fixture: org `o1` with `u_admin`, `u_op`, `u_viewer`, `u_supervisor`;
facility with sectors (with capacities), scanner/scale checkpoints,
playón; trucks `T1..Tn`; lots with weights/volumes; movements as needed.

## A. KPI — camiones

| ID | Scenario | Expected |
| -- | -------- | -------- |
| DB-01 | one truck arrived, no egress | "dentro del predio" = 1 |
| DB-02 | truck `WAITING` (arrival, no open ops) | "esperando" = 1 |
| DB-03 | truck with discharge/split open + on-truck lots remain (`PARTIALLY_UNLOADED`) | "descargas en proceso" counts it |
| DB-04 | truck after `egress` | no longer counted in predio/esperando/descargas |
| DB-05 | truck `in_route` (no arrival) | not counted anywhere |
| DB-06 | out_of_service / inspection trucks | not counted (pass-through, no yard KPI) |

## B. KPI — mercadería

| ID | Scenario | Expected |
| -- | -------- | -------- |
| DB-10 | lot `in_warehouse` | "almacenada" sums its qty/weight |
| DB-11 | lot pending at scanner (`station_queue` kind=scan) | "en Scanner" counts it |
| DB-12 | lot pending at balanza (kind=scale) | "en Balanza" counts it |
| DB-13 | open quarantine hold (`hold_open`) | "en Rezago" counts it |
| DB-14 | open seizure hold (`hold_open`) | "secuestrada" counts it |
| DB-15 | lot with both open scanner op and hold | appears in both its respective cards (independent derivations) |
| DB-16 | hold resolved (`release`) | leaves the Rezago/Secuestro card; appears in stored/free as placed |

## C. KPI — sectores

| ID | Scenario | Expected |
| -- | -------- | -------- |
| DB-20 | sector with occupancy > 0 on any dimension | "sectores ocupados" increments |
| DB-21 | sector with occupancy = 0 on all known dimensions | "sectores libres" increments |
| DB-22 | sector with NULL capacities and 0 lots | free (0) |
| DB-23 | sector with only missing weight/volume lots (D7) | flagged card, not counted as occupied via unknown dimension |
| DB-24 | maintenance sector (`locations.maintenance=true`) | dashboard KPI keeps it as a sector; map state shows MANTENIMIENTO (card is sector-state agnostic or counts real occupancy only) |

## D. Charts — server-side aggregation

| ID | Scenario | Expected |
| -- | -------- | -------- |
| DB-30 | three `arrival` movements on day D1, two on D2 | series returns (D1,3),(D2,2) — no per-movement rows |
| DB-31 | movements across kinds | series returns per-day per-kind counts |
| DB-32 | trucks egressed on a day | "camiones procesados" = distinct truck count that day |
| DB-33 | quantity moved per day | `sum(movement_items.quantity)` per day bucket |
| DB-34 | day boundary in facility timezone | rows bucket by facility-local day (helper `day_bucket`), not UTC blindly |
| DB-35 | window default 30d | series caps at 30 days; older data excluded without explicit window |
| DB-36 | window selector 7/15/30/90 | requested window returned; no client-side accumulation |
| DB-37 | no raw-history route | any attempt to fetch `movements` for charts (beyond the bounded timeline page) is denied/absent |
| DB-38 | occupancy snapshot | pct rows match `location_occupancy` exactly |

## E. No fake data

| ID | Scenario | Expected |
| -- | -------- | -------- |
| DB-40 | empty organization | all cards 0, charts empty-state; no invented sample series |
| DB-41 | demo/sample dataset exists (isolated channel, if any) | excluded from real dashboard queries by construction |
| DB-42 | assert fixture/seed code | no script seeds fake operational data into the real path |

## F. Permissions & isolation

| ID | Scenario | Expected |
| -- | -------- | -------- |
| DB-50 | viewer with `warehouse.read` only | sees sector/camiones cards; hidden scanner/scale/holds cards (no partial leak) |
| DB-51 | operator without `quarantine.read` | Rezago/Secuestro card hidden, not "0" |
| DB-52 | user without any dashboard read | route denied |
| DB-53 | org B cannot read org A aggregates | dashboard views filter by caller org; cross-org queries return no rows |
| DB-54 | series view for org A | rows only for org A |

## G. Edge cases

| ID | Scenario | Expected |
| -- | -------- | -------- |
| DB-60 | zero movements in window | charts show empty state / explicit zeros, no gaps confusion |
| DB-61 | rapid updates during refresh | cards and charts converge to latest committed state; no optimistic overlay (Fase 11 convention) |
| DB-62 | realtime down | short-poll fallback keeps KPIs current; error surfaced; no stale-fake fallback |
| DB-63 | large history present | server-side aggregation only; client receives aggregated rows (assert payload shape) |
| DB-64 | trucks with no manifest | pass-through display codes count correctly (no crash, no phantom KPI) |